import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseChange, parseRiskIds, parseSpec } from './parse.mjs';

export const BUDGET = {
  fix: { lines: 40, tasks: 5 },
  change: { lines: 120, tasks: 14 },
  feature: { lines: 250, tasks: 30 },
};
const SECTIONS = { fix: ['Cause', 'Tasks'], change: ['Why', 'Requirements', 'Design', 'Risks', 'Tasks'], feature: ['Why', 'Requirements', 'Design', 'Risks', 'Tasks'] };
const FREE_TAGS = ['verify', 'regression'];
const SCENARIO = /^- Scenario: .*\bWHEN\b.*\bTHEN\b/;

const prefixOf = (id) => id.split('-')[0];

export const changesDir = (root) => join(root, 'cr', 'changes');
export const specsDir = (root) => join(root, 'cr', 'specs');

export const activeChangeIds = (root) =>
  existsSync(changesDir(root))
    ? readdirSync(changesDir(root)).filter((name) => name !== 'archive' && statSync(join(changesDir(root), name)).isDirectory())
    : [];

export const loadSpecs = (root) =>
  existsSync(specsDir(root))
    ? readdirSync(specsDir(root))
        .filter((name) => name.endsWith('.md'))
        .map((name) => ({ file: `cr/specs/${name}`, name: name.replace(/\.md$/, ''), ...parseSpec(readFileSync(join(specsDir(root), name), 'utf8')) }))
    : [];

const checkRequirementBody = (item, errors) => {
  if (!item.body.some((line) => /\bSHALL\b/.test(line))) {
    errors.push(`${item.id} has no SHALL statement`);
  }
  if (!item.body.some((line) => SCENARIO.test(line))) {
    errors.push(`${item.id} has no "- Scenario: … WHEN … THEN …" line`);
  }
};

export const validateSpecs = (specs) => {
  const errors = [];
  const owners = new Map();
  for (const spec of specs) {
    const report = (message) => errors.push(`${spec.file}: ${message}`);
    if (spec.capability !== spec.name) {
      report(`first line must be "# ${spec.name}"`);
    }
    for (const item of spec.requirements) {
      if (owners.has(item.id)) {
        report(`${item.id} is defined twice (also in ${owners.get(item.id)})`);
      }
      owners.set(item.id, spec.file);
      const local = [];
      checkRequirementBody(item, local);
      local.forEach(report);
    }
  }
  return errors;
};

const checkDeltas = (change, specs, errors) => {
  const living = new Map(specs.flatMap((spec) => spec.requirements.map((item) => [item.id, spec.name])));
  const prefixOwner = new Map(specs.flatMap((spec) => spec.requirements.map((item) => [prefixOf(item.id), spec.name])));
  const seen = new Set();
  for (const item of change.requirements) {
    if (seen.has(item.id)) {
      errors.push(`${item.id} appears twice in Requirements`);
    }
    seen.add(item.id);
    const owner = prefixOwner.get(prefixOf(item.id));
    if (owner && owner !== item.capability) {
      errors.push(`${item.id}: prefix ${prefixOf(item.id)} already belongs to ${owner}`);
    }
    prefixOwner.set(prefixOf(item.id), owner ?? item.capability);
    if (item.op === 'ADDED' && living.has(item.id)) {
      errors.push(`ADDED ${item.id} already exists in ${living.get(item.id)}`);
    }
    if (item.op !== 'ADDED' && living.get(item.id) !== item.capability) {
      errors.push(`${item.op} ${item.id} does not exist in ${item.capability}`);
    }
    if (item.op !== 'REMOVED') {
      checkRequirementBody(item, errors);
    }
  }
};

const checkTasks = (change, errors) => {
  const requirementIds = new Set(change.requirements.map((item) => item.id));
  const applyingRisks = new Set(change.risks.filter((risk) => risk.applies === 'yes').map((risk) => risk.id));
  const referenced = new Set();
  const fileTracks = new Map();
  for (const task of change.tasks) {
    if (task.malformed) {
      errors.push(`malformed task line: "${task.malformed}" (expected "- [ ] T01 @track [refs] text | files")`);
      continue;
    }
    for (const ref of task.refs) {
      referenced.add(ref);
      const known = FREE_TAGS.includes(ref) || requirementIds.has(ref) || applyingRisks.has(ref);
      if (!known) {
        errors.push(`${task.id} references unknown "${ref}"`);
      }
    }
    for (const file of task.track === 'main' ? [] : task.files) {
      const other = fileTracks.get(file);
      if (other && other !== task.track) {
        errors.push(`${file} is listed in tracks ${other} and ${task.track}`);
      }
      fileTracks.set(file, other ?? task.track);
    }
  }
  for (const id of requirementIds) {
    if (!referenced.has(id)) {
      errors.push(`${id} has no task`);
    }
  }
  if (change.tier === 'fix' && !referenced.has('regression')) {
    errors.push('a fix needs a task tagged [regression]');
  }
};

const checkRisks = (change, riskIds, errors) => {
  const taskIds = new Set(change.tasks.map((task) => task.id));
  for (const id of riskIds) {
    const rows = change.risks.filter((risk) => risk.id === id);
    if (rows.length !== 1 && change.tier !== 'fix') {
      errors.push(rows.length ? `Risks table lists ${id} ${rows.length} times` : `Risks table is missing ${id}`);
    }
  }
  for (const risk of change.risks) {
    if (!riskIds.includes(risk.id)) {
      errors.push(`${risk.id} is not in cr/risks.md`);
    } else if (risk.applies === 'yes' && !taskIds.has(risk.task)) {
      errors.push(`${risk.id} applies but task "${risk.task}" does not exist`);
    } else if (risk.applies === 'no' && !risk.note) {
      errors.push(`${risk.id} does not apply but gives no reason`);
    }
  }
};

export const validateChange = (change, folder, { specs, riskIds, strict }) => {
  const errors = [];
  if (change.id !== folder) {
    errors.push(`title id "${change.id}" does not match folder "${folder}" (first line: "# ${folder}: <title>")`);
  }
  if (!BUDGET[change.tier]) {
    errors.push('Tier must be feature, change or fix');
    return errors;
  }
  for (const section of SECTIONS[change.tier]) {
    if (!change.sections.includes(section)) {
      errors.push(`missing section "## ${section}"`);
    }
  }
  if (change.tier !== 'fix' && change.requirements.length === 0) {
    errors.push('Requirements has no "#### <ID>: <name>" block under an ADDED, MODIFIED or REMOVED heading');
  }
  checkDeltas(change, specs, errors);
  checkRisks(change, riskIds, errors);
  checkTasks(change, errors);
  const budget = BUDGET[change.tier];
  const article = change.tier === 'fix' ? 'a fix' : `a ${change.tier}`;
  if (change.lineCount > budget.lines) {
    errors.push(`${change.lineCount} lines, budget for ${article} is ${budget.lines}: cut restatement, refer to requirements by id`);
  }
  if (change.tasks.length > budget.tasks) {
    errors.push(`${change.tasks.length} tasks, budget for ${article} is ${budget.tasks}`);
  }
  if (change.tasks.length === 0) {
    errors.push('Tasks has no task line');
  } else if (strict && change.tasks.every((task) => task.done)) {
    errors.push('every task is ticked but the change is not archived: run "node cr/bin/cr.mjs archive"');
  }
  return errors;
};

export const readChange = (root, id) => parseChange(readFileSync(join(changesDir(root), id, 'change.md'), 'utf8'));

export const validateRepo = (root, { id, strict = false } = {}) => {
  const specs = loadSpecs(root);
  const risksPath = join(root, 'cr', 'risks.md');
  const riskIds = existsSync(risksPath) ? parseRiskIds(readFileSync(risksPath, 'utf8')) : [];
  const errors = validateSpecs(specs);
  for (const folder of id ? [id] : activeChangeIds(root)) {
    const file = `cr/changes/${folder}/change.md`;
    if (!existsSync(join(root, file))) {
      errors.push(`${file}: not found`);
      continue;
    }
    errors.push(...validateChange(readChange(root, folder), folder, { specs, riskIds, strict }).map((message) => `${file}: ${message}`));
  }
  return errors;
};
