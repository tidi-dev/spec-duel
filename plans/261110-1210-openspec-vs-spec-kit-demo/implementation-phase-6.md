# Phase 6: Demo console

**Status:** Not started · **Runs:** me · **Track:** C
**Depends on:** Phase 3 Task 2 (record and event formats). Can start once the first change's recordings exist; finished after Phase 5.
**Risk:** the replay misrepresents the run. Mitigation: every figure on screen is read from `runs/metrics.json` or a step record; compressed time is always shown next to real time; the scene carries a "recorded" label and date.
**Security:** the server binds to `127.0.0.1` only, serves files only from `console/public` and `runs/`, takes no free text from the page, and its live route can start only the prepared steps. No dependency is added; plain Node and browser APIs.

Paths are under `/workspace/spec-duel/`.

### Task 1: timelines

**Files:**
- Create: `runs/tools/build-timeline.mjs`
- Test: `runs/tools/test/build-timeline.test.mjs`

**Interfaces:**
- `node runs/tools/build-timeline.mjs` → `runs/timelines/change-<n>.json`, one per change:
  `{ change, recordedAt, kits: { openspec: KitTimeline, speckit: KitTimeline } }` with
  `KitTimeline = { status: 'recorded' | 'partial' | 'missing', totals: { wallMs, turns, inputTokens, outputTokens, cacheReadTokens, costUsd, questions, reprompts, filesWritten }, phases: [{ phase, step, startMs, endMs, tokens, costUsd }], events: [{ atMs, kind: 'text' | 'tool' | 'file' | 'result', label, detail }], documents: [{ title, path, content }], diffStat, verify, acceptance, before, after }`.
- `atMs` and `startMs` are offsets from the first step's start, with the idle gaps between steps removed. `events` keeps assistant text (trimmed to 400 characters), tool names with their target path, and files written. `documents` are the kit's own files for that change, read from the variant at the `change-<n>-done` tag.

- [ ] **Step 1:** Write failing tests on fixture recordings: two steps with a gap produce contiguous phases; a kit folder with no records yields `status: 'missing'`; a kit whose last record is `interrupted` yields `partial` (Review Focus 5).
- [ ] **Step 2:** `node --test runs/tools/test/` → FAIL. Implement. → PASS.

### Task 2: server and page

**Files:**
- Create: `console/server.mjs`, `console/public/index.html`, `console/public/console.js`, `console/public/console.css`, `console/README.md`
- Test: `console/test/server.test.mjs`

**Interfaces:**
- `node console/server.mjs [--port 4300]` (binds `127.0.0.1`).
- `GET /api/scenes` → `[{ change, title, recordedAt, kits: { openspec: status, speckit: status } }]`.
- `GET /api/scenes/:change` → the timeline JSON.
- `POST /api/live/:change` → starts the prepared live run (Task 3) and returns `{ runId }`; `GET /api/live/:runId/events` → server-sent events in the timeline's event shape.
- Page behaviour: a scene picker (Feature, Brownfield change, Bugfix); two columns; per column a phase strip with a running clock, token and cost counters, an event feed, tabs for the kit's documents and the diff summary, then the result block; a closing comparison row; a banner "Recorded <date> · real time <h:mm:ss> · played in about 2 minutes". The bugfix scene opens with the "before" view (the recorded page-2 response as a rooms table, plus the screenshot when present) and a "Run bugfix" button, and closes with the "after" view. A "Live" switch changes the button to the live route.
- Playback speed is `total real time ÷ 120 s`, the same factor for both columns, so the slower kit visibly finishes later.

- [ ] **Step 1:** Write failing tests with `node:test` and `fetch` against a server started on a free port with a fixture `runs/` folder: `/api/scenes` lists three scenes; a scene with one kit missing returns that kit as `missing` and the other intact; a path such as `/api/scenes/../../etc/passwd` → 404; `POST /api/live/9` → 404; the server refuses to bind to anything but loopback.
- [ ] **Step 2:** `node --test console/test/` → FAIL. Implement the server. → PASS.
- [ ] **Step 3:** Build the page. Colours as CSS variables with a light and a dark set; readable at projector size (base font 18px); no external assets.
- [ ] **Step 4:** Open it in the browser against the real recordings: each scene plays to the end, the counters end on the totals in `runs/metrics.json`, and a scene with a missing kit shows "not recorded" in that column.

### Task 3: live mode

**Files:**
- Create: `console/live/prepare-live.sh`, `console/live/live-run.mjs`

**Interfaces:**
- `prepare-live.sh <kit> <change>`: makes `live/<kit>/` as a fresh clone of the variant at the tag before that change (`kit-installed`, `change-1-done` or `change-2-done`), with its own `.env` (`PORT_OFFSET` 30 / 40) and `pnpm install --frozen-lockfile`. It never touches `openspec-variant/`, `speckit-variant/` or `runs/<kit>/`.
- `live-run.mjs <change>` runs the same step sequence as Phase 5 for both kits **at the same time** through `run-step.mjs`, writing under `runs/live/<run id>/`, and forwards events to the SSE route. Questions are not answered in live mode: a step that asks one ends the column with "the kit asked a question" and its text.

- [ ] **Step 1:** Implement both files.
- [ ] **Step 2:** Rehearse the bugfix scene live once, end to end. Record how long it took in `console/README.md`, with the note that live figures are not part of the comparison.
- [ ] **Step 3:** `console/README.md`: how to start the console, how to rehearse, what to say if a live run stalls (switch back to replay).

**Success criteria:** `node --test console/test/ runs/tools/test/` passes; all three scenes replay from real recordings with totals matching `metrics.json`; one live rehearsal of the bugfix scene completed or its failure documented.
