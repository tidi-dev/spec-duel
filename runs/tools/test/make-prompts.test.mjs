import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildPrompts } from '../make-prompts.mjs';

const briefs = () => {
  const dir = mkdtempSync(join(tmpdir(), 'briefs-'));
  writeFileSync(join(dir, '01-feature.md'), '# Feature\n\nBuild "it" with $pecial `chars`.\n');
  writeFileSync(join(dir, '02-brownfield.md'), '# Change\n');
  writeFileSync(join(dir, '03-bugfix.md'), '# Bug\n');
  writeFileSync(join(dir, 'parallel-note.md'), 'Do backend and frontend in parallel.\n');
  return dir;
};

test('both kits get the brief text byte for byte in their first step', () => {
  const dir = briefs();
  const brief = '# Feature\n\nBuild "it" with $pecial `chars`.\n';

  const openspec = buildPrompts('openspec', '1', dir);
  const speckit = buildPrompts('speckit', '1', dir);

  assert.equal(openspec.propose, `/opsx:propose ${brief}`);
  assert.equal(speckit.specify, `/speckit-specify ${brief}`);
});

test('each kit gets its own step list in order', () => {
  const dir = briefs();

  assert.deepEqual(Object.keys(buildPrompts('openspec', '2', dir)), ['propose', 'apply', 'archive']);
  assert.deepEqual(Object.keys(buildPrompts('speckit', '2', dir)), ['specify', 'clarify', 'plan', 'tasks', 'analyze', 'implement']);
});

test('only change 1 carries the parallel note, and only on the implementation step, identically for both kits', () => {
  const dir = briefs();
  const note = 'Do backend and frontend in parallel.\n';

  assert.equal(buildPrompts('openspec', '1', dir).apply, `/opsx:apply\n\n${note}`);
  assert.equal(buildPrompts('speckit', '1', dir).implement, `/speckit-implement\n\n${note}`);
  assert.equal(buildPrompts('openspec', '3', dir).apply, '/opsx:apply');
  assert.equal(buildPrompts('speckit', '3', dir).implement, '/speckit-implement');
  assert.equal(buildPrompts('speckit', '1', dir).plan, '/speckit-plan');
});

test('rejects an unknown kit or change', () => {
  assert.throws(() => buildPrompts('other', '1', briefs()), /kit/);
  assert.throws(() => buildPrompts('openspec', '4', briefs()), /change/);
});
