#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [kit, change, step, ...command] = process.argv.slice(2);
const toolsDir = dirname(fileURLToPath(import.meta.url));
const phase = JSON.parse(readFileSync(join(toolsDir, 'phases.json'), 'utf8'))[kit]?.[step];
if (!phase || command.length === 0) {
  process.stderr.write('usage: record-cli-check.mjs <kit> <change> <step> <command> [args…]\n');
  process.exit(2);
}
const root = resolve(toolsDir, '..', '..');
const outDir = join(root, 'runs', kit, change === 'setup' ? 'setup' : `change-${change}`);
mkdirSync(outDir, { recursive: true });

const startedAt = Date.now();
const run = spawnSync(command[0], command.slice(1), { cwd: join(root, `${kit}-variant`), encoding: 'utf8' });
const endedAt = Date.now();
const record = {
  kit,
  change,
  step,
  phase,
  round: 1,
  model: null,
  startedAt: new Date(startedAt).toISOString(),
  endedAt: new Date(endedAt).toISOString(),
  wallMs: endedAt - startedAt,
  exitCode: run.status ?? 1,
  status: run.status === 0 ? 'ok' : 'error',
  sessionId: null,
  turns: 0,
  apiMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
  modelUsage: {},
  permissionDenials: [],
  resultText: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim(),
  note: 'CLI command run by the operator, no AI session',
};
writeFileSync(join(outDir, `${step}.record.json`), `${JSON.stringify(record, null, 2)}\n`);
writeFileSync(join(outDir, `${step}.events.jsonl`), '');
process.stderr.write(`record-cli-check: ${kit} change ${change} ${step}: exit ${record.exitCode}, ${record.wallMs} ms\n${record.resultText}\n`);
process.exit(record.exitCode);
