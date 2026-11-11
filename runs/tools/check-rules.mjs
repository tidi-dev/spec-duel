#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = /^(apps|libs)\/.*\.(ts|tsx)$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9-]+)*\.(ts|tsx)$/;
const NEXT_SPECIAL = /^(_app|_document|\[.+\])\.tsx$/;

const finding = () => ({ count: 0, files: [] });

const note = (target, path, hits) => {
  if (hits > 0) {
    target.count += hits;
    target.files.push(path);
  }
};

const matches = (text, pattern) => (text.match(pattern) ?? []).length;

export const checkRules = (repo, from, to) => {
  const changed = execFileSync('git', ['-C', repo, 'diff', '--name-only', '--diff-filter=AM', `${from}..${to}`], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => SOURCE.test(path));
  const rules = {
    filesChecked: changed.length,
    interfaceDeclarations: finding(),
    anyTypes: finding(),
    wildcardImports: finding(),
    filesOver200Lines: finding(),
    nonKebabCaseFiles: finding(),
    servicesWithoutSpec: finding(),
    inlineBodyTypes: finding(),
    commentLines: finding(),
  };
  for (const path of changed) {
    const text = readFileSync(join(repo, path), 'utf8');
    const isSpec = /\.spec\.tsx?$/.test(path);
    note(rules.interfaceDeclarations, path, matches(text, /^\s*(export\s+)?interface\s+\w+/gm));
    note(rules.anyTypes, path, matches(text, /(:\s*any\b|\bas\s+any\b|<any>)/g));
    note(rules.wildcardImports, path, matches(text, /^\s*import\s+\*\s+as\s/gm));
    note(rules.filesOver200Lines, path, text.split('\n').length - 1 > 200 ? 1 : 0);
    note(rules.nonKebabCaseFiles, path, KEBAB.test(basename(path)) || NEXT_SPECIAL.test(basename(path)) ? 0 : 1);
    note(rules.inlineBodyTypes, path, matches(text, /@Body\(\)\s+\w+\s*:\s*\{/g));
    if (!isSpec) {
      note(rules.commentLines, path, matches(text, /^\s*(\/\/|\/\*|\*\s)/gm));
    }
    if (/\.service\.ts$/.test(path) && !existsSync(join(repo, path.replace(/\.ts$/, '.spec.ts')))) {
      note(rules.servicesWithoutSpec, path, 1);
    }
  }
  return rules;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repo, from, to] = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(checkRules(repo, from, to), null, 2)}\n`);
}
