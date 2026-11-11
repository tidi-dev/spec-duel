import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { rollup } from '../rollup.mjs';

const record = (overrides) => ({
  kit: 'openspec', change: '1', step: 'propose', phase: 'specify', round: 1, status: 'ok',
  wallMs: 1000, apiMs: 900, turns: 2, inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40, costUsd: 0.5,
  ...overrides,
});

const write = (root, item) => {
  const dir = join(root, item.kit, item.change === 'setup' ? 'setup' : `change-${item.change}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${item.step}${item.round > 1 ? `.r${item.round}` : ''}.record.json`), JSON.stringify(item));
};

test('sums records per phase, per change and per kit', () => {
  const root = mkdtempSync(join(tmpdir(), 'rollup-'));
  write(root, record({}));
  write(root, record({ step: 'apply', phase: 'implement', wallMs: 3000, costUsd: 1.5, turns: 5 }));
  write(root, record({ step: 'apply', phase: 'implement', round: 2, wallMs: 500, costUsd: 0.25, turns: 1 }));
  write(root, record({ kit: 'speckit', step: 'specify', wallMs: 2000, costUsd: 2 }));

  const metrics = rollup(root);

  const openspec = metrics.kits.openspec;
  assert.equal(openspec.changes['1'].phases.specify.wallMs, 1000);
  assert.equal(openspec.changes['1'].phases.implement.wallMs, 3500);
  assert.equal(openspec.changes['1'].phases.implement.costUsd, 1.75);
  assert.equal(openspec.changes['1'].phases.implement.steps, 2);
  assert.equal(openspec.changes['1'].totals.costUsd, 2.25);
  assert.equal(openspec.changes['1'].totals.turns, 8);
  assert.equal(openspec.totals.wallMs, 4500);
  assert.equal(metrics.kits.speckit.totals.costUsd, 2);
  assert.equal(metrics.kits.speckit.changes['1'].totals.inputTokens, 10);
});

test('an empty runs folder yields no kits', () => {
  assert.deepEqual(rollup(mkdtempSync(join(tmpdir(), 'rollup-'))).kits, {});
});

test('merges interventions and the per-change result files', () => {
  const root = mkdtempSync(join(tmpdir(), 'rollup-'));
  write(root, record({}));
  writeFileSync(join(root, 'openspec', 'interventions.jsonl'), '{"change":"1","kind":"reprompt"}\n{"change":"1","kind":"approval"}\n{"change":"2","kind":"question"}\n');
  writeFileSync(join(root, 'openspec', 'change-1', 'acceptance-summary.json'), JSON.stringify({ passed: 30, total: 30, groups: {}, failures: [] }));
  writeFileSync(join(root, 'openspec', 'change-1', 'stats.json'), JSON.stringify({ kit: { files: 1, added: 2, deleted: 0 } }));

  const change = rollup(root).kits.openspec.changes['1'];

  assert.deepEqual(change.interventions, { reprompt: 1, approval: 1 });
  assert.equal(change.acceptance.passed, 30);
  assert.equal(change.stats.kit.added, 2);
  assert.equal(change.verify, null);
});
