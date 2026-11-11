#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [kit, change, round = '1'] = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const variant = join(root, `${kit}-variant`);
const outDir = join(root, 'runs', kit, `change-${change}`);
mkdirSync(outDir, { recursive: true });

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

const detailOf = (name, output) => {
  if (name === 'test') {
    const counts = [...output.matchAll(/^Tests:\s+(?:(\d+) failed, )?(?:\d+ skipped, )?(?:(\d+) passed, )?(\d+) total/gm)];
    const failed = counts.reduce((sum, match) => sum + Number(match[1] ?? 0), 0);
    const total = counts.reduce((sum, match) => sum + Number(match[3] ?? 0), 0);
    return `${total - failed} of ${total} tests`;
  }
  const projects = /target \w+ for (\d+) projects/.exec(output);
  return projects ? `${projects[1]} projects` : '';
};

const result = { round: Number(round), at: new Date().toISOString() };
for (const name of ['build', 'lint', 'test']) {
  const run = spawnSync('pnpm', ['run', name, '--', '--skip-nx-cache'], { cwd: variant, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = strip(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
  writeFileSync(join(outDir, `verify.r${round}.${name}.log`), output);
  result[name] = { exit: run.status ?? 1, detail: detailOf(name, output) };
  process.stderr.write(`verify: ${kit} change ${change} ${name}: exit ${result[name].exit} ${result[name].detail}\n`);
}
writeFileSync(join(outDir, 'verify.json'), `${JSON.stringify(result, null, 2)}\n`);
process.exit(['build', 'lint', 'test'].every((name) => result[name].exit === 0) ? 0 : 1);
