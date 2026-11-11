#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE = ['apps', 'libs'];
const CODE_FILE = /\.(ts|tsx)$/;
const SPEC_FILE = /\.spec\.tsx?$/;
const WINDOW = 6;

const tracked = (repoDir, prefix) =>
  execFileSync('git', ['-C', repoDir, 'ls-files', ...SCOPE.map((dir) => (prefix ? `${prefix}/${dir}` : dir))], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
    .map((path) => (prefix ? path.slice(prefix.length + 1) : path));

const codeLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'));

const count = (text, pattern) => (text.match(pattern) ?? []).length;

const duplication = (files) => {
  const windows = new Map();
  const perFile = files.map(({ text }) => codeLines(text).filter((line) => !line.startsWith('import ') && line.length > 3));
  perFile.forEach((lines, fileIndex) => {
    for (let index = 0; index + WINDOW <= lines.length; index += 1) {
      const key = lines.slice(index, index + WINDOW).join('\n');
      windows.set(key, [...(windows.get(key) ?? []), [fileIndex, index]]);
    }
  });
  const duplicated = new Set();
  for (const places of windows.values()) {
    if (places.length > 1) {
      for (const [fileIndex, index] of places) {
        for (let offset = 0; offset < WINDOW; offset += 1) {
          duplicated.add(`${fileIndex}:${index + offset}`);
        }
      }
    }
  }
  const total = perFile.reduce((sum, lines) => sum + lines.length, 0);
  return { duplicatedLines: duplicated.size, comparedLines: total, percent: total ? Number(((100 * duplicated.size) / total).toFixed(1)) : 0 };
};

export const codeMetrics = (variantDir, baselineDir, { variantPrefix = '', baselinePrefix = '', variantRepo = variantDir, baselineRepo = baselineDir } = {}) => {
  const baseline = new Set(tracked(baselineRepo, baselinePrefix));
  const changed = tracked(variantRepo, variantPrefix)
    .filter((path) => CODE_FILE.test(path))
    .filter((path) => !baseline.has(path) || readFileSync(join(variantDir, path), 'utf8') !== readFileSync(join(baselineDir, path), 'utf8'))
    .map((path) => ({ path, text: readFileSync(join(variantDir, path), 'utf8'), isNew: !baseline.has(path) }));
  const source = changed.filter((file) => !SPEC_FILE.test(file.path));
  const specs = changed.filter((file) => SPEC_FILE.test(file.path));
  const sum = (files, measure) => files.reduce((total, file) => total + measure(file.text), 0);
  const sourceLines = sum(source, (text) => codeLines(text).length);
  const specLines = sum(specs, (text) => codeLines(text).length);
  return {
    changedFiles: changed.length,
    baselineFilesModified: changed.filter((file) => !file.isNew).length,
    sourceFiles: source.length,
    sourceCodeLines: sourceLines,
    specFiles: specs.length,
    specCodeLines: specLines,
    specToSourceRatio: Number((specLines / Math.max(1, sourceLines)).toFixed(2)),
    integrationSpecFiles: specs.filter((file) => /\.int\.spec\.ts$/.test(file.path)).length,
    testCases: sum(specs, (text) => count(text, /^\s*(it|test)(\.each\([^)]*\))?\(/gm)),
    filesOver200Lines: changed.filter((file) => file.text.split('\n').length - 1 > 200).map((file) => file.path),
    rawQueryCalls: sum(source, (text) => count(text, /\.query\(/g)),
    transactionCalls: sum(source, (text) => count(text, /\.transaction\(|startTransaction\(/g)),
    queryRunnerUses: sum(source, (text) => count(text, /createQueryRunner\(/g)),
    interfaceDeclarations: sum(changed, (text) => count(text, /^\s*(export\s+)?interface\s+\w+/gm)),
    anyTypes: sum(changed, (text) => count(text, /(:\s*any\b|\bas\s+any\b|<any>)/g)),
    wildcardImports: sum(changed, (text) => count(text, /^\s*import\s+\*\s+as\s/gm)),
    eslintDisables: sum(changed, (text) => count(text, /eslint-disable/g)),
    tsIgnores: sum(changed, (text) => count(text, /@ts-(ignore|expect-error|nocheck)/g)),
    duplication: duplication(source),
  };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
  const result = {};
  for (const kit of process.argv.slice(2)) {
    const variantDir = join(root, `${kit}-variant`);
    const nested = existsSync(join(variantDir, '.git'));
    result[kit] = codeMetrics(variantDir, join(root, 'baseline'), {
      variantRepo: nested ? variantDir : root,
      variantPrefix: nested ? '' : `${kit}-variant`,
      baselineRepo: root,
      baselinePrefix: 'baseline',
    });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
