# OpenSpec vs Spec Kit Demo Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the roombook mini repo, run the same three changes through OpenSpec and Spec Kit, and deliver a comparison report plus a board demo console.

**Architecture:** One Nx monorepo baseline (gateway, booking, room, worker, web; plain NATS, Postgres, Redis) built without either kit and tagged. Two full clones each get one pinned kit. Every kit step runs as a recorded headless Claude session; a frozen HTTP suite outside both clones scores them; a local console replays the recordings.

**Tech Stack:** Nx 18.1.2, NestJS 11.0.20, Next.js 15.5.28, React 18.2.0, TypeORM 0.3.22, BullMQ 5.79.1, NATS, Postgres 15, Redis 7.2, Jest 29, pnpm, Node 24. Kits: `@fission-ai/openspec@1.16.1`, `specify-cli==1.3.3`.

**Spec:** `design.md` in this folder (with `research.md`). Executors read both.

## Global Constraints

- Exact versions as in design §3; every other package version is copied from Acme's `package.json`. No package outside design §10 without asking.
- Local git only: no remote, no push, no PR. Conventional commit messages, no AI attribution.
- No Acme code, secrets or data. `.env` files are generated with throwaway values, gitignored and never read by an agent.
- Code: kebab-case files, DTO classes, no `any`, no `interface`, no inline object parameter types, explicit repository return types, transactions in repositories, files under 200 lines, no narrative comments.
- After `baseline-v1` is tagged, the briefs, the contract text (design §5.3, §6) and `acceptance/` are frozen.
- Kit steps: model `claude-fable-5-2`, default effort, `--permission-mode acceptEdits`, never a permission bypass. Nothing in a variant is fixed by hand.
- Every subagent prompt carries: Work context `/workspace/spec-duel`, Reports `…/plans/261110-1210-openspec-vs-spec-kit-demo/reports/`, Plans `…/plans/`.
- Every project phase is logged with `runs/tools/log.mjs` (start, end, tokens reported by helpers).

## Review Focus

Inputs the design implies but no feature test would otherwise exercise; each has a test in the task named.

1. `page` or `limit` of 0, negative, non-numeric or above 100 on `GET /api/rooms` → 400, not a 500 or an unbounded query. (Phase 2, Task 3)
2. A NATS service is down → the gateway answers 503 within its timeout instead of hanging. (Phase 2, Task 2)
3. A headless step ends early (non-zero exit, usage limit, no result event) → the runner writes a record marked `interrupted` and keeps the partial events. (Phase 3, Task 2)
4. Acceptance tests of change 1 must still pass after change 2 → every test books its own non-overlapping time slot. (Phase 3, Task 1)
5. The console is opened for a scene with no recording, or half a recording → it says "not recorded" for that kit and still shows the other. (Phase 6, Task 2)

---

## Phases

| # | Phase | File | Runs | Status |
|---|---|---|---|---|
| 1 | Workspace, infra and contract (sequential, contract first) | [implementation-phase-1.md](implementation-phase-1.md) | me | Done 2026-11-10 |
| 2 | Baseline apps: backend ∥ frontend, then integrate and tag | [implementation-phase-2.md](implementation-phase-2.md) | `nestjs-expert` ∥ `nextjs-fe-developer` | Done 2026-11-10 |
| 3 | Acceptance suite, briefs, runner (∥ with phase 2) | [implementation-phase-3.md](implementation-phase-3.md) | me | Done 2026-11-10 |
| 4 | Variants: clone, install and harden each kit (two ∥ tracks) | [implementation-phase-4.md](implementation-phase-4.md) | me | Done 2026-11-10 |
| 5 | Kit runs: three changes per kit, scored | [implementation-phase-5.md](implementation-phase-5.md) | headless sessions | Done 2026-11-10: all three changes for both kits |
| 6 | Demo console (∥ with phase 5 once one recording exists) | [implementation-phase-6.md](implementation-phase-6.md) | me | Done 2026-11-10; live mode built, not rehearsed |
| 7 | Report | [implementation-phase-7.md](implementation-phase-7.md) | me | Done 2026-11-10 |

## Parallel tracks and file ownership

| Track | Owner | Owns (nobody else writes here) | Depends on | Joins at |
|---|---|---|---|---|
| S. Scaffold + contract | me | `baseline/` root files, `docker-compose.yml`, `scripts/`, `libs/contract/` | — | start of B and F |
| B. Backend | `nestjs-expert` | `baseline/libs/backend-common/`, `baseline/apps/{gateway,room,booking,worker}/` | S | Phase 2 Task 5 |
| F. Frontend | `nextjs-fe-developer` | `baseline/apps/web/` | S | Phase 2 Task 5 |
| A. Acceptance + briefs | me | `acceptance/`, `plans/…/briefs/` | S (contract only) | Phase 2 Task 5 |
| T. Runner tools | me | `runs/tools/` | — | Phase 4 |
| O. OpenSpec variant | me | `openspec-variant/` | tag `baseline-v1`, T | Phase 5 |
| K. Spec Kit variant | me | `speckit-variant/`, the venv | tag `baseline-v1`, T | Phase 5 |
| C. Console | me | `console/` | T, first recording | Phase 7 |

The root `package.json` belongs to track S: all dependencies are installed in Phase 1. A track that finds one missing stops and reports; it does not add it.

Integration point (Phase 2 Task 5): the frontend switches from its mocked service layer to the live gateway, the stack starts, and the acceptance suite's baseline expectations hold. Then full build, lint and test before the tag.

## Gates

- Before Phase 1: owner approves this plan.
- Before the tag: build, lint and unit tests green; acceptance at its expected baseline state.
- Before Phase 5: both kits installed, hardening checks recorded, a smoke step recorded for each kit.
- After Phase 5 and after Phase 7: the change set is presented to the owner. `code-reviewer` runs only if the owner asks.
