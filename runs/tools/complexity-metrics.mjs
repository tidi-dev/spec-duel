#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const RULES = { complexity: ['warn', 0], 'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }], 'max-params': ['warn', 3] };

const kitWrittenSource = (kit) => {
  const variant = join(root, `${kit}-variant`);
  const nested = existsSync(join(variant, '.git'));
  const files = execFileSync('git', ['-C', nested ? variant : root, 'ls-files', ...['apps', 'libs'].map((dir) => (nested ? dir : `${kit}-variant/${dir}`))], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((path) => (nested ? path : path.slice(`${kit}-variant/`.length)));
  return files
    .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.spec\.tsx?$/.test(path))
    .filter((path) => !existsSync(join(root, 'baseline', path)) || readFileSync(join(variant, path), 'utf8') !== readFileSync(join(root, 'baseline', path), 'utf8'));
};

const result = {};
for (const kit of process.argv.slice(2)) {
  const files = kitWrittenSource(kit);
  const run = spawnSync('npx', ['eslint', '--format', 'json', ...Object.entries(RULES).flatMap(([name, value]) => ['--rule', `${name}: ${JSON.stringify(value)}`]), ...files], {
    cwd: join(root, `${kit}-variant`),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const messages = JSON.parse(run.stdout).flatMap((file) => file.messages.map((message) => ({ ...message, file: file.filePath.split(`${kit}-variant/`)[1] })));
  const complexities = messages.filter((message) => message.ruleId === 'complexity').map((message) => ({ value: Number(/complexity of (\d+)/.exec(message.message)?.[1] ?? 0), at: `${message.file}:${message.line}` }));
  const max = complexities.reduce((best, item) => (item.value > best.value ? item : best), { value: 0, at: '' });
  result[kit] = {
    files: files.length,
    functions: complexities.length,
    averageComplexity: Number((complexities.reduce((sum, item) => sum + item.value, 0) / Math.max(1, complexities.length)).toFixed(2)),
    maxComplexity: max,
    functionsOverComplexity5: complexities.filter((item) => item.value > 5).length,
    functionsOver50Lines: messages.filter((message) => message.ruleId === 'max-lines-per-function').length,
    functionsWith4OrMoreParams: messages.filter((message) => message.ruleId === 'max-params').length,
  };
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
