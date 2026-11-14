import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensure, inside, parseMarkdown } from './core.js';

function markdownFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => {
    ensure(!e.isSymbolicLink(), 'Backlog contém link simbólico; vinculação recusada.');
    const target = path.join(root, e.name);
    return e.isDirectory() ? markdownFiles(target) : e.name.endsWith('.md') ? [target] : [];
  });
}
export function backlogContext(store, id) {
  const unit = store.get(id);
  const root = inside(store.cwd, 'backlog/tasks');
  const target = inside(root, unit.file);
  if (!fs.existsSync(target)) return { state: unit.backlog ? 'missing' : 'unlinked', file: `backlog/tasks/${unit.file}` };
  const { data, body } = parseMarkdown(fs.readFileSync(target, 'utf8'));
  ensure(typeof data.id === 'string' && /^[a-z0-9][a-z0-9.-]*$/i.test(data.id), 'ID da tarefa do Backlog inválido.');
  if (unit.backlog) ensure(unit.backlog.id.toLowerCase() === data.id.toLowerCase(), 'O caminho agora aponta para outra tarefa; vínculo anterior preservado. Revise a correspondência.', 409);
  const matches = markdownFiles(root).filter(f => String(parseMarkdown(fs.readFileSync(f, 'utf8')).data.id).toLowerCase() === data.id.toLowerCase());
  ensure(matches.length === 1, 'ID ambíguo no Backlog; vínculo não criado.', 409);
  const description = body.match(/<!-- SECTION:DESCRIPTION:BEGIN -->([\s\S]*?)<!-- SECTION:DESCRIPTION:END -->/)?.[1]?.trim()
    ?? body.match(/## Description\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';
  const acceptance = body.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.replace(/<!--[^]*?-->/g, '').trim() || '';
  const ref = `recall/tasks/${unit.file}`;
  const references = Array.isArray(data.references) ? data.references : [];
  return { state: references.includes(ref) ? 'linked' : 'pending', id: data.id, title: String(data.title || data.id), status: String(data.status || ''), description, acceptance, file: `backlog/tasks/${unit.file}`, reference: ref };
}
export function synchronize(store, id) {
  const ctx = backlogContext(store, id);
  if (['missing', 'unlinked'].includes(ctx.state)) return ctx;
  ensure(!ctx.reference.includes(','), 'Vírgula no caminho não é suportada pela CLI do Backlog; renomeie o arquivo.');
  if (ctx.state !== 'linked') {
    const command = store.config().backlogCommand || 'backlog';
    const result = spawnSync(command, ['task', 'edit', ctx.id, '--add-ref', ctx.reference, '--plain'], { cwd: store.cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, shell: false, env: { ...process.env, BACKLOG_CWD: store.cwd } });
    ensure(!result.error && result.status === 0, 'Não foi possível inserir o link pela CLI do Backlog.md. Configure backlogCommand em recall/config.yml e execute recall sync novamente.', 409);
    ensure(backlogContext(store, id).state === 'linked', 'Backlog.md não confirmou a referência após a alteração.', 409);
  }
  store.link(id, { id: ctx.id, file: ctx.file });
  return backlogContext(store, id);
}
export function autoLink(store, unit) {
  try { const context = synchronize(store, unit.id); return { unit: store.get(unit.id), context }; }
  catch (e) { return { unit, warning: e.message }; }
}
