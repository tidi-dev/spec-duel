import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildTimeline } from '../build-timeline.mjs';

const T0 = Date.parse('2026-11-10T10:00:00.000Z');

const step = (root, kit, change, name, phase, startOffset, wallMs, extra = {}, events = []) => {
  const dir = join(root, kit, `change-${change}`);
  mkdirSync(dir, { recursive: true });
  const startedAt = T0 + startOffset;
  writeFileSync(
    join(dir, `${name}.record.json`),
    JSON.stringify({
      kit, change: String(change), step: name, phase, round: 1, status: 'ok',
      startedAt: new Date(startedAt).toISOString(), endedAt: new Date(startedAt + wallMs).toISOString(), wallMs,
      turns: 2, inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheCreationTokens: 5, costUsd: 1,
      ...extra,
    }),
  );
  writeFileSync(join(dir, `${name}.events.jsonl`), events.map((entry) => JSON.stringify({ t: startedAt + entry.at, event: entry.event })).join('\n'));
};

const assistantText = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const toolUse = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

test('steps separated by an idle gap become contiguous phases, with events placed inside them', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'openspec', 1, 'propose', 'specify', 0, 1000, {}, [
    { at: 100, event: assistantText('Reading the brief.') },
    { at: 400, event: toolUse('Write', { file_path: '/repo/openspec-variant/openspec/changes/x/proposal.md' }) },
  ]);
  step(root, 'openspec', 1, 'apply', 'implement', 60000, 3000, {}, [{ at: 500, event: toolUse('Bash', { command: 'pnpm run test' }) }]);

  const kit = buildTimeline(root, '1', { variantsDir: root }).kits.openspec;

  assert.equal(kit.status, 'recorded');
  assert.deepEqual(kit.phases.map((phase) => [phase.step, phase.startMs, phase.endMs]), [['propose', 0, 1000], ['apply', 1000, 4000]]);
  assert.equal(kit.totals.wallMs, 4000);
  assert.equal(kit.totals.costUsd, 2);
  assert.equal(kit.totals.turns, 4);
  assert.deepEqual(kit.events.map((event) => [event.atMs, event.kind, event.label]), [
    [100, 'text', 'Reading the brief.'],
    [400, 'file', 'Write openspec/changes/x/proposal.md'],
    [1500, 'tool', 'Bash pnpm run test'],
  ]);
});

test('a kit with no records is missing while the other kit stays intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'speckit', 2, 'specify', 'specify', 0, 500);

  const timeline = buildTimeline(root, '2', { variantsDir: root });

  assert.equal(timeline.kits.openspec.status, 'missing');
  assert.deepEqual(timeline.kits.openspec.phases, []);
  assert.equal(timeline.kits.speckit.status, 'recorded');
});

test('a kit whose last step was interrupted is partial', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'openspec', 3, 'propose', 'specify', 0, 500);
  step(root, 'openspec', 3, 'apply', 'implement', 1000, 500, { status: 'interrupted' });

  assert.equal(buildTimeline(root, '3', { variantsDir: root }).kits.openspec.status, 'partial');
});

test('long assistant text is trimmed and interventions are counted', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'speckit', 1, 'specify', 'specify', 0, 500, {}, [{ at: 10, event: assistantText('x'.repeat(900)) }]);
  writeFileSync(
    join(root, 'speckit', 'interventions.jsonl'),
    ['{"change":"1","step":"clarify","kind":"question"}', '{"change":"1","step":"implement","kind":"reprompt"}', '{"change":"2","step":"x","kind":"question"}'].join('\n'),
  );

  const kit = buildTimeline(root, '1', { variantsDir: root }).kits.speckit;

  assert.equal(kit.events[0].label.length, 400);
  assert.equal(kit.totals.questions, 1);
  assert.equal(kit.totals.reprompts, 1);
});

test('the documents list holds exactly the kit files the change statistics count, and nothing else', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync: mkdir, writeFileSync: write } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { changeStats } = await import('../change-stats.mjs');
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  const repo = join(root, 'openspec-variant');
  mkdir(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args]);
  const put = (path, text) => {
    mkdir(dirname(join(repo, path)), { recursive: true });
    write(join(repo, path), text);
  };
  git('init', '-q', '-b', 'main');
  put('openspec/specs/old/spec.md', 'old\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('tag', 'change-1-done');
  put('openspec/changes/archive/x/proposal.md', 'why\n');
  put('openspec/changes/archive/x/.openspec.yaml', 'schema: spec-driven\n');
  put('openspec/specs/old/spec.md', 'old\nnew\n');
  put('apps/room/src/room.repository.ts', 'code\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'change');
  git('tag', 'change-2-done');
  step(root, 'openspec', 2, 'propose', 'specify', 0, 500);
  writeFileSync(join(root, 'openspec', 'change-2', 'bug-report.md'), 'copied analysis\n');

  const kit = buildTimeline(root, '2', { variantsDir: root }).kits.openspec;

  const paths = kit.documents.map((doc) => doc.path).sort();
  assert.deepEqual(paths, ['openspec/changes/archive/x/.openspec.yaml', 'openspec/changes/archive/x/proposal.md', 'openspec/specs/old/spec.md']);
  assert.equal(paths.length, changeStats(repo, 'change-1-done', 'change-2-done').kit.files);
  assert.equal(kit.documents.find((doc) => doc.path.endsWith('proposal.md')).content, 'why\n');
  assert.deepEqual(kit.documents.map((doc) => doc.title).sort(), ['change: .openspec.yaml', 'change: proposal.md', 'living spec: old']);

});

test('a third kit without records is missing while the recorded kits stay intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'openspec', 1, 'propose', 'specify', 0, 500);
  step(root, 'speckit', 1, 'specify', 'specify', 0, 700);

  const timeline = buildTimeline(root, '1', { variantsDir: root });

  assert.deepEqual(Object.keys(timeline.kits), ['openspec', 'speckit', 'cyberrock']);
  assert.equal(timeline.kits.cyberrock.status, 'missing');
  assert.equal(timeline.kits.openspec.status, 'recorded');
  assert.equal(timeline.kits.speckit.status, 'recorded');
});

test('a cyberrock step is placed on the timeline like any other kit step', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'cyberrock', 3, 'propose', 'specify', 0, 900, {}, [{ at: 200, event: toolUse('Write', { file_path: '/repo/cyberrock-variant/cr/changes/fix-x/change.md' }) }]);

  const kit = buildTimeline(root, '3', { variantsDir: root }).kits.cyberrock;

  assert.equal(kit.status, 'recorded');
  assert.deepEqual(kit.events.map((event) => event.label), ['Write cr/changes/fix-x/change.md']);
});

test('a variant without its own git tags keeps the documents saved in the stored timeline', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'openspec', 2, 'propose', 'specify', 0, 500);
  mkdirSync(join(root, 'timelines'), { recursive: true });
  const saved = [{ title: 'change: proposal.md', path: 'openspec/changes/x/proposal.md', content: '# Proposal' }];
  writeFileSync(join(root, 'timelines', 'change-2.json'), JSON.stringify({ kits: { openspec: { documents: saved } } }));

  const timeline = buildTimeline(root, '2', { variantsDir: root });

  assert.deepEqual(timeline.kits.openspec.documents, saved);
  assert.deepEqual(timeline.kits.speckit.documents, []);
});

test('a step that was interrupted and resumed is one step with its parts added together', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'cyberrock', 1, 'propose', 'specify', 0, 1000);
  step(root, 'cyberrock', 1, 'apply', 'implement', 5000, 3000, { costUsd: 2, turns: 3 }, [{ at: 100, event: assistantText('first part') }]);
  step(root, 'cyberrock', 1, 'apply.r2', 'implement', 60000, 2000, { step: 'apply', round: 2, resumedFrom: 'session-1', costUsd: 1, turns: 4 }, [
    { at: 500, event: assistantText('second part') },
  ]);
  writeFileSync(join(root, 'cyberrock', 'interventions.jsonl'), '{"change":"1","step":"apply","kind":"interruption","note":"x"}\n');

  const kit = buildTimeline(root, '1', { variantsDir: root }).kits.cyberrock;

  assert.deepEqual(kit.phases.map((phase) => [phase.step, phase.round, phase.parts, phase.startMs, phase.endMs, phase.costUsd, phase.turns]), [
    ['propose', 1, 1, 0, 1000, 1, 2],
    ['apply', 1, 2, 1000, 6000, 3, 7],
  ]);
  assert.deepEqual(kit.events.map((event) => [event.atMs, event.label]), [[1100, 'first part'], [4500, 'second part']]);
  assert.equal(kit.totals.wallMs, 6000);
  assert.equal(kit.totals.costUsd, 4);
});

test('a resumed round that answers a question, not an interruption, stays its own step', () => {
  const root = mkdtempSync(join(tmpdir(), 'timeline-'));
  step(root, 'openspec', 1, 'archive', 'close', 0, 1000);
  step(root, 'openspec', 1, 'archive.r2', 'close', 5000, 2000, { step: 'archive', round: 2, resumedFrom: 'session-1' });
  writeFileSync(join(root, 'openspec', 'interventions.jsonl'), '{"change":"1","step":"archive","kind":"approval","note":"x"}\n');

  const kit = buildTimeline(root, '1', { variantsDir: root }).kits.openspec;

  assert.deepEqual(kit.phases.map((phase) => [phase.step, phase.round, phase.parts]), [['archive', 1, 1], ['archive', 2, 1]]);
});
