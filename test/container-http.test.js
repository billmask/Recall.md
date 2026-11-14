import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { Store } from '../src/core.js';
import { serve } from '../src/server.js';

test('Container HTTP: opt-in 0.0.0.0 aceita porta local remapeada e mantém Host/Origin', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-container-http-')), store = new Store(cwd); store.init();
  const server = await serve(store, 0, '0.0.0.0');
  t.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(cwd, { recursive: true, force: true }); });
  assert.equal(server.address().address, '0.0.0.0');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (host, origin) => new Promise((resolve, reject) => {
    const req = request(base + '/api/units', { method: 'POST', headers: { Host: host, Origin: origin, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end(JSON.stringify({ title: 'Etapa no contêiner' }));
  });
  assert.equal(await send('localhost:8642', 'http://localhost:8642'), 201);
  assert.equal(await send('127.0.0.1:8642', 'http://127.0.0.1:8642'), 201);
  assert.equal(await send('localhost:8642', 'https://outro-site.test'), 403);
  assert.equal(await send('outro-site.test:8642', 'http://outro-site.test:8642'), 403);
  assert.equal(await send('localhost.outro-site.test:8642', 'http://localhost.outro-site.test:8642'), 403);
  assert.equal(await send('localhost:99999', 'http://localhost:99999'), 403);
  await assert.rejects(serve(store, 0, '192.0.2.1'), /Host de escuta/);
});
