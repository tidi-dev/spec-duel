import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startConsole } from '../server.mjs';

let server;
let base;

const record = (root, kit, change) => {
  const dir = join(root, kit, `change-${change}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'specify.record.json'),
    JSON.stringify({ kit, change: String(change), step: 'specify', phase: 'specify', round: 1, status: 'ok', startedAt: '2026-11-10T10:00:00.000Z', endedAt: '2026-11-10T10:00:01.000Z', wallMs: 1000, turns: 1, inputTokens: 1, outputTokens: 1, costUsd: 0.5 }),
  );
  writeFileSync(join(dir, 'specify.events.jsonl'), '');
};

before(async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'console-'));
  record(runsDir, 'openspec', 1);
  record(runsDir, 'speckit', 1);
  record(runsDir, 'speckit', 3);
  server = await startConsole({ port: 0, runsDir, variantsDir: runsDir });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('listens on the loopback address only', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('lists the three scenes with each kit status', async () => {
  const scenes = await (await fetch(`${base}/api/scenes`)).json();

  assert.deepEqual(scenes.map((scene) => scene.change), ['1', '2', '3']);
  assert.deepEqual(scenes[0].kits, { openspec: 'recorded', speckit: 'recorded' });
  assert.deepEqual(scenes[1].kits, { openspec: 'missing', speckit: 'missing' });
  assert.equal(scenes[0].title, 'Feature');
});

test('a scene with one kit missing still returns the other kit intact', async () => {
  const scene = await (await fetch(`${base}/api/scenes/3`)).json();

  assert.equal(scene.kits.openspec.status, 'missing');
  assert.equal(scene.kits.speckit.status, 'recorded');
  assert.equal(scene.kits.speckit.totals.costUsd, 0.5);
});

test('serves the page and its three assets, and nothing else from disk', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/console.js`)).status, 200);
  assert.equal((await fetch(`${base}/console.css`)).status, 200);
  const intros = await fetch(`${base}/scene-intros.js`);
  assert.equal(intros.status, 200);
  assert.match(intros.headers.get('content-type'), /^text\/javascript/);
  for (const path of ['/server.mjs', '/../server.mjs', '/api/scenes/..%2F..%2Fetc%2Fpasswd', '/api/scenes/9', '/api/scenes/1/extra', '/public/index.html']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
});

test('accepts only GET; any other method is refused', async () => {
  for (const path of ['/api/scenes', '/api/scenes/1', '/api/live/1']) {
    assert.equal((await fetch(`${base}${path}`, { method: 'POST', body: 'rm -rf /' })).status, 404, path);
  }
});
