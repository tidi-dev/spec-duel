#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryOf } from './change-stats.mjs';

const WRITERS = { Write: 'content', Edit: 'new_string' };
const READERS = ['Read'];
const AGENT_TOOLS = ['Agent', 'Task'];

const relative = (path) => String(path ?? '').replace(/^.*-variant\//, '');
const lineCount = (text) => (typeof text === 'string' && text.length ? text.split('\n').length : 0);
const bump = (map, key, by = 1) => {
  map[key] = (map[key] ?? 0) + by;
};

export const profileStep = (lines) => {
  const profile = {
    tools: { main: {}, sub: {} },
    denials: 0,
    subagents: 0,
    skills: [],
    reads: { calls: 0, files: 0, repeats: 0 },
    written: { kit: { files: 0, lines: 0 }, tests: { files: 0, lines: 0 }, code: { files: 0, lines: 0 } },
    contextLoadTokens: 0,
  };
  const readCounts = {};
  const writtenFiles = { kit: new Set(), tests: new Set(), code: new Set() };
  let firstUsageSeen = false;
  for (const line of lines) {
    let event;
    try {
      const parsed = JSON.parse(line);
      event = parsed.event ?? parsed;
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'permission_denied') {
      profile.denials += 1;
      continue;
    }
    if (event.type !== 'assistant') {
      continue;
    }
    const scope = event.parent_tool_use_id ? 'sub' : 'main';
    const usage = event.message?.usage;
    if (!firstUsageSeen && scope === 'main' && usage) {
      firstUsageSeen = true;
      profile.contextLoadTokens = (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.input_tokens ?? 0);
    }
    for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
      if (block.type !== 'tool_use') {
        continue;
      }
      bump(profile.tools[scope], block.name);
      if (AGENT_TOOLS.includes(block.name)) {
        profile.subagents += 1;
      }
      if (block.name === 'Skill' && block.input?.skill) {
        profile.skills.push(block.input.skill);
      }
      if (READERS.includes(block.name)) {
        profile.reads.calls += 1;
        bump(readCounts, relative(block.input?.file_path));
      }
      const field = WRITERS[block.name];
      if (field) {
        const path = relative(block.input?.file_path);
        const category = categoryOf(path);
        writtenFiles[category].add(path);
        profile.written[category].lines += lineCount(block.input?.[field]);
      }
    }
  }
  profile.reads.files = Object.keys(readCounts).length;
  profile.reads.repeats = Object.values(readCounts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  for (const category of Object.keys(writtenFiles)) {
    profile.written[category].files = writtenFiles[category].size;
  }
  return profile;
};

const sumValues = (map) => Object.values(map).reduce((sum, count) => sum + count, 0);

export const profileRuns = (runsDir, kits) => {
  const rows = [];
  for (const kit of kits) {
    const kitDir = join(runsDir, kit);
    if (!existsSync(kitDir)) {
      continue;
    }
    for (const change of readdirSync(kitDir).filter((name) => /^change-\d+$/.test(name) && statSync(join(kitDir, name)).isDirectory())) {
      const dir = join(kitDir, change);
      for (const name of readdirSync(dir).filter((file) => file.endsWith('.record.json'))) {
        const record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        const eventsPath = join(dir, name.replace('.record.json', '.events.jsonl'));
        const profile = profileStep(existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean) : []);
        rows.push({
          kit,
          change: record.change,
          step: record.step,
          round: record.round,
          phase: record.phase,
          status: record.status,
          wallS: Math.round(record.wallMs / 1000),
          costUsd: Number(record.costUsd.toFixed(2)),
          turns: record.turns,
          outputTokens: record.outputTokens,
          cacheCreationTokens: record.cacheCreationTokens,
          cacheReadTokens: record.cacheReadTokens,
          thinkingTokens: sumValues(Object.fromEntries(Object.entries(record.modelUsage ?? {}).map(([model, usage]) => [model, usage.thinkingTokens ?? 0]))),
          mainToolCalls: sumValues(profile.tools.main),
          subToolCalls: sumValues(profile.tools.sub),
          ...profile,
        });
      }
    }
  }
  return rows.sort((a, b) => `${a.kit}${a.change}`.localeCompare(`${b.kit}${b.change}`) || a.step.localeCompare(b.step) || a.round - b.round);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const kits = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'phases.json'), 'utf8')));
  process.stdout.write(`${JSON.stringify(profileRuns(runsDir, kits), null, 2)}\n`);
}
