#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { tokens: { type: 'string' }, note: { type: 'string' } },
});
const [phase, event] = positionals;
if (!phase || !['start', 'end'].includes(event)) {
  process.stderr.write('usage: log.mjs <phase> <start|end> [--tokens <n>] [--note <text>]\n');
  process.exit(2);
}

const entry = { phase, event, at: new Date().toISOString() };
if (values.tokens) {
  entry.tokens = Number(values.tokens);
}
if (values.note) {
  entry.note = values.note;
}
const logPath = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'project-log.jsonl');
appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
