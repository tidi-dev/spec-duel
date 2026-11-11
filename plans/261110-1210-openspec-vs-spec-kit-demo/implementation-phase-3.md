# Phase 3: Acceptance suite, runner and briefs

**Status:** Done 2026-11-10 · **Runs:** me · **Tracks:** A and T, in parallel with Phase 2
**Depends on:** Phase 1 Task 3 (the contract). None of this lives inside `baseline/`.
**Risk:** the suite encodes one kit's likely implementation. Mitigation: it is written from design §5.3 and §6 only, before either kit runs, and asserts HTTP behaviour only.
**Security:** the runner starts a fixed command with fixed flags; prompts come from files, never from a shell-interpolated string.

Paths are under `/workspace/spec-duel/`.

### Task 1 (A): the frozen acceptance suite

**Files:**
- Create: `acceptance/package.json` (jest, ts-jest, typescript, `@types/jest`; same versions as the baseline), `acceptance/jest.config.ts`, `acceptance/tsconfig.json`, `acceptance/src/support/http.ts`, `acceptance/src/support/slots.ts`, `acceptance/src/support/poll.ts`
- Create: `acceptance/src/baseline/health.spec.ts`, `baseline/rooms.spec.ts`, `change-1/bookings-crud.spec.ts`, `change-1/idempotency.spec.ts`, `change-1/confirmation.spec.ts`, `change-2/overlap.spec.ts`, `change-3/rooms-paging.spec.ts`

**Interfaces:**
- Consumes: `GATEWAY_URL` from the environment; the routes, headers, error codes and email-domain rules of design §5.3 as literal strings (the suite does not import `@roombook/contract`).
- Produces: `http.ts` wrapping Node's `fetch` and returning `{ status, headers, body }`; `nextSlot(): { startsAt: string; endsAt: string }` returning a fresh, far-future, one-hour slot unique per call across the whole run; `pollUntil<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number): Promise<T>`; `pnpm test -- --selectProjects <group>` per group, with a JSON result file per run (`--json --outputFile`).

Tests, by file:
- `baseline/health`: the four health routes answer 200.
- `baseline/rooms`: page 1 default returns 10 items, `total` 12, ordered by name; page 2 default returns `Room 11`, `Room 12`; `page=0` → 400.
- `change-3/rooms-paging`: `page=2&limit=5` returns `Room 06` to `Room 10`; `page=3&limit=5` returns `Room 11`, `Room 12`.
- `change-1/bookings-crud`: create → 201 with a `BookingDto`; get by id; list filtered by `roomId` contains it and is ordered by `startsAt`; patch title and times → 200; delete → 204 then get → 404 `NOT_FOUND.BOOKING`; `endsAt` not after `startsAt` → 400; unknown room → 404 `NOT_FOUND.ROOM`.
- `change-1/idempotency`: no header → 400 `BAD_REQUEST.IDEMPOTENCY_KEY`; a non-uuid key → the same; a repeat with the same key and body → the same status, the same body, `Idempotency-Replayed: true`, and the list holds one booking; the same key with a different body → 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`; two identical creates sent together → statuses are `{201, 201}` or `{201, 409}`, and exactly one booking exists.
- `change-1/confirmation`: a normal email reaches `SENT` with 1 attempt; `@retry.example` reaches `SENT` with 3 attempts; `@bounce.example` reaches `FAILED` with 3 attempts; after a replayed create the booking still shows 1 attempt (poll timeout 30 s).
- `change-2/overlap`: an overlapping create → 409 `CONFLICT.BOOKING_OVERLAP`; a back-to-back booking → 201; the same times in another room → 201; an update into an occupied slot → 409; an update that only changes the title → 200; two overlapping creates with different keys sent together → exactly one 201 and one 409.

- [x] **Step 1:** Write the support files and the spec files. Review Focus 4: every booking in `change-1/` and `change-3/` takes its times from `nextSlot()`, so those groups stay valid once overlap is forbidden; only `change-2/` creates overlaps on purpose.
- [x] **Step 2:** `pnpm install` in `acceptance/`; `npx tsc --noEmit -p acceptance` → exit 0.
- [x] **Step 3:** With no stack running, run the suite → every test fails on connection, none on a type or syntax error.
- [x] **Step 4:** Used by Phase 2 Task 5 Step 4 for the baseline expectation. No commit: `acceptance/` is outside the baseline repo; its file hashes are recorded in `runs/baseline.json` at tag time so later edits would show.

### Task 2 (T): the step runner and metrics

**Files:**
- Create: `runs/tools/run-step.mjs`, `runs/tools/parse-events.mjs`, `runs/tools/rollup.mjs`, `runs/tools/log.mjs`, `runs/tools/process-note.md`, `runs/tools/phases.json`
- Test: `runs/tools/test/parse-events.test.mjs`, `run-step.test.mjs`, `rollup.test.mjs`, `test/fixtures/fake-claude.mjs`, `test/fixtures/*.jsonl` (run with `node --test`; no dependencies)

**Interfaces:**
- `node runs/tools/run-step.mjs --kit <openspec|speckit> --change <setup|1|2|3> --step <name> --cwd <variant dir> --prompt-file <path> [--resume <session id>] [--round <n>]`
  - Starts `claude -p --model claude-fable-5-2 --output-format stream-json --verbose --permission-mode acceptEdits --append-system-prompt-file runs/tools/process-note.md` in `--cwd`, with the prompt file's content as the prompt (passed as an argument array, no shell).
  - `--path-prepend <dir>` (optional) puts a directory first on the session's `PATH`; the OpenSpec variant uses it for `node_modules/.bin`, because its generated skills call `openspec` by bare name.
  - Writes `runs/<kit>/change-<n>/<step>[.r<round>].events.jsonl` (one line per event: `{ t: <epoch ms received>, event }`) and `<step>[.r<round>].record.json`.
- Record shape (`StepRecord`): `kit`, `change`, `step`, `phase` (from `phases.json`: `setup | specify | plan | check | implement | close`), `round`, `startedAt`, `endedAt`, `wallMs`, `apiMs`, `turns`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `costUsd`, `sessionId`, `status` (`ok | error | interrupted`), `permissionDenials`, `resultText`. Questions and re-prompts are not in the record; they are logged by the operator in `runs/<kit>/interventions.jsonl` (Phase 5) and merged by `rollup.mjs`.
- `parseEvents(lines: string[]): StepRecord` fields come from the final `result` event; `status` is `interrupted` when there is no result event.
- `node runs/tools/rollup.mjs` → `runs/metrics.json`: totals per kit × change × phase, per kit × change, per kit, with re-prompt and question counts.
- `node runs/tools/log.mjs <phase> <start|end> [--tokens <n>] [--note <text>]` appends to `runs/project-log.jsonl`.
- `process-note.md`: the added instruction of design §8, the same file for both kits: the kit's workflow is the process for this session; the planner, tester, review-gate and stop-and-ask rules of the shared rules do not apply; the code standards do; never read `.env*`; local git only.

- [x] **Step 1:** Write failing tests. `parse-events`: a fixture with a `result` event yields the right tokens, cost, turns and `status: 'ok'`; a fixture cut off mid-stream yields `status: 'interrupted'` with zero cost (Review Focus 3). `run-step`: with `fake-claude.mjs` first on `PATH`, the runner writes both files, passes the prompt unchanged (a prompt containing `$(touch x)` and quotes arrives verbatim and creates no file), and exits non-zero while still writing an `interrupted` record when the fake exits 1. `rollup`: three fixture records sum correctly per phase.
- [x] **Step 2:** Run `node --test runs/tools/test/` → FAIL.
- [x] **Step 3:** Implement with `node:child_process.spawn` (argument array), `node:fs`, `node:readline`.
- [x] **Step 4:** Run `node --test runs/tools/test/` → PASS.
- [x] **Step 5:** One real call to learn the event shapes: run the runner in a scratch folder with `--model` overridden to `haiku` through a test-only env var and the prompt "Reply with the word ok." Confirm the record's tokens and cost are non-zero and match the last event; adjust the parser fixtures to the real shape if they differ.

### Task 3 (A): the three briefs

**Files:**
- Create: `plans/261110-1210-openspec-vs-spec-kit-demo/briefs/project-rules.md`, `briefs/01-feature.md`, `briefs/02-brownfield.md`, `briefs/03-bugfix.md`, `briefs/parallel-note.md`, `briefs/operator-answers.md`

Content, decided here:
- `project-rules.md`: the scored rules of design §9.2 as plain statements, plus "the contract lib is the source of truth for routes, DTOs and error codes". Used for OpenSpec's `config.yaml` context and for `/speckit-constitution`.
- `01-feature.md`: design §5.3 "Bookings", "Idempotent create" and "Confirmation job" and §5.4's `/bookings` page, as requirements. States: use `@roombook/contract` as it is; the room service and the `/rooms` page are out of scope.
- `02-brownfield.md`: design §6.2 word for word as requirements, including adding `CONFLICT.BOOKING_OVERLAP` to `libs/contract`; the room service is out of scope.
- `03-bugfix.md`: the bug report of design §6.3, with "analyse and write up the cause before fixing".
- `parallel-note.md`: the added instruction for change 1's implementation step: delegate backend tasks to `nestjs-expert` and frontend tasks to `nextjs-fe-developer` in parallel, `libs/contract` read-only, then build, lint and test together.
- `operator-answers.md`: the rule for kit questions (design §8) and a table that is filled in during the runs: kit, change, step, question, answer, source line in the brief.

- [x] **Step 1:** Write the six files. No brief mentions either kit, the acceptance suite, or how to implement anything.
- [x] **Step 2:** Check each acceptance test against the briefs: every asserted behaviour is stated in a brief. List any gap and close it in the brief (not by deleting the test).
- [x] **Step 3:** Record the briefs' file hashes in `runs/baseline.json` at tag time.

**Success criteria:** the suite type-checks and reaches its expected baseline state in Phase 2 Task 5; `node --test runs/tools/test/` passes; one real record exists; six brief files exist and cover every asserted behaviour.
