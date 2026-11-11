#!/usr/bin/env node
import process from 'node:process';
import { archiveChange, tickTasks } from './lib/archive.mjs';
import { activeChangeIds, loadSpecs, validateRepo } from './lib/validate.mjs';

const USAGE = `usage: node cr/bin/cr.mjs <command>
  validate [<change-id>] [--strict]   check changes and living specs; --strict also rejects finished, unarchived changes
  tick <change-id> <T01> [<T02> …]    tick tasks
  archive <change-id>                 merge the change into cr/specs and move it to cr/changes/archive`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const run = (root, [command, ...rest]) => {
  const flags = rest.filter((arg) => arg.startsWith('--'));
  const args = rest.filter((arg) => !arg.startsWith('--'));
  if (command === 'validate') {
    const errors = validateRepo(root, { id: args[0], strict: flags.includes('--strict') });
    if (errors.length) {
      throw new Error(`${errors.join('\n')}\n${plural(errors.length, 'error')}`);
    }
    return `ok: ${plural(args[0] ? 1 : activeChangeIds(root).length, 'change')}, ${plural(loadSpecs(root).length, 'spec')}`;
  }
  if (command === 'tick' && args.length >= 2) {
    return `ticked ${tickTasks(root, args[0], args.slice(1))}`;
  }
  if (command === 'archive' && args.length === 1) {
    const result = archiveChange(root, args[0]);
    return `archived ${args[0]}: ${plural(result.requirements, 'requirement')} merged into ${plural(result.specs, 'spec')}`;
  }
  throw new Error(USAGE);
};

try {
  process.stdout.write(`${run(process.cwd(), process.argv.slice(2))}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
