#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_PREFIXES = ['openspec/', 'specs/', '.specify/', '.claude/', 'cr/'];

export const categoryOf = (path) => {
  if (KIT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return 'kit';
  }
  return /\.spec\.[tj]sx?$/.test(path) ? 'tests' : 'code';
};

const empty = () => ({ files: 0, added: 0, deleted: 0 });

export const changeStats = (repo, from, to) => {
  const output = execFileSync('git', ['-C', repo, 'diff', '--numstat', `${from}..${to}`], { encoding: 'utf8' });
  const stats = { kit: empty(), tests: empty(), code: empty(), total: empty() };
  for (const line of output.split('\n').filter(Boolean)) {
    const [added, deleted, path] = line.split('\t');
    for (const bucket of [stats[categoryOf(path)], stats.total]) {
      bucket.files += 1;
      bucket.added += Number(added) || 0;
      bucket.deleted += Number(deleted) || 0;
    }
  }
  return stats;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repo, from, to] = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(changeStats(repo, from, to), null, 2)}\n`);
}
