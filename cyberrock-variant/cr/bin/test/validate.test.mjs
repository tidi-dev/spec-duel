import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChange } from '../lib/parse.mjs';
import { validateRepo } from '../lib/validate.mjs';
import { FEATURE, FIX, makeRepo, SPEC } from './fixture.mjs';

const errorsFor = (change, { id = 'add-notes', strict = false, files = {} } = {}) =>
  validateRepo(makeRepo({ [`cr/changes/${id}/change.md`]: change, ...files }), { strict });

const expectError = (change, pattern, options) => {
  const errors = errorsFor(change, options);
  assert.ok(errors.some((error) => pattern.test(error)), `expected ${pattern} in:\n${errors.join('\n') || '(no errors)'}`);
};

test('parses tier, requirements, risks and tasks', () => {
  const change = parseChange(FEATURE);
  assert.equal(change.id, 'add-notes');
  assert.equal(change.tier, 'change');
  assert.deepEqual(change.requirements.map((item) => `${item.op} ${item.capability} ${item.id}`), ['ADDED bookings-api BK-002', 'MODIFIED bookings-api BK-001']);
  assert.deepEqual(change.risks[0], { id: 'R-01', applies: 'yes', note: 'note is optional', task: 'T02' });
  assert.deepEqual(change.tasks[1], { id: 'T02', done: false, track: 'be', refs: ['BK-002', 'R-01'], text: 'Reject null notes', files: ['apps/api/note.dto.ts'] });
});

test('a well-formed change and a well-formed fix pass', () => {
  assert.deepEqual(errorsFor(FEATURE), []);
  assert.deepEqual(errorsFor(FIX, { id: 'fix-paging' }), []);
});

test('the title id must match the folder', () => {
  expectError(FEATURE, /title id "add-notes" does not match folder "other"/, { id: 'other' });
});

test('a missing or unknown tier is reported', () => {
  expectError(FEATURE.replace('Tier: change', 'Tier: huge'), /Tier must be feature, change or fix/);
});

test('required sections depend on the tier', () => {
  expectError(FEATURE.replace('## Design', '## Notes'), /missing section "## Design"/);
  expectError(FIX.replace('## Cause', '## Background'), /missing section "## Cause"/, { id: 'fix-paging' });
});

test('a requirement needs SHALL and a WHEN/THEN scenario', () => {
  expectError(FEATURE.replace('SHALL store a note', 'stores a note'), /BK-002 has no SHALL statement/);
  expectError(FEATURE.replace('- Scenario: too long. WHEN the note has 201 characters THEN the answer is 400\n', ''), /BK-002 has no "- Scenario: … WHEN … THEN …" line/);
});

test('delta operations must agree with the living specs', () => {
  expectError(FEATURE.replace('#### BK-002: Store a note', '#### BK-001: Store a note'), /ADDED BK-001 already exists/);
  expectError(FEATURE.replace('#### BK-001: List bookings', '#### BK-009: List bookings'), /MODIFIED BK-009 does not exist in bookings-api/);
  expectError(FEATURE.replace('### ADDED bookings-api', '### ADDED rooms-api'), /prefix BK already belongs to bookings-api/);
});

test('requirements and tasks must reference each other', () => {
  expectError(FEATURE.replace('- [ ] T03 @fe [BK-001] Show the note in the list | apps/web/list.tsx\n', ''), /BK-001 has no task/);
  expectError(FEATURE.replace('[BK-002] Add the column', '[BK-777] Add the column'), /T01 references unknown "BK-777"/);
});

test('the risk table must cover the catalogue', () => {
  expectError(FEATURE.replace('| R-02 | no | no partial update | - |\n', ''), /Risks table is missing R-02/);
  expectError(FEATURE.replace('| R-01 | yes | note is optional | T02 |', '| R-01 | yes | note is optional | T99 |'), /R-01 applies but task "T99" does not exist/);
  expectError(FEATURE.replace('| R-02 | no | no partial update | - |', '| R-02 | no |  | - |'), /R-02 does not apply but gives no reason/);
});

test('tracks may not share files', () => {
  expectError(FEATURE.replace('| apps/web/list.tsx', '| apps/api/note.ts'), /apps\/api\/note.ts is listed in tracks be and fe/);
});

test('the size budget is enforced per tier', () => {
  const padded = FIX.replace('## Tasks', `${'Filler line.\n'.repeat(40)}\n## Tasks`);
  expectError(padded, /\d+ lines, budget for a fix is 40/, { id: 'fix-paging' });
});

test('a fix needs a regression task', () => {
  expectError(FIX.replaceAll('[regression]', '[verify]'), /a fix needs a task tagged \[regression\]/, { id: 'fix-paging' });
});

test('living specs are checked for duplicate ids', () => {
  expectError(FEATURE, /BK-001 is defined twice/, { files: { 'cr/specs/other.md': SPEC.replace('# bookings-api', '# other') } });
});

test('strict mode rejects a finished change that was not archived', () => {
  const done = FIX.replaceAll('- [ ]', '- [x]');
  assert.deepEqual(errorsFor(done, { id: 'fix-paging' }), []);
  expectError(done, /every task is ticked but the change is not archived/, { id: 'fix-paging', strict: true });
});
