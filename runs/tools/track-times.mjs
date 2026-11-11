#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [eventsPath] = process.argv.slice(2);
const launched = new Map();
const spans = new Map();
let first = null;
for (const line of readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean)) {
  const { t, event } = JSON.parse(line);
  first ??= t;
  const parent = event?.parent_tool_use_id;
  if (parent) {
    const span = spans.get(parent) ?? { firstEventAt: t, lastEventAt: t, events: 0 };
    span.lastEventAt = t;
    span.events += 1;
    spans.set(parent, span);
    continue;
  }
  for (const block of Array.isArray(event?.message?.content) ? event.message.content : []) {
    if (block.type === 'tool_use' && ['Agent', 'Task'].includes(block.name)) {
      launched.set(block.id, { agent: block.input?.subagent_type ?? 'general-purpose', description: block.input?.description ?? '', launchedAt: t });
    }
  }
}
const tracks = [...launched.entries()].map(([id, track]) => {
  const span = spans.get(id);
  return {
    ...track,
    launchedAtMs: track.launchedAt - first,
    endedAtMs: span ? span.lastEventAt - first : null,
    wallMs: span ? span.lastEventAt - track.launchedAt : null,
    events: span?.events ?? 0,
  };
});
process.stdout.write(`${JSON.stringify(tracks, null, 2)}\n`);
