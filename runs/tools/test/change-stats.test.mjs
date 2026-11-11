import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { changeStats } from '../change-stats.mjs';

const git = (repo, ...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });

const put = (repo, path, lines) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), `${Array.from({ length: lines }, (_, index) => `line ${index}`).join('\n')}\n`);
};

test('splits a change into kit artifacts, tests and code', () => {
  const repo = mkdtempSync(join(tmpdir(), 'stats-'));
  git(repo, 'init', '-q', '-b', 'main');
  put(repo, 'apps/room/src/room.service.ts', 3);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'tag', 'from');
  put(repo, 'apps/booking/src/booking.service.ts', 10);
  put(repo, 'apps/booking/src/booking.service.spec.ts', 7);
  put(repo, 'apps/web/src/views/bookings/bookings-page.spec.tsx', 2);
  put(repo, 'openspec/changes/add-bookings/proposal.md', 5);
  put(repo, 'specs/001-bookings/spec.md', 4);
  put(repo, '.specify/feature.json', 1);
  put(repo, '.claude/skills/x/SKILL.md', 1);
  put(repo, 'apps/room/src/room.service.ts', 4);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'change');
  git(repo, 'tag', 'to');

  const stats = changeStats(repo, 'from', 'to');

  assert.deepEqual(stats.kit, { files: 4, added: 11, deleted: 0 });
  assert.deepEqual(stats.tests, { files: 2, added: 9, deleted: 0 });
  assert.deepEqual(stats.code, { files: 2, added: 11, deleted: 0 });
  assert.deepEqual(stats.total, { files: 8, added: 31, deleted: 0 });
});
