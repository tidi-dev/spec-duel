#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryOf } from './change-stats.mjs';

const KITS = ['openspec', 'speckit'];
const SUMMED = ['wallMs', 'turns', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'costUsd'];
const FROM_TAG = { 1: 'kit-installed', 2: 'change-1-done', 3: 'change-2-done' };
const TEXT_LIMIT = 400;
const DOCUMENT_LIMIT = 20000;

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

const readLines = (path) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []);

const relativeToVariant = (path, kit) => {
  const marker = `/${kit}-variant/`;
  const index = String(path).indexOf(marker);
  return index === -1 ? String(path) : String(path).slice(index + marker.length);
};

const toolTarget = (input, kit) => {
  if (input.file_path) {
    return relativeToVariant(input.file_path, kit);
  }
  return String(input.command ?? input.pattern ?? input.description ?? input.skill ?? input.subagent_type ?? '').slice(0, 160);
};

const eventsOf = (path, kit, stepStartedAt, offset) => {
  const events = [];
  for (const line of readLines(path)) {
    const { t, event } = JSON.parse(line);
    const atMs = offset + Math.max(0, t - stepStartedAt);
    if (event?.type === 'result') {
      events.push({ atMs, kind: 'result', label: String(event.result ?? '').slice(0, TEXT_LIMIT), detail: event.subtype ?? '' });
    }
    if (event?.type !== 'assistant') {
      continue;
    }
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) {
        events.push({ atMs, kind: 'text', label: block.text.trim().slice(0, TEXT_LIMIT), detail: '' });
      }
      if (block.type === 'tool_use') {
        const kind = ['Write', 'Edit'].includes(block.name) ? 'file' : 'tool';
        events.push({ atMs, kind, label: `${block.name} ${toolTarget(block.input ?? {}, kit)}`.trim(), detail: block.name });
      }
    }
  }
  return events;
};

const git = (repo, args) => {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const titleOf = (path) => {
  const living = /^openspec\/specs\/([^/]+)\/spec\.md$/.exec(path);
  if (living) return `living spec: ${living[1]}`;
  const delta = /^openspec\/changes\/(?:archive\/)?[^/]+\/specs\/([^/]+)\/spec\.md$/.exec(path);
  if (delta) return `change notes: ${delta[1]}`;
  const change = /^openspec\/changes\/(?:archive\/)?[^/]+\/(.+)$/.exec(path);
  if (change) return `change: ${change[1]}`;
  const feature = /^specs\/(\d+)-[^/]+\/(.+)$/.exec(path);
  if (feature) return `${feature[1]}: ${feature[2]}`;
  return path;
};

const DOCUMENT_ORDER = [
  /proposal\.md$/, /design\.md$/, /^openspec\/.*\/tasks\.md$/, /^openspec\/changes\/.*\/specs\//, /^openspec\/specs\//,
  /\/spec\.md$/, /\/plan\.md$/, /^specs\/.*\/tasks\.md$/, /\/research\.md$/, /data-model\.md$/, /quickstart\.md$/, /\/contracts\//, /\/checklists\//,
];
const rankOf = (path) => {
  const rank = DOCUMENT_ORDER.findIndex((pattern) => pattern.test(path));
  return rank === -1 ? DOCUMENT_ORDER.length : rank;
};

const documentsOf = (variant, change) => {
  if (!existsSync(variant)) {
    return [];
  }
  const from = FROM_TAG[change];
  const to = `change-${change}-done`;
  const present = new Set(git(variant, ['ls-tree', '-r', '--name-only', to]).split('\n'));
  return git(variant, ['diff', '--numstat', `${from}..${to}`])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[2])
    .filter((path) => categoryOf(path) === 'kit')
    .sort((left, right) => rankOf(left) - rankOf(right) || left.localeCompare(right))
    .map((path) => ({
      title: titleOf(path),
      path,
      content: present.has(path) ? git(variant, ['show', `${to}:${path}`]).slice(0, DOCUMENT_LIMIT) : '(This file was removed in this change.)',
    }));
};

const countInterventions = (kitDir, change) => {
  const counts = { questions: 0, reprompts: 0 };
  for (const line of readLines(join(kitDir, 'interventions.jsonl'))) {
    const entry = JSON.parse(line);
    if (String(entry.change) !== String(change)) {
      continue;
    }
    counts.questions += entry.kind === 'question' ? 1 : 0;
    counts.reprompts += entry.kind === 'reprompt' ? 1 : 0;
  }
  return counts;
};

const kitTimeline = (runsDir, kit, change, variantsDir) => {
  const kitDir = join(runsDir, kit);
  const stepDir = join(kitDir, `change-${change}`);
  const records = existsSync(stepDir)
    ? readdirSync(stepDir)
        .filter((name) => name.endsWith('.record.json'))
        .map((name) => ({ name, record: readJson(join(stepDir, name)) }))
        .sort((left, right) => Date.parse(left.record.startedAt) - Date.parse(right.record.startedAt))
    : [];
  const totals = { ...Object.fromEntries(SUMMED.map((key) => [key, 0])), ...countInterventions(kitDir, change), filesWritten: 0 };
  const phases = [];
  const events = [];
  let offset = 0;
  for (const { name, record } of records) {
    phases.push({
      phase: record.phase, step: record.step, round: record.round, status: record.status,
      startMs: offset, endMs: offset + record.wallMs,
      tokens: (record.inputTokens ?? 0) + (record.outputTokens ?? 0), costUsd: record.costUsd ?? 0, turns: record.turns ?? 0,
    });
    events.push(...eventsOf(join(stepDir, name.replace('.record.json', '.events.jsonl')), kit, Date.parse(record.startedAt), offset));
    for (const key of SUMMED) {
      totals[key] += record[key] ?? 0;
    }
    offset += record.wallMs;
  }
  totals.filesWritten = new Set(events.filter((event) => event.kind === 'file').map((event) => event.label)).size;
  const last = records.at(-1)?.record;
  const status = records.length === 0 ? 'missing' : last.status === 'ok' ? 'recorded' : 'partial';
  return {
    status, totals, phases, events,
    documents: documentsOf(join(variantsDir, `${kit}-variant`), change),
    diffStat: readJson(join(stepDir, 'stats.json')),
    verify: readJson(join(stepDir, 'verify.json')),
    acceptance: readJson(join(stepDir, 'acceptance-summary.json')),
    rules: readJson(join(stepDir, 'rules.json')),
    before: readJson(join(stepDir, 'before.json')),
    after: readJson(join(stepDir, 'after.json')),
  };
};

export const buildTimeline = (runsDir, change, { variantsDir }) => {
  const kits = Object.fromEntries(KITS.map((kit) => [kit, kitTimeline(runsDir, kit, String(change), variantsDir)]));
  const starts = KITS.flatMap((kit) => readdirSync(existsSync(join(runsDir, kit, `change-${change}`)) ? join(runsDir, kit, `change-${change}`) : runsDir)
    .filter((name) => name.endsWith('.record.json'))
    .map((name) => readJson(join(runsDir, kit, `change-${change}`, name))?.startedAt)
    .filter(Boolean));
  return { change: String(change), recordedAt: starts.sort()[0] ?? null, kits };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  mkdirSync(join(runsDir, 'timelines'), { recursive: true });
  for (const change of ['1', '2', '3']) {
    const timeline = buildTimeline(runsDir, change, { variantsDir: resolve(runsDir, '..') });
    writeFileSync(join(runsDir, 'timelines', `change-${change}.json`), `${JSON.stringify(timeline)}\n`);
    process.stderr.write(`build-timeline: change ${change}: openspec ${timeline.kits.openspec.status}, speckit ${timeline.kits.speckit.status}\n`);
  }
}
