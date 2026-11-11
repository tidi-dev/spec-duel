# OpenSpec vs GitHub Spec Kit: hands-on demo

This folder holds a hands-on comparison of two AI spec-driven development kits, **OpenSpec** and **GitHub Spec Kit**, run against the same small codebase. It was built for Jira ticket ACME-1, which asks whether Acme should adopt OpenSpec.

A security audit of the kits had already been done. This demo answers the practical question: what does each kit cost and give back when a developer uses it for real work?

To run anything, see [SETUP.md](SETUP.md). For the comparison console and a detailed, before-and-after account of each change the kits made, see [CONSOLE.md](CONSOLE.md). The short version:

```bash
./demo.sh up      # start both kits' apps and the comparison console
./demo.sh down    # stop everything
```

## What came out of it

| Output | Where | For whom |
|---|---|---|
| Shareable report page | https://claude.ai/artifact/RdzjJseMj16ZxsaE5jZH3K (shared with anyone who has the link) | The board and anyone outside the project |
| Full report, with evidence for every statement | https://claude.ai/artifact/QfV93Wb2UZEH9wMZc33UcH (shared with anyone who has the link), and locally `reports/openspec-vs-spec-kit-comparison.md` | Engineers who want to check the figures |
| Code audit of what each kit wrote: metrics, scorecard, bugs checked in both kits | https://claude.ai/artifact/J69PYSozk2S47BbKJwgtzN (shared with anyone who has the link), and locally `reports/openspec-vs-spec-kit-code-audit.md` | Engineers judging code quality |
| Comparison console: replays each kit's recorded run side by side | `console/`, started by `./demo.sh up`; explained in [CONSOLE.md](CONSOLE.md) | Demos to an audience |
| Two working apps, one built by each kit | `openspec-variant/`, `speckit-variant/` | Hands-on testing |
| Raw recordings and metrics of every kit step | `runs/` | Re-checking any number |
| The story of why this project exists and how it was run | [ORIGIN-STORY.md](ORIGIN-STORY.md) | Anyone new to the project |

### The result in one table

| | OpenSpec | Spec Kit |
|---|---|---|
| Hidden acceptance tests passed (feature / change / bugfix) | 30 of 30, 37 of 37, 41 of 41 | 30 of 30, 37 of 37, 41 of 41 |
| Working time, three changes | 48 min 41 s | 1 h 12 min 52 s |
| Cost, three changes | $36.13 | $55.53 |
| Tokens used, three changes | 22.3 million (335,297 output) | 25.1 million (491,696 output) |
| Kit documents written | 2,034 lines | 3,770 lines |
| Bugfix alone | 3 min 56 s, $4.35 | 10 min 03 s, $10.05 |

Both kits produced correct, rule-compliant code every time. OpenSpec got there in about two thirds of the time and cost. The report recommends a pilot of OpenSpec at Acme, with the security conditions from the audit.

## The codebase: roombook

roombook is a small meeting-room booking system with the same shape as Acme, but it contains no Acme code, data or secrets. The domain is made up.

| Part | What it does |
|---|---|
| `apps/gateway` | HTTP API under `/api`; validates input and forwards to the services over NATS |
| `apps/room` | Rooms service: the list of 12 rooms (NATS, Postgres) |
| `apps/booking` | Bookings service: bookings, idempotent create, queues confirmations (NATS, Postgres, BullMQ) |
| `apps/worker` | BullMQ worker that "sends" booking confirmations, with retries |
| `apps/web` | Next.js front end: `/rooms` and `/bookings` pages |
| `libs/contract` | Shared API contract: DTOs, routes, message patterns, error codes |
| `libs/backend-common` | Shared backend code: config, database, entities, migrations, NATS client, errors |

It uses the same versions as Acme: Nx 18, NestJS 11, Next.js 15 (Pages Router), React 18, TypeORM 0.3, BullMQ 5, NATS, Postgres 15, Redis 7.

## Folder map

```
openspec-demo/
  README.md             this file
  SETUP.md              how to run, test and present everything
  CONSOLE.md            the console, and each of the three changes before and after
  demo.sh               one command to start, stop, check and test everything
  baseline/             the starting codebase, before either kit
  openspec-variant/     baseline + OpenSpec + everything OpenSpec built
  speckit-variant/      baseline + Spec Kit + everything Spec Kit built
  acceptance/           the hidden acceptance test suite (41 HTTP tests)
  console/              the side-by-side replay console for demos
  runs/                 recordings, metrics, install checks, notes from every kit step
  reports/              the full written report
  plans/                research, design and plan for this demo, plus the briefs given to the kits
  .claude/              Claude Code setup for working in this folder
```

## What "baseline" means

The baseline is the starting version of roombook, before either kit touched it. It lives in `baseline/` and the exact starting point is marked with the git tag `baseline-v1` (later `baseline-v1.1`, after a wording fix to the agent notes).

It contains the five apps wired together, the shared contract, and one working feature: the room list. That room list has a deliberately planted bug, used for the bugfix test. There is no bookings code.

A fair comparison needs both kits to start from exactly the same code, so the baseline was built once, by Claude agents without either kit, and frozen.

## Why there are two folders that look duplicated

`openspec-variant/` and `speckit-variant/` are each a full copy of the baseline, with one kit installed. They look alike because they started identical and were asked to do the same work, but they are not duplicates:

- **Each kit wrote its own code.** The bookings feature, the overlap rule and the bug fix were written separately by each kit. For example, `libs/backend-common` now has different booking entities and migrations in each folder.
- **Each kit wrote its own documents.** OpenSpec keeps them in `openspec/`, Spec Kit in `specs/` and `.specify/`.
- **Each kit must not see the other.** Separate folders keep each kit's files, settings and git history apart, so neither can be influenced by the other.
- **Each one is a complete, runnable app.** Its git history shows exactly what its kit changed, change by change, and both can run at the same time on different ports.

`libs/contract` is identical in both on purpose: the API contract was fixed in the baseline so both kits built the same thing.

## What each kit does, from scratch

Both kits work inside Claude Code as slash commands. Each was installed into its own copy of the baseline and hardened as the audit required.

### OpenSpec 1.16.1

Installed as an npm dev dependency. It adds 15 files: 6 skills, 6 slash commands and an `openspec/` folder.

| Step | Command | What it produces |
|---|---|---|
| One-off setup | `openspec init`, plus project rules in `openspec/config.yaml` | The kit files |
| Specify and plan | `/opsx:propose` | `openspec/changes/<name>/`: proposal, design, delta specs, task list |
| Check | `openspec validate --strict` (a CLI command, no AI) | Pass or fail, in under a second |
| Implement | `/opsx:apply` | The code and tests; ticks off the task list |
| Close | `/opsx:archive` | Merges the delta specs into the living specs in `openspec/specs/` and archives the change |

Its specs are written as requirements ("The system SHALL…") with WHEN/THEN scenarios. After each change, `openspec/specs/` describes how the system behaves now.

Hardening applied: exact version pin, telemetry off (`OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`), core command set only, and its `feedback` and `install` subcommands blocked by deny rules. The demo confirmed the block works.

### GitHub Spec Kit 1.3.3

Installed into a Python virtual environment outside the project, used only to run `specify init`, then deleted (to install it again, see [SETUP.md](SETUP.md) section 6). It adds 29 files: 9 skills and a `.specify/` folder of templates, scripts and settings.

| Step | Command | What it produces |
|---|---|---|
| One-off setup | `specify init`, then `/speckit-constitution` with the project rules | The kit files and `.specify/memory/constitution.md` |
| Specify | `/speckit-specify`, then `/speckit-clarify` | `specs/NNN-<name>/spec.md` with numbered requirements, scenarios and success criteria |
| Plan | `/speckit-plan`, then `/speckit-tasks` | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md` with parallel `[P]` markers |
| Check | `/speckit-analyze` (an AI session) | A report of inconsistencies between spec, plan, tasks and the constitution |
| Implement | `/speckit-implement` | The code and tests; ticks off the task list |

Each change gets a new numbered folder under `specs/`; earlier specs are not updated.

Hardening applied: exact version pin, Claude integration only, events (hooks) off, no extensions. The demo confirmed it wrote nothing to Claude's settings.

## What the two kits were tested on

Each kit did the same three changes, given the same written brief word for word:

1. **Feature:** build room bookings from scratch, on the API and a new `/bookings` page.
2. **Brownfield change:** stop rooms from being double-booked, a change to behaviour each kit had specified itself.
3. **Bugfix:** find, write up and fix a planted bug that shows the wrong rooms on page 2.

[CONSOLE.md](CONSOLE.md) describes each change in detail: the state before, what the brief asked for, the state after, and what each kit did.

Every kit step ran as its own recorded Claude Code session, with the same model and the same settings for both kits.

A hidden suite of 41 HTTP tests in `acceptance/` scored the results. It was written before either kit ran and was never shown to either kit.

## What was compared

| Criterion | How it was measured |
|---|---|
| Correctness | The hidden acceptance suite, after each change |
| Build, lint and unit tests | Run in each copy after each change |
| Coding-rule adherence | Automated checks for `interface`, `any`, wildcard imports, files over 200 lines, file naming, services without tests |
| Time, tokens and cost | Recorded per step, per phase and per change from each session |
| Documents produced | Lines and files each kit wrote, per change |
| Handling a change to existing behaviour | How each kit updated its own specs |
| Process weight on a small bug fix | Time, cost and documents relative to a 2-line code change |
| Spec quality and traceability | The `manual-tester` agent turned each kit's spec into manual test cases |
| Human interventions | Questions, confirmations, re-prompts and manual fixes needed |
| Quality gate for CI | Whether a check runs without AI |
| Parallel work | Whether the task list marks parallel tasks; backend and frontend time |
| Install footprint and security | Files added, settings touched, telemetry, hooks, deny-rule test |
| Fit with the Acme kit | Overlap with existing planning commands, use as a test-case source |

The full results for each criterion are in the report.

## Limitations

- One run per kit, one operator, one model, so there is no measure of spread.
- The API was fixed in the baseline, so the kits did not design it.
- Cost is the estimate Claude Code reports, at list prices.
- The bugfix used each kit's full process. Spec Kit's own docs say a bugfix needs no feature workflow, and it offers an opt-in bug extension that was not used.

The report lists the rest.

## Author

Dai Ho, <contact@daiho.tech>
