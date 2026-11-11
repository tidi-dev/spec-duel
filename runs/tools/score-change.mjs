#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeStats } from './change-stats.mjs';
import { checkRules } from './check-rules.mjs';

const [kit, change] = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const variant = join(root, `${kit}-variant`);
const outDir = join(root, 'runs', kit, `change-${change}`);
const GATEWAY = { openspec: 'http://localhost:3110/api', speckit: 'http://localhost:3120/api', cyberrock: 'http://localhost:3130/api' };
const GROUPS = { 1: ['baseline', 'change-1'], 2: ['baseline', 'change-1', 'change-2'], 3: ['baseline', 'change-1', 'change-2', 'change-3'] };
const FROM = { 1: 'kit-installed', 2: 'change-1-done', 3: 'change-2-done' };
const TYPE = { 1: 'feat', 2: 'feat', 3: 'fix' };

const git = (...args) => execFileSync('git', ['-C', variant, ...args], { encoding: 'utf8' });

const stack = spawnSync('scripts/stack-reset.sh', [], { cwd: variant, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(join(outDir, 'stack-reset.log'), `${stack.stdout ?? ''}\n${stack.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, ''));
const stackUp = stack.status === 0;
process.stderr.write(`score: ${kit} change ${change}: stack ${stackUp ? 'up' : 'DID NOT START'}\n`);

let summary = { stackStarted: stackUp, passed: 0, total: 0, groups: {}, failures: [] };
if (stackUp) {
  const resultFile = join(outDir, 'acceptance.json');
  spawnSync('npx', ['jest', '--selectProjects', ...GROUPS[change], '--json', '--outputFile', resultFile], {
    cwd: join(root, 'acceptance'),
    env: { ...process.env, GATEWAY_URL: GATEWAY[kit] },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const run = JSON.parse(readFileSync(resultFile, 'utf8'));
  for (const file of run.testResults) {
    const group = file.name.split('/src/')[1].split('/')[0];
    summary.groups[group] ??= { passed: 0, failed: 0 };
    for (const assertion of file.assertionResults) {
      const passed = assertion.status === 'passed';
      summary.groups[group][passed ? 'passed' : 'failed'] += 1;
      summary.total += 1;
      summary.passed += passed ? 1 : 0;
      if (!passed) {
        summary.failures.push(`${group}: ${assertion.fullName}`);
      }
    }
  }
}
writeFileSync(join(outDir, 'acceptance-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.stderr.write(`score: acceptance ${summary.passed} of ${summary.total} ${JSON.stringify(summary.groups)}\n`);

git('add', '-A');
if (git('status', '--porcelain').trim()) {
  git('commit', '-q', '-m', `${TYPE[change]}: change ${change}`);
}
git('tag', '-f', `change-${change}-done`);
writeFileSync(join(outDir, 'stats.json'), `${JSON.stringify(changeStats(variant, FROM[change], `change-${change}-done`), null, 2)}\n`);
writeFileSync(join(outDir, 'rules.json'), `${JSON.stringify(checkRules(variant, FROM[change], `change-${change}-done`), null, 2)}\n`);
process.stderr.write(`score: tagged change-${change}-done; stats and rules written\n`);
