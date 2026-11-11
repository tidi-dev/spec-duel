#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseEvents } from './parse-events.mjs';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const phases = JSON.parse(readFileSync(join(toolsDir, 'phases.json'), 'utf8'));
const DEFAULT_MODEL = 'claude-fable-5-2';

const fail = (message) => {
  process.stderr.write(`run-step: ${message}\n`);
  process.exit(2);
};

const { values } = parseArgs({
  options: {
    kit: { type: 'string' },
    change: { type: 'string' },
    step: { type: 'string' },
    cwd: { type: 'string' },
    'prompt-file': { type: 'string' },
    resume: { type: 'string' },
    round: { type: 'string', default: '1' },
    'path-prepend': { type: 'string' },
    'runs-dir': { type: 'string', default: resolve(toolsDir, '..') },
  },
});

for (const name of ['kit', 'change', 'step', 'cwd', 'prompt-file']) {
  if (!values[name]) {
    fail(`missing --${name}`);
  }
}
if (!phases[values.kit]) {
  fail(`unknown kit "${values.kit}" (expected ${Object.keys(phases).join(' or ')})`);
}
const phase = phases[values.kit][values.step];
if (!phase) {
  fail(`step "${values.step}" has no phase for kit "${values.kit}" in phases.json`);
}
if (!/^(setup|[0-9]+)$/.test(values.change)) {
  fail(`--change must be "setup" or a number, got "${values.change}"`);
}
const round = Number(values.round);
if (!Number.isInteger(round) || round < 1) {
  fail(`--round must be a positive integer, got "${values.round}"`);
}

const prompt = readFileSync(values['prompt-file'], 'utf8');
const stepDir = join(values['runs-dir'], values.kit, values.change === 'setup' ? 'setup' : `change-${values.change}`);
const baseName = round > 1 ? `${values.step}.r${round}` : values.step;
const eventsPath = join(stepDir, `${baseName}.events.jsonl`);
const recordPath = join(stepDir, `${baseName}.record.json`);
mkdirSync(stepDir, { recursive: true });

const model = process.env.RUNNER_MODEL || DEFAULT_MODEL;
const args = [
  '-p',
  prompt,
  '--model',
  model,
  '--output-format',
  'stream-json',
  '--verbose',
  '--permission-mode',
  'acceptEdits',
  '--append-system-prompt-file',
  join(toolsDir, 'process-note.md'),
];
if (values.resume) {
  args.push('--resume', values.resume);
}

const env = { ...process.env };
if (values['path-prepend']) {
  env.PATH = `${values['path-prepend']}:${env.PATH}`;
}

const startedAt = Date.now();
const lines = [];
const eventsFile = createWriteStream(eventsPath);
const child = spawn('claude', args, { cwd: values.cwd, env, stdio: ['ignore', 'pipe', 'inherit'] });

createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) {
    return;
  }
  let entry;
  try {
    entry = { t: Date.now(), event: JSON.parse(line) };
  } catch {
    entry = { t: Date.now(), raw: line };
  }
  const serialised = JSON.stringify(entry);
  lines.push(serialised);
  eventsFile.write(`${serialised}\n`);
});

const SHARED = ['costUsd', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens'];

// A resumed session reports totals for the whole conversation; keep only what this round added.
const ownShare = (parsed, sessionId) => {
  const earlier = existsSync(stepDir)
    ? readdirSync(stepDir)
        .filter((name) => name.endsWith('.record.json') && join(stepDir, name) !== recordPath)
        .map((name) => JSON.parse(readFileSync(join(stepDir, name), 'utf8')))
        .filter((previous) => previous.sessionId === sessionId)
    : [];
  if (earlier.length === 0) {
    return parsed;
  }
  const totalsOf = (previous) => previous.cumulative ?? previous;
  const latest = earlier.reduce((best, previous) => (totalsOf(previous).costUsd >= totalsOf(best).costUsd ? previous : best));
  const before = totalsOf(latest);
  const cumulative = Object.fromEntries(SHARED.map((key) => [key, parsed[key]]));
  return { ...parsed, ...Object.fromEntries(SHARED.map((key) => [key, Math.max(0, parsed[key] - (before[key] ?? 0))])), cumulative };
};

const finish = (exitCode) => {
  const endedAt = Date.now();
  eventsFile.end(() => {
    const parsed = parseEvents(lines);
    const own = values.resume ? ownShare(parsed, values.resume) : parsed;
    const record = {
      kit: values.kit,
      change: values.change,
      step: values.step,
      phase,
      round,
      model,
      resumedFrom: values.resume ?? null,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      wallMs: endedAt - startedAt,
      exitCode,
      ...own,
    };
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    process.stderr.write(
      `run-step: ${values.kit} change ${values.change} ${baseName}: ${record.status}, ${Math.round(record.wallMs / 1000)}s, ${record.turns} turns, $${record.costUsd.toFixed(4)}\n`,
    );
    process.exit(record.status === 'ok' ? 0 : 1);
  });
};

child.on('error', (error) => {
  process.stderr.write(`run-step: could not start claude: ${error.message}\n`);
  finish(127);
});
child.on('close', (code) => finish(code ?? 1));
