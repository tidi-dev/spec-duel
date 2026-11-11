#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRIEFS = { 1: '01-feature.md', 2: '02-brownfield.md', 3: '03-bugfix.md' };

const STEPS = {
  openspec: { first: ['propose', '/opsx:propose'], rest: [['apply', '/opsx:apply'], ['archive', '/opsx:archive']], implement: 'apply' },
  speckit: {
    first: ['specify', '/speckit-specify'],
    rest: [
      ['clarify', '/speckit-clarify'],
      ['plan', '/speckit-plan'],
      ['tasks', '/speckit-tasks'],
      ['analyze', '/speckit-analyze'],
      ['implement', '/speckit-implement'],
    ],
    implement: 'implement',
  },
};

export const buildPrompts = (kit, change, briefsDir) => {
  const steps = STEPS[kit];
  if (!steps) {
    throw new Error(`unknown kit "${kit}"`);
  }
  const briefFile = BRIEFS[change];
  if (!briefFile) {
    throw new Error(`unknown change "${change}"`);
  }
  const brief = readFileSync(join(briefsDir, briefFile), 'utf8');
  const prompts = { [steps.first[0]]: `${steps.first[1]} ${brief}` };
  for (const [step, command] of steps.rest) {
    prompts[step] = command;
  }
  if (String(change) === '1') {
    const note = readFileSync(join(briefsDir, 'parallel-note.md'), 'utf8');
    prompts[steps.implement] = `${prompts[steps.implement]}\n\n${note}`;
  }
  return prompts;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kit, change] = process.argv.slice(2);
  const toolsDir = dirname(fileURLToPath(import.meta.url));
  const briefsDir = resolve(toolsDir, '../../plans/261110-1210-openspec-vs-spec-kit-demo/briefs');
  const outDir = resolve(toolsDir, '..', kit, `change-${change}`, 'prompts');
  mkdirSync(outDir, { recursive: true });
  for (const [step, text] of Object.entries(buildPrompts(kit, change, briefsDir))) {
    writeFileSync(join(outDir, `${step}.md`), text);
  }
  process.stderr.write(`make-prompts: wrote prompts to ${outDir}\n`);
}
