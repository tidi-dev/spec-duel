# Design: OpenSpec vs Spec Kit demo on a meeting-room bookings repo

**Date:** 2026-11-10 · **Status:** awaiting owner approval (revised after owner answers on 2026-11-10) · **Research:** `research.md` in this folder
**Size:** a project (full design).

Statements marked **(owner)** were decided by the owner. Statements marked **(my call)** are choices I made to fill a gap; the owner can overrule any of them.

## 1. Intent and why

ACME-1 asks whether OpenSpec should become Acme's spec-driven framework. The security audit answered "is it safe". This demo answers "what does each kit cost and give back in daily use", by having OpenSpec and GitHub Spec Kit do the same three pieces of work on the same small codebase, and reporting the difference with evidence.

The result must be something the team can check, so scoring is fixed before either kit runs.

## 2. Goals, non-goals, anti-goals

**Goals**
- One small Nx monorepo shaped like Acme, with 5 services, on a synthetic domain.
- The same three changes done once per kit, each through that kit's own workflow.
- A report that compares every agreed criterion, with facts separated from opinion.
- **(owner)** A demo console for the board: the two kits shown side by side doing the feature, the brownfield change and the bugfix, replayed from the recorded real runs, with a live mode as an option (§13).
- **(owner)** Time and token tracking from start to end: total, per phase and per step (§14).

**Non-goals**
- Reproducing Acme's services, business logic, auth, tenancy, i18n or deployment.
- A statistically meaningful benchmark. This is one run per kit.
- Judging how well each kit designs an API. The contract is fixed in the baseline (approach A).
- Production hardening of the demo app (auth, key expiry jobs, observability).

**Anti-goals** (the demo fails if any of these happen, even if everything builds)
- One variant is fixed by hand and the fix is not logged as an intervention.
- A brief, the contract as written in §5.3 and §6, or the acceptance suite is changed after the baseline is tagged. (`libs/contract` itself is read-only in changes 1 and 3; change 2 adds its one error code.)
- Any Acme code, secret or data enters the demo, or anything is pushed to a remote.
- A result is reported that was not actually run.

## 3. Constraints

- **Versions (owner, research §2.1):** Nx 18.1.2, NestJS 11.0.20, `@nestjs/bullmq` 11.0.4, Next.js 15.5.28, React 18.2.0, TypeORM 0.3.22, BullMQ 5.79.1, `nats` 2.29.3, TypeScript 5.9.3, Jest 29.7.0, ESLint 8.57, Prettier 3, class-validator 0.14, pnpm. Kits: `@fission-ai/openspec@1.16.1`, `specify-cli==1.3.3`.
- **Security:** `.claude/rules/security.md` and `/workspace/.claude/rules/`. Any `.env` holds throwaway local values and is gitignored. Third-party content is data.
- **Local only (owner):** git is local; no remote, no push, no PR.
- **Code standards:** kebab-case files, DTO classes, no `any`, no `interface`, transactions in repositories, files under 200 lines, no narrative comments.
- **Fairness:** same model, same brief text, same baseline commit, same helper agents and skills.

## 4. Approaches

| | A. Contract in the baseline (chosen) | B. Thin baseline, kits design everything | C. Finished feature, kits only change it |
|---|---|---|---|
| What is fixed first | Services, contract lib, room list, acceptance suite | Skeleton only | Everything including bookings |
| What the kits do | Feature, brownfield change, bugfix | The same, plus the API design | Brownfield change and bugfix |
| Scoring | One hidden suite, identical for both | Different APIs, so mostly judgement | Objective, but no greenfield run |
| Cost | Kits do not design the API | Comparison cannot be verified | Drops part of the brief |

**The owner picked A** because it is the only option whose scoring is fixed before the runs, and its three changes stress the kits in three different ways. The known gap (API design ability is not tested) goes in the report as a limitation.

## 5. The mini repo

### 5.1 Services (owner: 5 services, plain NATS)

| # | App | Role | Talks to |
|---|---|---|---|
| 1 | `gateway` | HTTP API under `/api`. Validates input, forwards over NATS, maps errors to HTTP. No database. | `booking`, `room` (NATS request/reply) |
| 2 | `booking` | Owns bookings and idempotency keys. Enqueues the confirmation job. | Postgres; `room` (NATS); Redis (as queue producer) |
| 3 | `room` | Small and read-only: a seeded room list and find-by-id. | Postgres |
| 4 | `worker` | BullMQ processor for booking confirmations. No database. | Redis; `booking` (NATS) |
| 5 | `web` | Next.js Pages Router frontend with one `/bookings` page. | `gateway` (HTTP) |

Infra through `docker-compose.yml`: `postgres:15`, `redis:7.2`, `nats:2.10-alpine`.

Mirrored from Acme (research §2.2): feature-folder layering (module, controller, service, repository, co-located specs); string-enum message patterns `'<domain>:<verbNoun>'`; class-validator DTOs shared by gateway, services and frontend; `ValidationPipe` at the gateway only; domain errors as `RpcException` with `{ statusCode, errorCode, message }` mapped by a gateway filter; QueryRunner transactions in repositories; `synchronize` off with migrations; Joi-validated config per app; `GET /api/health/<service>` on the gateway proxying a health pattern on each service; explicit `project.json` targets.

Skipped on purpose: JetStream, the second NATS layer, Mongo, TLS, auth, CASL, i18n, Tilt, flow producers.

### 5.2 Libraries (my call: two, not one)

- `libs/contract`: DTO classes, route and pattern enums, queue name, error codes, the job payload class. Safe to import from the frontend.
- `libs/backend-common`: config helpers, TypeORM config, entities and migrations, the NATS client module, the exception helper and filter.

The brief said "one shared lib". Two are needed because the frontend imports the contract, and entities would drag TypeORM into the browser bundle. Package scope: `@roombook/*`.

### 5.3 The contract (fixed in the baseline)

All routes are under `/api`. Errors are `{ statusCode, errorCode, message }`. Times are ISO 8601 in UTC.

**Rooms (built in the baseline)**
- `GET /api/rooms?page=1&limit=10` → `{ items: Room[], total, page, limit }`, ordered by name. 12 seeded rooms.
- `Room`: `id` (uuid), `name`, `capacity`.

**Bookings (built by the kits)**
- `Booking`: `id`, `roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt`, `confirmationStatus` (`PENDING` | `SENT` | `FAILED`), `confirmationAttempts`, `createdAt`, `updatedAt`.
- `POST /api/bookings` → 201. Requires the `Idempotency-Key` header.
- `GET /api/bookings?roomId=&page=1&limit=10` → paged list, ordered by `startsAt`.
- `GET /api/bookings/:id` → 200 or 404.
- `PATCH /api/bookings/:id` (`title`, `startsAt`, `endsAt`) → 200.
- `DELETE /api/bookings/:id` → 204.
- Validation: `endsAt` after `startsAt` (400); unknown room (404 `NOT_FOUND.ROOM`); unknown booking (404 `NOT_FOUND.BOOKING`).

**Idempotent create** (research §3.4, option B1)
- Missing or non-UUID key → 400 `BAD_REQUEST.IDEMPOTENCY_KEY`.
- First request: the booking service claims the key and inserts the booking in one transaction, and stores the response.
- Same key, same body, after completion → the stored status and body again, with the response header `Idempotency-Replayed: true`. No second booking, no second job.
- Same key, different body → 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.
- Same key while the first is still running → 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS`.
- Validation failures are not stored. Keys do not expire in the demo.
- Scoring of the in-progress case **(my call)**: a black-box suite cannot hold the first request open, so for two identical creates sent at the same moment it accepts either outcome the contract allows (one 201 plus a replay, or one 201 plus a 409), as long as exactly one booking and one job exist.

**Confirmation job** (research §3.5, option C1)
- Queue `booking-confirmation`; payload `{ bookingId }`; job id `confirmation-<bookingId>`; 3 attempts; exponential backoff starting at 1 s.
- The booking service enqueues it once per created booking. The worker "sends" the confirmation and reports the outcome to the booking service over NATS, which updates `confirmationStatus` and `confirmationAttempts`.
- Nothing is really sent. The sender is simulated, with fixed rules so retries can be observed **(my call)**:
  - `organizerEmail` ending in `@retry.example` fails the first two attempts, then succeeds → `SENT`, 3 attempts.
  - ending in `@bounce.example` always fails → `FAILED`, 3 attempts.
  - anything else succeeds first time → `SENT`, 1 attempt.
- The processor must be safe to run twice for the same booking.

### 5.4 Frontend (my call on the UI stack)

Two pages:
- `/rooms` (in the baseline): the room list with paging and a page-size choice of 5 or 10. This is where the board sees the bug (§6.3).
- `/bookings` (built by the kits): a table of bookings with a room filter, a create form, edit and delete. The create form generates one `Idempotency-Key` per submission and reuses it if the request is retried.

Stack: MUI 5, react-hook-form with yup, axios through a small API client, mirroring Acme. No i18n and no access control. Tests are Jest with Testing Library against a mocked API client.

### 5.5 What the baseline contains

- The five apps wired together, each with its health endpoint.
- Both libs. `libs/contract` holds the contract for rooms and for change 1 (bookings, idempotency, the job). It does not contain change 2's overlap error code.
- The room feature end to end (entity, migration, seed, service, gateway route, the `/rooms` page), with one planted bug (§6.3).
- `docker-compose.yml`, scripts to start and stop the stack, lint, unit tests, build.
- A copy of the demo's `.claude/` kit, committed **(owner: local commit only)**, so both variants start with the same helpers and each kit's additions show up in a diff.
- No bookings code and no kit files.

The baseline is built without either kit, with TDD, and tagged `baseline-v1` once build, lint and tests are green.

## 6. The workload: three changes per kit

Each change has one brief file, written before the baseline is tagged and passed to both kits word for word.

### 6.1 Change 1: feature
Bookings CRUD on backend and frontend, the idempotent create, and the confirmation job with retry and de-duplication, all as §5.3 defines them.

### 6.2 Change 2: brownfield change
Bookings for the same room may no longer overlap.
- A create or update that overlaps an existing booking of the same room → 409 `CONFLICT.BOOKING_OVERLAP`.
- Intervals are half-open: a booking that starts exactly when another ends is allowed.
- An update does not conflict with itself.
- Two overlapping creates sent at the same moment: exactly one succeeds.
- The demo database is reset before the run, so no existing data needs migrating.

- The brief tells the kit to add the `CONFLICT.BOOKING_OVERLAP` error code to `libs/contract`.

This changes behaviour the kit itself specified in change 1, so it shows how each kit evolves its own specs.

### 6.3 Change 3: bugfix
Planted in the baseline: the room list computes its offset from the default page size instead of the requested `limit`. Page 1 is always right; `GET /api/rooms?page=2&limit=5` returns rooms 11 and 12 instead of 6 to 10. The baseline's own unit tests cover page 1 and the default limit only.

On the `/rooms` page it is visible to anyone: choose 5 per page, go to page 2, and the list shows the last two rooms instead of rooms 6 to 10.

The brief is a bug report: "On the rooms page with 5 per page, page 2 shows the wrong rooms (`GET /api/rooms?page=2&limit=5`)." It asks for the cause to be analysed and written up before the fix **(owner)**. This is code no kit ever specified, so it shows process weight on unspecified legacy code.

The bug is kept off the path change 1 uses **(my call)**: the bookings page's room filter reads page 1 only, and the `/rooms` page is right at its default page size. The change 1 and change 2 briefs say the room service is out of scope. If a kit fixes the bug early anyway, that is logged as unrequested scope, and change 3 is still run in that variant to record what the kit does with an already-fixed report.

## 7. Isolation and layout

```
/workspace/spec-duel/
  .claude/              demo kit (source for the baseline's copy)
  plans/261110-1210-…/  research.md, design.md, plan, briefs/, reports/
  baseline/             git repo, tagged baseline-v1
  openspec-variant/     full clone of baseline + OpenSpec only
  speckit-variant/      full clone of baseline + Spec Kit only
  acceptance/           the frozen HTTP suite, outside both variants
  runs/                 recordings and metrics per kit, change and step
  console/              the demo console (local web page + small local server)
  reports/              openspec-vs-spec-kit-comparison.md
```

- Variants are full clones (research option D1), each with its own `.git` and `.claude/`. Neither contains the other kit's files.
- Each variant gets its own compose project name and ports, so both stacks can exist on one machine.
- OpenSpec is an npm devDependency of its variant only. Spec Kit lives in a Python venv outside both variants, and only its generated files enter `speckit-variant/`.

## 8. How the runs are driven

- **Headless sessions (owner: best practice).** Every kit step is one `claude -p` call started inside the variant folder, so the kit's skills and commands load the way a developer's session would. It runs with streamed JSON output, and every event is saved with the time it arrived (§14), because the console replays these recordings.
- **Model:** `claude-fable-5-2` at default effort for every step of both kits.
- **Permissions:** each variant has an allowlist limited to that workspace (edits, `pnpm nx`, tests, `docker compose`, local `git add`/`commit`, and the kit's own CLI or scripts). Permission bypass is never used. A step that stops on a denied action is logged, not worked around.
- **Kit setup, once per variant, measured separately:** the project rules (§9.2) are given to each kit in its own way: OpenSpec through `openspec/config.yaml`, Spec Kit through `/speckit-constitution`. Same rule text for both.
- **Steps per change (owner: best practice):**
  - OpenSpec: `/opsx:propose` → `openspec validate --strict` → `/opsx:apply` → `/opsx:archive`.
  - Spec Kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.
  - Other kit commands are used only when the kit's own flow asks for them, and each use is logged.
  - **(owner)** The bugfix goes through each kit's own flow on both sides: the kit analyses the bug, writes up what it found, then implements the fix. That is the same step list as above for each kit. The report also states what each kit's documentation recommends for a bugfix (OpenSpec: a full proposal; Spec Kit: no feature workflow needed), and that Spec Kit's opt-in bug extension exists; the extension is not installed **(owner)**.
- **Parallel structure, identical for both kits.** The implementation step of change 1 carries the same added instruction for both: backend tasks go to the backend agent and frontend tasks to `nextjs-fe-developer`, in parallel, with `libs/contract` read-only; then build, lint and test together. The report says which kit expressed that split natively (Spec Kit's `[P]` markers) and which needed it from outside (OpenSpec).
- **Process rules inside a variant session (my call).** The shared rules in `/workspace/.claude/rules/` also describe a process: plan with the `planner` agent first, stop for owner review, delegate to `tester`. Inside a kit step, the kit's workflow is the process. Every headless step of both kits therefore carries the same short added instruction: the kit's workflow replaces those process rules for this session; the code standards still apply. Fit with the Acme process is judged separately (§9.3), not by running both processes at once.
- **When a change is done (my call).** After the implementation step, build, lint and unit tests are run in the variant.
  - If they are red, the kit gets the failing output and up to two fix rounds through its own implementation command. Each round counts as a re-prompt.
  - If still red, the change is recorded as it stands. Nothing is fixed by hand.
  - Acceptance results are score only. They are never shown to a kit or used to re-prompt.
  - The next change starts from whatever state the variant is in. If the stack cannot start, the remaining changes are reported as not run for that variant.
  - A step that stops on a denied permission is recorded as failed at that point; the change continues with the next step if it can.
- **Spending limit (owner).** None. The runs proceed until done or until the account's usage limit stops them; a run cut off that way is recorded as interrupted and resumed, with the interruption noted.
- **Kit questions.** When a kit asks something, I answer only from the brief and the contract. If they do not answer it, the reply is "not specified: choose the simplest option and record it as an assumption". Every such exchange is counted.
- **Order (my call).** Runs are sequential so wall time is clean. Order alternates: change 1 OpenSpec first, change 2 Spec Kit first, change 3 OpenSpec first. The order is fixed here, before any run.
- **Snapshots.** One local commit per variant after each change, so each change can be diffed and reviewed as if it were a PR.

## 9. Measurement

### 9.1 The acceptance suite
HTTP-level Jest tests written from §5.3 and §6, before the baseline is tagged, covering all three changes. It lives in `acceptance/`, outside both variants, and takes the gateway URL as input. Neither kit sees it. It is not edited after the tag; if a test turns out to be wrong, it is reported as a defect of the method and both variants are re-scored.

At baseline the room pagination test and all bookings tests are red by design.

### 9.2 Rules that are scored
From `/workspace/.claude/rules/`: R1 thin controllers, R2 DTOs on mutations, R4 no hardcoded config, R5 a spec per service, R7 module registration, R8 naming, R9 no wildcard imports, R10 health endpoint (in its Acme form, §5.1); plus no `interface`, no `any`, no inline object parameter types, explicit repository return types, transactions in repositories, kebab-case files, files under 200 lines, no narrative comments.

Not scored: R3 and R6 (need extra tooling or a deploy step), R11 (only if a variant uses `LIKE`), and anything about Prisma or `@acme/*` helpers.

### 9.3 Criteria

| Criterion | How it is measured | Kind |
|---|---|---|
| Install footprint and security posture | Files and dependencies added (before/after listing); the hardening below and whether it held; compared with the audit | Fact |
| Files generated | Count and lines of kit artifacts per change, from `git diff --stat` | Fact |
| Spec quality | Requirements stated and testable; contradictions with the contract; reviewed against one written checklist | Judgement |
| Requirement → test traceability | Share of spec requirements that map to a named test in the variant | Fact + judgement |
| Planning artifacts | What each kit produced before code, and whether the code followed it | Judgement |
| Turns, wall time, tokens, cost | From the recording of each headless step, per step, phase, change and kit (§14) | Fact |
| Human interventions | Counted by category: kit question answered, correction, manual fix, re-prompt; gate approvals on their own line | Fact |
| Test, lint, build | Commands run in each variant after each change; acceptance tests passed out of total | Fact |
| Rule adherence | §9.2 checked by lint, grep and reading, the same checks on both | Fact + judgement |
| Brownfield and bugfix overhead | Changes 2 and 3: artifacts, time and cost relative to lines of code changed | Fact |
| PR reviewability | Per-change commit: size, share of spec versus code, whether a reviewer can see what changed in behaviour | Judgement |
| CI gate options | `openspec validate` versus what Spec Kit offers without an agent; exit codes observed | Fact |
| Parallel task support | Native markers or not; wall time per track | Fact |
| Learning curve | Commands and concepts a developer must know; where the run needed kit-specific knowledge | Judgement |
| Fit with the Acme kit | Overlap with `/make`, `research`, `writing-plans`; one change's scenarios fed to `manual-tester` to see whether they work as a test-case source | Judgement |

### 9.4 Hardening that is checked (from the brief and the audit)
- **OpenSpec variant:** installed through npm at the exact version; `openspec init` for Claude with the `core` profile; `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1` in the variant's `.claude/settings.json` `env`; `permissions.deny` for `Bash(openspec feedback:*)` and `Bash(openspec install:*)`. **Test:** from a headless session in the variant, through an OpenSpec skill that carries `allowed-tools: Bash(openspec:*)`, run `openspec feedback --help` and `openspec install --help` and record whether the deny rule blocks them. Only the `--help` forms are used: they match the deny pattern but cannot post an issue or download anything, whichever way the test turns out.
- **Spec Kit variant:** exact version in an isolated venv; Claude integration only; no extensions; `--integration-options="--events false"`. **Test:** `.claude/settings.json` is byte-identical before and after init, and the installed package files match the v1.3.3 tag.
- **Both:** a full before/after file listing of the variant.

### 9.5 The frontend
Scored by the variant's own Jest tests and build, plus one identical browser walk-through per variant that I run against the live stack (create, see it in the list, edit, delete, room filter). The walk-through is reported as a manual check **(my call)**.

## 10. Dependencies this design approves

Approving this design approves installing, in the demo only:
- the npm packages for the versions in §3 and their peer requirements, all already used in Acme (plus `@nestjs/*` companions, `pg`, `ioredis`, `joi`, MUI 5, react-hook-form, yup, axios, Testing Library);
- `@fission-ai/openspec@1.16.1` in `openspec-variant/` only;
- `specify-cli==1.3.3` in a Python venv, used for `speckit-variant/` only.

Anything else (including `uv`, Playwright, `madge`, or any kit extension) is asked for separately with the six points of `security.md` §4.

## 11. Left to the builder

- Internal structure of the bookings code inside each variant; that is the kits' work.
- How overlap is enforced (database constraint or locking), as long as the concurrent case holds.
- The idempotency table's exact columns and how a crashed in-progress key is handled.
- Port numbers, script names, the Nx generator commands, and how the stack is started for the acceptance run.
- Whether a session started inside a variant sees duplicate helper agents from the parent folder's `.claude/`, and how to prevent that; to be checked in Phase 3 before any run.

## 12. Limitations the report will state

One run per kit; one operator; one model; no variance estimate. The API was not designed by the kits. The same operator answers both kits' questions. The second kit to run a change does so on a machine that already ran the first. Kit behaviour is for the pinned versions only.

## 13. Demo console for the board (owner)

**What it is.** A local web page, separate from the bookings app, that shows the two kits side by side doing the same change. It is built by me, not by either kit, and lives in `console/`.

**Scenes.** One per change: feature, brownfield change, bugfix. Each scene has two columns, OpenSpec and Spec Kit, and shows for each:
- the kit's phases as they happen, with a running clock per phase and in total;
- running token and cost counters;
- what the kit wrote: its analysis and spec documents (for the bugfix, its write-up of the cause), then the code diff;
- the result: build, lint and unit tests, and the acceptance score for that change;
- a closing comparison row: time, tokens, cost, files written, questions asked, re-prompts.

**The bugfix scene, as the owner described it.**
1. The bug is shown on the `/rooms` page: 5 per page, page 2, wrong rooms.
2. A "Run bugfix" button starts both columns.
3. Each kit analyses the bug, writes its report, and implements the fix.
4. The same page is shown again with the right rooms.

**Replay is the default (owner).** The button replays the recorded real run of each kit.
- Everything shown is real: the kit's own text, the documents it wrote, the diff, the numbers.
- Playback is compressed to about two minutes per scene. The real duration and cost are always displayed next to the compressed clock, and the scene is labelled as recorded, with its date.
- The before and after views of the app in replay are screenshots and API responses captured during the real run **(my call)**, so the replay has no moving parts that can fail in front of the board.

**Live mode is an option (owner).** The same button, with a "live" switch, starts real kit runs.
- It works on a scratch copy of each variant reset to the commit before that change, so live runs never alter the recorded results or the scored variants.
- The before and after views are the real app.
- It takes as long as it takes, can ask questions or fail, and is meant for rehearsal or for a board member who asks to see it unscripted.

**Safety.** The console's server listens on this machine only. Its live endpoint starts a fixed set of prepared runs and takes no free text from the page. It never bypasses permissions.

**Left to the builder:** the page's look, how playback is compressed, the server's shape. No new dependency is approved by this section; if the console needs one, it is asked for separately.

## 14. Tracking time and tokens (owner)

**Kit runs: tracked exactly.** A small runner wraps every headless step and writes one record per step:
- kit, change, kit step and the common phase it belongs to;
- start time, end time, wall duration, and the API duration the CLI reports;
- turns; input, output and cache tokens; cost;
- questions the kit asked and re-prompts given;
- the commit made after the step.

**Common phases**, so the two kits can be compared phase by phase even though their steps differ:

| Phase | OpenSpec | Spec Kit |
|---|---|---|
| Setup (once) | init, `openspec/config.yaml` | init, `/speckit-constitution` |
| Specify | `/opsx:propose` | `/speckit-specify`, `/speckit-clarify` |
| Plan | (inside propose) | `/speckit-plan`, `/speckit-tasks` |
| Check | `openspec validate --strict` | `/speckit-analyze` |
| Implement | `/opsx:apply` and any fix rounds | `/speckit-implement` and any fix rounds |
| Close | `/opsx:archive` | none |

OpenSpec does its planning inside `propose`, so its Specify and Plan times cannot be split; the report shows them as one figure for OpenSpec and says so.

**Totals** are rolled up per phase, per change, per kit and overall, and feed both the report and the console.

**The rest of the project: tracked as far as I can see it.** A project log records the start and end time of every other phase (baseline build, installs, the console, the report), and the token use that helper agents report back. I cannot read the token use of my own main session; the owner can read it with `/usage`, and the report says which figures are exact and which are not.

