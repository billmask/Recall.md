import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ensure, RecallError, STATUSES } from './core.js';
import { backlogContext, synchronize, autoLink } from './backlog.js';
const web = new URL('../web/', import.meta.url);

export function createServer(store, { devReload = false } = {}) {
  const devClients = new Set(), devWatchers = [];
  const devBootId = randomUUID();
  let devTimer;
  const devSend = payload => { const data = `data: ${JSON.stringify(payload)}\n\n`; for (const client of devClients) client.write(data); };
  if (devReload) {
    const watchDir = typeof devReload === 'string' ? devReload : fileURLToPath(web);
    devWatchers.push(fs.watch(watchDir, (_event, file) => {
      if (file && !/\.(html|js|css)$/.test(String(file))) return;
      clearTimeout(devTimer);
      devTimer = setTimeout(() => devSend({ type: 'reload' }), 100);
    }));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Cache-Control', 'no-store');
    const json = (data, status = 200) => { if (req.method !== 'GET' && status < 400 && data && !Array.isArray(data)) data = { ...data, transactionAt: Date.now() }; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const host = /^(localhost|127\.0\.0\.1)(?::([1-9]\d{0,4}))?$/.exec(req.headers.host || '');
      ensure(host && (!host[2] || Number(host[2]) <= 65535), 'Host inválido.', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const asset = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/study-model.js': ['study-model.js', 'text/javascript'], '/study-client.js': ['study-client.js', 'text/javascript'], '/study-ui.js': ['study-ui.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }[url.pathname];
        ensure(asset, 'Página não encontrada.', 404);
        let content = fs.readFileSync(fileURLToPath(new URL(asset[0], web)), 'utf8');
        if (devReload && url.pathname === '/') content = content.replace('<head>', `<head>\n<meta name="recall-dev-reload" content="${createHash('sha256').update(path.resolve(store.cwd)).digest('hex')}">`);
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(content); return;
      }
      let body = {};
      if (req.method !== 'GET') {
        ensure(req.headers.origin === `http://${req.headers.host}` || !req.headers.origin, 'Origem não permitida.', 403);
        ensure(req.headers['content-type']?.startsWith('application/json'), 'Use application/json.', 415);
        let raw = ''; for await (const chunk of req) { raw += chunk; ensure(Buffer.byteLength(raw) < 1024 * 1024, 'Requisição grande demais.', 413); }
        try { body = JSON.parse(raw || '{}'); } catch { throw new RecallError('JSON inválido.'); }
      }
      const id = parts[2];
      if (devReload && req.method === 'GET' && url.pathname === '/api/dev-reload') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'boot', id: devBootId })}\n\n`);
        devClients.add(res);
        req.on('close', () => devClients.delete(res));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const units = store.list().map(u => store.publicUnit(u));
        json({ projectId: store.projectIdentity(), name: store.config().name, statuses: STATUSES, units, cards: store.reviewQueue(), attempts: store.events('attempts'), assessments: store.events('assessments') }); return;
      }
      if (parts[1] === 'sessions') {
        if (req.method === 'GET' && parts.length === 2) { json(store.studySessions()); return; }
        if (req.method === 'GET' && parts.length === 3) { const session = store.studySessions().find(s => s.id === id); ensure(session, 'Sessão não encontrada.', 404); json(session); return; }
        if (req.method === 'POST' && parts.length === 2) { json(store.saveStudySession(body), 201); return; }
      }
      if (req.method === 'POST' && url.pathname === '/api/units') { const result = autoLink(store, store.save(body)); json({ ...result, unit: store.publicUnit(result.unit) }, 201); return; }
      if (parts[1] === 'units' && id) {
        if (req.method === 'PATCH' && parts.length === 3) { const result = autoLink(store, store.save(body, id)); json({ ...result, unit: store.publicUnit(result.unit) }); return; }
        if (req.method === 'GET' && parts[3] === 'context') { json(backlogContext(store, id)); return; }
        if (req.method === 'GET' && parts[3] === 'edit') { json(store.get(id)); return; }
        if (req.method === 'POST' && parts[3] === 'sync') { json(synchronize(store, id)); return; }
        if (req.method === 'POST' && parts[3] === 'attempts') { json(store.attempt(id, body.answers), 201); return; }
        if (req.method === 'POST' && parts[3] === 'cards') { json(store.publicUnit(store.cardFromQuestion(id, body.question)), 201); return; }
        if (req.method === 'POST' && parts[3] === 'reviews') { json(store.review(id, body.card, body.rating), 201); return; }
        if (req.method === 'GET' && parts[3] === 'source') {
          const ctx = backlogContext(store, id); ensure(!['missing', 'unlinked'].includes(ctx.state), 'Tarefa de origem indisponível.', 404);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(fs.readFileSync(`${store.cwd}/${ctx.file}`, 'utf8')); return;
        }
      }
      if (req.method === 'POST' && parts[1] === 'attempts' && id && parts[3] === 'assess') { json(store.assess(id, body.question, body.correct), 201); return; }
      throw new RecallError('Recurso não encontrado.', 404);
    } catch (e) { json({ error: e instanceof RecallError ? e.message : 'Falha ao ler ou gravar os dados. Verifique os arquivos do projeto.' }, e.status || 500); }
  });
  const close = server.close.bind(server);
  server.close = callback => {
    clearTimeout(devTimer);
    for (const watcher of devWatchers) watcher.close();
    for (const client of devClients) client.end();
    devClients.clear();
    return close(callback);
  };
  return server;
}
export async function serve(store, port = 6421, host = '127.0.0.1', options = {}) {
  ensure(['127.0.0.1', '0.0.0.0'].includes(host), 'Host de escuta: 127.0.0.1 ou 0.0.0.0.');
  const server = createServer(store, options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}
