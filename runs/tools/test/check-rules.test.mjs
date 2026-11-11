import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkRules } from '../check-rules.mjs';

const git = (repo, ...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });

const put = (repo, path, content) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};

const fixture = () => {
  const repo = mkdtempSync(join(tmpdir(), 'rules-'));
  git(repo, 'init', '-q', '-b', 'main');
  put(repo, 'apps/a/src/untouched.ts', 'export interface Old { a: any }\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'tag', 'from');
  put(repo, 'apps/a/src/bad-types.ts', 'export interface Thing { id: string }\nconst x: any = 1;\nconst y = x as any;\nimport * as fs from "fs";\n');
  put(repo, 'apps/a/src/long-file.ts', `${'const a = 1;\n'.repeat(201)}`);
  put(repo, 'apps/a/src/BadName.ts', 'export const ok = 1;\n');
  put(repo, 'apps/a/src/thing.service.ts', 'export class ThingService {}\n');
  put(repo, 'apps/a/src/tested.service.ts', 'export class TestedService {}\n');
  put(repo, 'apps/a/src/tested.service.spec.ts', 'it("x", () => {});\n');
  put(repo, 'apps/a/src/thing.controller.ts', '  @Post()\n  create(@Body() body: { name: string }) {}\n  @Patch()\n  update(@Body() dto: UpdateDto) {}\n');
  put(repo, 'apps/a/src/clean.ts', '// a comment\nexport const company = "any company";\n');
  put(repo, 'specs/notes.md', 'interface any\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'change');
  git(repo, 'tag', 'to');
  return repo;
};

test('counts rule breaks in changed source files only', () => {
  const rules = checkRules(fixture(), 'from', 'to');

  assert.equal(rules.filesChecked, 8);
  assert.equal(rules.interfaceDeclarations.count, 1);
  assert.equal(rules.anyTypes.count, 2);
  assert.equal(rules.wildcardImports.count, 1);
  assert.deepEqual(rules.filesOver200Lines.files, ['apps/a/src/long-file.ts']);
  assert.deepEqual(rules.nonKebabCaseFiles.files, ['apps/a/src/BadName.ts']);
  assert.deepEqual(rules.servicesWithoutSpec.files, ['apps/a/src/thing.service.ts']);
  assert.equal(rules.inlineBodyTypes.count, 1);
  assert.equal(rules.commentLines.count, 1);
});
