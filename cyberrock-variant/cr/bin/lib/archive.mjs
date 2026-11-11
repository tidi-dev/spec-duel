import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatSpec, parseSpec } from './parse.mjs';
import { changesDir, readChange, specsDir, validateRepo } from './validate.mjs';

const changeFile = (root, id) => join(changesDir(root), id, 'change.md');

export const tickTasks = (root, id, taskIds) => {
  let text = readFileSync(changeFile(root, id), 'utf8');
  for (const taskId of taskIds) {
    const open = new RegExp(`^- \\[ \\] ${taskId} `, 'm');
    const done = new RegExp(`^- \\[x\\] ${taskId} `, 'm');
    if (open.test(text)) {
      text = text.replace(open, `- [x] ${taskId} `);
    } else if (!done.test(text)) {
      throw new Error(`${taskId} is not a task of ${id}`);
    }
  }
  writeFileSync(changeFile(root, id), text);
  return taskIds.length;
};

const mergeInto = (spec, item) => {
  const index = spec.requirements.findIndex((existing) => existing.id === item.id);
  if (item.op === 'REMOVED') {
    spec.requirements.splice(index, 1);
  } else if (item.op === 'MODIFIED') {
    spec.requirements[index] = { id: item.id, name: item.name, body: item.body };
  } else {
    spec.requirements.push({ id: item.id, name: item.name, body: item.body });
  }
};

export const archiveChange = (root, id) => {
  const errors = validateRepo(root, { id });
  if (errors.length) {
    throw new Error(`cannot archive ${id}:\n${errors.join('\n')}`);
  }
  const change = readChange(root, id);
  const open = change.tasks.filter((task) => !task.done).map((task) => task.id);
  if (open.length) {
    throw new Error(`cannot archive ${id}: open tasks: ${open.join(', ')}`);
  }
  mkdirSync(specsDir(root), { recursive: true });
  const touched = new Map();
  for (const item of change.requirements) {
    const path = join(specsDir(root), `${item.capability}.md`);
    if (!touched.has(path)) {
      touched.set(path, existsSync(path) ? parseSpec(readFileSync(path, 'utf8')) : { capability: item.capability, requirements: [] });
    }
    mergeInto(touched.get(path), item);
  }
  for (const [path, spec] of touched) {
    writeFileSync(path, formatSpec(spec));
  }
  const target = join(changesDir(root), 'archive', id);
  if (existsSync(target)) {
    throw new Error(`cannot archive ${id}: cr/changes/archive/${id} already exists`);
  }
  mkdirSync(join(changesDir(root), 'archive'), { recursive: true });
  renameSync(join(changesDir(root), id), target);
  return { specs: touched.size, requirements: change.requirements.length };
};
