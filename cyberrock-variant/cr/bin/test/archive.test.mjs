import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { archiveChange, tickTasks } from '../lib/archive.mjs';
import { validateRepo } from '../lib/validate.mjs';
import { FEATURE, makeRepo } from './fixture.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cr.mjs');
const REMOVING = FEATURE.replace(
  '\n## Design',
  '### REMOVED bookings-api\n#### BK-003: Replaced by notes\n\n## Design',
).replace('[BK-001] Show the note', '[BK-001, BK-003] Show the note');
const SPEC_WITH_THREE = `# bookings-api

## BK-001: List bookings
The system SHALL list bookings.
- Scenario: empty. WHEN no booking exists THEN the list is empty

## BK-003: Old comment field
The system SHALL keep a comment.
- Scenario: kept. WHEN a comment is sent THEN it is stored
`;

const repoWith = (change = FEATURE, files = {}) => makeRepo({ 'cr/changes/add-notes/change.md': change, ...files });
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('tick marks the named tasks and rejects an unknown one', () => {
  const root = repoWith();
  tickTasks(root, 'add-notes', ['T01', 'T03']);
  const text = read(root, 'cr/changes/add-notes/change.md');
  assert.match(text, /- \[x\] T01 /);
  assert.match(text, /- \[ \] T02 /);
  assert.match(text, /- \[x\] T03 /);
  assert.throws(() => tickTasks(root, 'add-notes', ['T42']), /T42 is not a task/);
});

test('archive refuses while a task is open', () => {
  const root = repoWith();
  assert.throws(() => archiveChange(root, 'add-notes'), /open tasks: T01, T02, T03, T04/);
  assert.ok(existsSync(join(root, 'cr/changes/add-notes/change.md')));
});

test('archive merges added, modified and removed requirements by id and moves the change', () => {
  const root = repoWith(REMOVING.replaceAll('- [ ]', '- [x]'), { 'cr/specs/bookings-api.md': SPEC_WITH_THREE });
  archiveChange(root, 'add-notes');
  const spec = read(root, 'cr/specs/bookings-api.md');
  assert.match(spec, /## BK-001: List bookings\nThe system SHALL list bookings with their notes\./);
  assert.match(spec, /## BK-002: Store a note\nThe system SHALL store a note of at most 200 characters\./);
  assert.doesNotMatch(spec, /BK-003/);
  assert.doesNotMatch(spec, /The system SHALL list bookings\.\n/);
  assert.ok(!existsSync(join(root, 'cr/changes/add-notes')));
  assert.ok(existsSync(join(root, 'cr/changes/archive/add-notes/change.md')));
  assert.deepEqual(validateRepo(root, { strict: true }), []);
});

test('archive creates the spec file of a new capability', () => {
  const change = FEATURE.replace('### ADDED bookings-api\n#### BK-002', '### ADDED booking-notes\n#### BN-001').replaceAll('BK-002', 'BN-001');
  const root = repoWith(change.replaceAll('- [ ]', '- [x]'));
  archiveChange(root, 'add-notes');
  assert.match(read(root, 'cr/specs/booking-notes.md'), /^# booking-notes\n\n## BN-001: Store a note\n/);
});

test('the command line exits 1 with the errors and 0 when clean', () => {
  const broken = repoWith(FEATURE.replace('Tier: change', 'Tier: huge'));
  const failed = spawnSync('node', [CLI, 'validate'], { cwd: broken, encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /cr\/changes\/add-notes\/change\.md: Tier must be feature, change or fix/);
  const clean = repoWith();
  assert.match(execFileSync('node', [CLI, 'validate'], { cwd: clean, encoding: 'utf8' }), /ok: 1 change, 1 spec/);
  assert.match(execFileSync('node', [CLI, 'tick', 'add-notes', 'T01', 'T02', 'T03', 'T04'], { cwd: clean, encoding: 'utf8' }), /ticked 4/);
  assert.match(execFileSync('node', [CLI, 'archive', 'add-notes'], { cwd: clean, encoding: 'utf8' }), /archived add-notes/);
});
