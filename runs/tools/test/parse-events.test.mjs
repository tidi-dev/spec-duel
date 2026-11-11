import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEvents } from '../parse-events.mjs';

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => JSON.stringify({ t: 1000 + index, event: JSON.parse(line) }));

test('a finished step yields tokens, cost, turns and status ok', () => {
  const record = parseEvents(fixture('ok.jsonl'));

  assert.equal(record.status, 'ok');
  assert.equal(record.sessionId, 'sess-1');
  assert.equal(record.turns, 3);
  assert.equal(record.apiMs, 3900);
  assert.equal(record.inputTokens, 100);
  assert.equal(record.outputTokens, 50);
  assert.equal(record.cacheReadTokens, 2000);
  assert.equal(record.cacheCreationTokens, 300);
  assert.equal(record.costUsd, 0.125);
  assert.equal(record.resultText, 'Done.');
  assert.deepEqual(record.permissionDenials, [{ tool: 'Bash', input: { command: 'openspec feedback --help' } }]);
});

test('a step cut off before its result event is interrupted, with zero cost and its session id kept', () => {
  const record = parseEvents(fixture('cut-off.jsonl'));

  assert.equal(record.status, 'interrupted');
  assert.equal(record.sessionId, 'sess-1');
  assert.equal(record.costUsd, 0);
  assert.equal(record.turns, 0);
  assert.equal(record.inputTokens, 0);
});

test('a result event flagged as an error yields status error and keeps its usage', () => {
  const record = parseEvents(fixture('error.jsonl'));

  assert.equal(record.status, 'error');
  assert.equal(record.costUsd, 0.01);
});

test('lines that are not JSON are ignored', () => {
  const record = parseEvents(['not json', ...fixture('ok.jsonl'), '']);

  assert.equal(record.status, 'ok');
});

test('no events at all is interrupted', () => {
  assert.equal(parseEvents([]).status, 'interrupted');
});

test('keeps the per-model usage breakdown when the result carries one', () => {
  const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, modelUsage: { 'model-a': { costUSD: 1 } } });

  assert.deepEqual(parseEvents([line]).modelUsage, { 'model-a': { costUSD: 1 } });
  assert.deepEqual(parseEvents([]).modelUsage, {});
});

test('token counts come from the per-model breakdown, which includes subagents, when the result carries one', () => {
  const line = JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, total_cost_usd: 2,
    usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
    modelUsage: {
      'model-a': { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, costUSD: 1.5 },
      'model-b': { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4, costUSD: 0.5 },
    },
  });

  const record = parseEvents([line]);

  assert.deepEqual([record.inputTokens, record.outputTokens, record.cacheReadTokens, record.cacheCreationTokens], [11, 22, 33, 44]);
  assert.equal(record.costUsd, 2);
});
