#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUMMED = ['wallMs', 'apiMs', 'turns', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'costUsd'];
const KITS = Object.keys(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'phases.json'), 'utf8')));

const emptyTotals = () => ({ ...Object.fromEntries(SUMMED.map((key) => [key, 0])), steps: 0 });

const add = (totals, record) => {
  for (const key of SUMMED) {
    totals[key] += record[key] ?? 0;
  }
  totals.steps += 1;
};

const recordsOf = (kitDir) =>
  readdirSync(kitDir)
    .map((name) => join(kitDir, name))
    .filter((path) => statSync(path).isDirectory())
    .flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.record.json')).map((name) => join(dir, name)))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')));

export const rollup = (runsDir) => {
  const kits = {};
  for (const kit of KITS) {
    const kitDir = join(runsDir, kit);
    if (!existsSync(kitDir)) {
      continue;
    }
    const summary = { totals: emptyTotals(), changes: {} };
    for (const record of recordsOf(kitDir)) {
      summary.changes[record.change] ??= { totals: emptyTotals(), phases: {} };
      const change = summary.changes[record.change];
      change.phases[record.phase] ??= emptyTotals();
      add(change.phases[record.phase], record);
      add(change.totals, record);
      add(summary.totals, record);
    }
    for (const [change, entry] of Object.entries(summary.changes)) {
      const dir = join(kitDir, change === 'setup' ? 'setup' : `change-${change}`);
      const read = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null);
      entry.interventions = {};
      const logPath = join(kitDir, 'interventions.jsonl');
      for (const line of existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean) : []) {
        const item = JSON.parse(line);
        if (String(item.change) === change) {
          entry.interventions[item.kind] = (entry.interventions[item.kind] ?? 0) + 1;
        }
      }
      entry.verify = read('verify.json');
      entry.acceptance = read('acceptance-summary.json');
      entry.stats = read('stats.json');
      entry.rules = read('rules.json');
      entry.tracks = read('tracks.json');
    }
    kits[kit] = summary;
  }
  return { generatedAt: new Date().toISOString(), kits };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const metrics = rollup(runsDir);
  writeFileSync(join(runsDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  process.stderr.write(`rollup: wrote ${join(runsDir, 'metrics.json')}\n`);
}
