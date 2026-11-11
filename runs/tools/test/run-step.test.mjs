import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const runner = here('../run-step.mjs');
const fakeBin = here('./fixtures/bin');

const run = (fixture, { exit = '0', prompt = 'Do the thing.', extraArgs = [] } = {}) => {
  const work = mkdtempSync(join(tmpdir(), 'run-step-'));
  const promptFile = join(work, 'prompt.md');
  const argsOut = join(work, 'args.json');
  writeFileSync(promptFile, prompt);
  const result = spawnSync(
    process.execPath,
    [runner, '--kit', 'openspec', '--change', '1', '--step', 'propose', '--cwd', work, '--prompt-file', promptFile, '--runs-dir', join(work, 'runs'), ...extraArgs],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAKE_CLAUDE_FIXTURE: here(`./fixtures/${fixture}`),
        FAKE_CLAUDE_ARGS_OUT: argsOut,
        FAKE_CLAUDE_EXIT: exit,
      },
    },
  );
  return { work, result, argsOut, stepDir: join(work, 'runs', 'openspec', 'change-1') };
};

test('writes the events file and the record for a finished step', () => {
  const { result, stepDir } = run('ok.jsonl');

  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(join(stepDir, 'propose.record.json'), 'utf8'));
  assert.equal(record.kit, 'openspec');
  assert.equal(record.change, '1');
  assert.equal(record.step, 'propose');
  assert.equal(record.phase, 'specify');
  assert.equal(record.round, 1);
  assert.equal(record.status, 'ok');
  assert.equal(record.costUsd, 0.125);
  assert.ok(record.wallMs >= 0);
  assert.ok(Date.parse(record.startedAt) <= Date.parse(record.endedAt));
  const events = readFileSync(join(stepDir, 'propose.events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(events.length, 4);
  assert.equal(typeof events[0].t, 'number');
  assert.equal(events[3].event.type, 'result');
});

test('passes the prompt verbatim, with fixed flags, and runs no shell', () => {
  const prompt = '/opsx:propose "quoted" $(touch injected) `touch injected2` ; touch injected3\nsecond line';
  const { work, argsOut } = run('ok.jsonl', { prompt });

  const { argv, cwd } = JSON.parse(readFileSync(argsOut, 'utf8'));
  assert.equal(argv[0], '-p');
  assert.equal(argv[1], prompt);
  assert.deepEqual(argv.slice(2, 10), ['--model', 'claude-fable-5-2', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--append-system-prompt-file']);
  assert.ok(argv[10].endsWith('process-note.md'));
  assert.ok(!argv.includes('--dangerously-skip-permissions'));
  assert.ok(cwd.endsWith(work.split('/').pop()));
  for (const name of ['injected', 'injected2', 'injected3']) {
    assert.equal(existsSync(join(work, name)), false);
  }
});

test('adds --resume, the round suffix and a PATH prefix when asked', () => {
  const { stepDir, argsOut } = run('ok.jsonl', { extraArgs: ['--resume', 'sess-9', '--round', '2', '--path-prepend', '/opt/kit/bin'] });

  const { argv, path } = JSON.parse(readFileSync(argsOut, 'utf8'));
  assert.deepEqual(argv.slice(-2), ['--resume', 'sess-9']);
  assert.ok(path.startsWith('/opt/kit/bin:'));
  assert.equal(JSON.parse(readFileSync(join(stepDir, 'propose.r2.record.json'), 'utf8')).round, 2);
  assert.ok(existsSync(join(stepDir, 'propose.r2.events.jsonl')));
});

test('a step that dies early still leaves an interrupted record and its partial events, and exits non-zero', () => {
  const { result, stepDir } = run('cut-off.jsonl', { exit: '1' });

  assert.notEqual(result.status, 0);
  const record = JSON.parse(readFileSync(join(stepDir, 'propose.record.json'), 'utf8'));
  assert.equal(record.status, 'interrupted');
  assert.equal(record.exitCode, 1);
  assert.equal(readFileSync(join(stepDir, 'propose.events.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('refuses an unknown kit or a step with no phase', () => {
  const work = mkdtempSync(join(tmpdir(), 'run-step-'));
  writeFileSync(join(work, 'p.md'), 'x');
  const bad = spawnSync(process.execPath, [runner, '--kit', 'other', '--change', '1', '--step', 'propose', '--cwd', work, '--prompt-file', join(work, 'p.md')], { encoding: 'utf8' });

  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /kit/);
});

test('a resumed step records only its own share of cost and tokens, not the whole conversation', () => {
  const { work, result, stepDir } = run('ok.jsonl', { extraArgs: ['--resume', 'sess-1', '--round', '2'] });
  writeFileSync(
    join(stepDir, 'propose.record.json'),
    JSON.stringify({ sessionId: 'sess-1', costUsd: 0.1, inputTokens: 40, outputTokens: 20, cacheReadTokens: 1000, cacheCreationTokens: 100 }),
  );
  const again = spawnSync(
    process.execPath,
    [runner, '--kit', 'openspec', '--change', '1', '--step', 'propose', '--cwd', work, '--prompt-file', join(work, 'prompt.md'), '--runs-dir', join(work, 'runs'), '--resume', 'sess-1', '--round', '2'],
    { encoding: 'utf8', env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_CLAUDE_FIXTURE: here('./fixtures/ok.jsonl') } },
  );

  assert.equal(result.status, 0);
  assert.equal(again.status, 0, again.stderr);
  const record = JSON.parse(readFileSync(join(stepDir, 'propose.r2.record.json'), 'utf8'));
  assert.equal(record.cumulative.costUsd, 0.125);
  assert.equal(Math.round(record.costUsd * 1000), 25);
  assert.deepEqual([record.inputTokens, record.outputTokens, record.cacheReadTokens, record.cacheCreationTokens], [60, 30, 1000, 200]);
});
