const TITLE = /^# ([a-z0-9]+(?:-[a-z0-9]+)*): (.+)$/;
const TIER = /^Tier:\s*(\S+)\s*$/;
const SECTION = /^## (.+?)\s*$/;
const OPERATION = /^### (ADDED|MODIFIED|REMOVED) ([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/;
const REQUIREMENT = /^#{2}(?:#{2})? ([A-Z]{2,5}-\d{3}): (.+)$/;
const RISK_ROW = /^\|\s*(R-\d{2})\s*\|\s*(yes|no)\s*\|([^|]*)\|\s*([^|]*?)\s*\|\s*$/;
const TASK = /^- \[( |x)\] (T\d{2,3}) @([a-z]+) \[([^\]]+)\] (.+?)(?:\s+\|\s+(.+))?$/;

const trimBlank = (lines) => {
  const body = [...lines];
  while (body.length && !body[0].trim()) {
    body.shift();
  }
  while (body.length && !body[body.length - 1].trim()) {
    body.pop();
  }
  return body;
};

const splitList = (text) =>
  String(text ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const parseChange = (text) => {
  const lines = text.replace(/\n$/, '').split('\n');
  const title = TITLE.exec(lines[0] ?? '');
  const change = {
    id: title?.[1] ?? null,
    title: title?.[2] ?? null,
    tier: null,
    lineCount: lines.length,
    sections: [],
    requirements: [],
    risks: [],
    tasks: [],
  };
  let section = null;
  let operation = null;
  let requirement = null;
  for (const line of lines.slice(1)) {
    const heading = SECTION.exec(line);
    if (heading && !line.startsWith('###')) {
      section = heading[1];
      change.sections.push(section);
      operation = null;
      requirement = null;
      continue;
    }
    if (!section) {
      change.tier ??= TIER.exec(line)?.[1] ?? null;
      continue;
    }
    if (section === 'Requirements') {
      const op = OPERATION.exec(line);
      const start = line.startsWith('####') ? REQUIREMENT.exec(line) : null;
      if (op) {
        operation = { op: op[1], capability: op[2] };
        requirement = null;
      } else if (start && operation) {
        requirement = { ...operation, id: start[1], name: start[2], body: [] };
        change.requirements.push(requirement);
      } else if (requirement) {
        requirement.body.push(line);
      }
    } else if (section === 'Risks') {
      const row = RISK_ROW.exec(line);
      if (row) {
        change.risks.push({ id: row[1], applies: row[2], note: row[3].trim(), task: row[4] });
      }
    } else if (section === 'Tasks') {
      const task = TASK.exec(line);
      if (task) {
        change.tasks.push({ id: task[2], done: task[1] === 'x', track: task[3], refs: splitList(task[4]), text: task[5], files: splitList(task[6]) });
      } else if (line.startsWith('- [')) {
        change.tasks.push({ malformed: line });
      }
    }
  }
  for (const item of change.requirements) {
    item.body = trimBlank(item.body);
  }
  return change;
};

export const parseSpec = (text) => {
  const lines = text.replace(/\n$/, '').split('\n');
  const spec = { capability: /^# (\S+)\s*$/.exec(lines[0] ?? '')?.[1] ?? null, requirements: [] };
  let requirement = null;
  for (const line of lines.slice(1)) {
    const start = line.startsWith('## ') ? REQUIREMENT.exec(line) : null;
    if (start) {
      requirement = { id: start[1], name: start[2], body: [] };
      spec.requirements.push(requirement);
    } else if (requirement) {
      requirement.body.push(line);
    }
  }
  for (const item of spec.requirements) {
    item.body = trimBlank(item.body);
  }
  return spec;
};

export const formatSpec = (spec) =>
  `# ${spec.capability}\n${spec.requirements.map((item) => `\n## ${item.id}: ${item.name}\n${item.body.join('\n')}\n`).join('')}`;

export const parseRiskIds = (text) => [...text.matchAll(/^## (R-\d{2})\b/gm)].map((match) => match[1]);
