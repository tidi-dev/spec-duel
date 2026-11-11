#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildTimeline } from '../runs/tools/build-timeline.mjs';

const consoleDir = dirname(fileURLToPath(import.meta.url));
const CHANGES = { 1: 'Feature', 2: 'Brownfield change', 3: 'Bugfix' };
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/console.js': ['console.js', 'text/javascript; charset=utf-8'],
  '/scene-intros.js': ['scene-intros.js', 'text/javascript; charset=utf-8'],
  '/console.css': ['console.css', 'text/css; charset=utf-8'],
};
const SCREENSHOT = /^\/screenshots\/(openspec|speckit)\/(before|after)\.png$/;

const send = (response, status, type, body) => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
};

const sendJson = (response, status, value) => send(response, status, 'application/json; charset=utf-8', JSON.stringify(value));

export const createConsole = ({ runsDir, variantsDir }) =>
  createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    if (request.method !== 'GET') {
      return sendJson(response, 404, { message: 'Not found' });
    }
    if (STATIC[path]) {
      const [file, type] = STATIC[path];
      return send(response, 200, type, readFileSync(join(consoleDir, 'public', file)));
    }
    if (path === '/api/scenes') {
      return sendJson(
        response,
        200,
        Object.entries(CHANGES).map(([change, title]) => {
          const timeline = buildTimeline(runsDir, change, { variantsDir });
          return { change, title, recordedAt: timeline.recordedAt, kits: { openspec: timeline.kits.openspec.status, speckit: timeline.kits.speckit.status } };
        }),
      );
    }
    const sceneMatch = /^\/api\/scenes\/([123])$/.exec(path);
    if (sceneMatch) {
      return sendJson(response, 200, { title: CHANGES[sceneMatch[1]], ...buildTimeline(runsDir, sceneMatch[1], { variantsDir }) });
    }
    const screenshot = SCREENSHOT.exec(path);
    if (screenshot) {
      const file = join(runsDir, screenshot[1], 'change-3', `${screenshot[2]}.png`);
      return existsSync(file) ? send(response, 200, 'image/png', readFileSync(file)) : sendJson(response, 404, { message: 'Not found' });
    }
    return sendJson(response, 404, { message: 'Not found' });
  });

export const startConsole = ({ port, runsDir, variantsDir }) =>
  new Promise((resolveStart, reject) => {
    const server = createConsole({ runsDir, variantsDir });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveStart(server));
  });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '4300' } } });
  const root = resolve(consoleDir, '..');
  const server = await startConsole({ port: Number(values.port), runsDir: join(root, 'runs'), variantsDir: root });
  process.stderr.write(`Console: http://127.0.0.1:${server.address().port}\n`);
}
