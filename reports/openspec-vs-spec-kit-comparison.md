# OpenSpec vs GitHub Spec Kit: hands-on comparison

**Date:** 2026-11-10 · **Ticket:** ACME-1 · **Kits:** `@fission-ai/openspec@1.16.1`, `specify-cli==1.3.3` · **Model:** `claude-fable-5-2`, Claude Code 2.1.322

Every statement is tagged **[Verified]** (with the file or command that shows it; paths are relative to `/workspace/spec-duel/`) or **[Judgement]** (my reading, with its basis). All figures in the tables are generated from `runs/metrics.json` by `runs/tools/report-tables.py`.

## 1. Executive summary

Both kits delivered all three changes correctly. Each passed every hidden acceptance test (30 of 30, 37 of 37, 41 of 41), with clean builds, clean lint and no rule breaks found. The difference is in what each one costs to get there.

- **OpenSpec was faster and cheaper on every change.** Across the three changes it took 48 min 41 s and $36.13; Spec Kit took 1 h 12 min 52 s and $55.53. That is about 50% more time and 54% more cost for Spec Kit, for the same result. Spec Kit also used more tokens: 25.1 million against 22.3 million, of which 491,696 were output tokens against 335,297. [Verified: section 4]
- **The gap is widest on small work.** For the 2-line bugfix, OpenSpec took 3 min 56 s and $4.35 and wrote 225 lines of documents; Spec Kit took 10 min 03 s and $10.05 and wrote 900 lines. [Verified: section 4]
- **OpenSpec keeps one living specification; Spec Kit accumulates dated ones.** After the brownfield change, OpenSpec's `openspec/specs/` describes current behaviour. Spec Kit added a second numbered spec and left the first one stating the old behaviour. [Verified: section 5.2]
- **Only OpenSpec has a quality gate that runs without AI.** `openspec validate --strict` ran in about 0.2 s at no cost. Spec Kit's `/speckit-analyze` took 1 to 4 minutes and $0.91 to $3.00 per run, but it reads the plan against the code and found real inconsistencies. [Verified: section 4; `runs/speckit/change-1/analyze-report.md`]

**Recommendation [Judgement]:** adopt OpenSpec for Acme, with the audit's five hardening conditions, which this demo confirmed can be met. Choose Spec Kit instead only if the team values numbered requirements and a constitution-level rule set more than process weight. Section 8 gives the conditions.

## 2. Method

- **One baseline.** A small Nx monorepo shaped like Acme (HTTP gateway, two NATS services, BullMQ worker, Next.js frontend, Postgres, Redis), built without either kit and tagged `baseline-v1`. The API contract was fixed in the baseline so both kits built the same thing. [Verified: `runs/baseline.json`]
- **Two isolated copies.** Each variant is a full clone with only its own kit installed. [Verified: `runs/install-summary.md`]
- **Three changes, identical briefs.** A feature (bookings with idempotent create and a retried, de-duplicated confirmation job), a change to existing behaviour (no overlapping bookings), and a planted bug (wrong rooms on page 2). The brief text reached both kits byte for byte. [Verified: `plans/261110-1210-openspec-vs-spec-kit-demo/briefs/`; `runs/tools/test/make-prompts.test.mjs`]
- **Headless, recorded steps.** Every kit step was a separate `claude -p` session started inside the variant, with every event and the final cost and usage saved. [Verified: `runs/<kit>/change-<n>/*.record.json`, `*.events.jsonl`]
- **A hidden acceptance suite.** 41 HTTP-level tests written from the contract before either kit ran, kept outside both variants, never shown to a kit. [Verified: `acceptance/`; hashes in `runs/baseline.json`]
- **A fixed done rule.** After implementation: build, lint and unit tests; up to two fix rounds through the kit; no hand fixes. Neither kit needed a fix round. [Verified: `runs/<kit>/change-<n>/verify.json`]
- **Run order.** Feature: OpenSpec first. Brownfield: Spec Kit first. Bugfix: OpenSpec first.

### Limitations

- One run per kit, one operator, one model. There is no variance estimate; a second run could differ.
- The kits did not design the API. Their specification steps detailed a contract that already existed.
- Cost is the client-side estimate Claude Code reports, at list prices.
- "All tokens" is dominated by cache reads, which are billed at a small fraction of the normal rate, while output tokens are the most expensive kind. So token totals and cost need not rank the two kits the same way: in the brownfield change OpenSpec used more tokens in total (8.33 million against 8.04 million) but fewer output tokens (97,076 against 143,536), and cost less. Output tokens and cost are the more meaningful figures.
- Token figures include the subagents a kit handed work to; turns count only each kit's main session. Token figures were corrected after the runs (section 4.4).
- The account's usage limit interrupted three steps (one for OpenSpec, two for Spec Kit). OpenSpec's interrupted implementation step was resumed; its time and cost include both parts. Spec Kit's two were cut off within seconds, before any real work, and were re-run. The refused attempts are excluded from the totals: the Brownfield one cost nothing, the Bugfix one $0.58. [Verified: `runs/notes.md`; `runs/speckit/change-<n>/interrupted/analyze.record.json`]
- Each session could see its own folder name (`openspec-variant`, `speckit-variant`). The kit notes inside the repo were neutralised before any run, but the folder names were not.
- `curl` was not on the allowlist, so neither kit could run its own live-stack checks. Both left those tasks open and said so.
- The browser walk-through was reduced: both bookings pages were loaded and inspected; only delete was exercised, and only in the OpenSpec variant. [Verified: `runs/<kit>/change-1/walkthrough.md`]

## 3. Comparison by criterion

| Criterion | OpenSpec | Spec Kit | Evidence | Kind |
|---|---|---|---|---|
| Install footprint | 15 files, 2,668 lines; npm devDependency | 29 files, 5,118 lines; Python venv outside the repo, 42 packages | `runs/install-summary.md` | Fact |
| Security posture | Pre-approves `Bash(openspec:*)` in every generated file; telemetry on unless disabled; no hooks, no settings writes | No tool pre-approval, no telemetry; no hooks written with events off; no settings writes | `runs/install-summary.md`, `runs/openspec/install/deny-test.md` | Fact |
| Files generated per change | 1,224 / 585 / 225 lines | 1,605 / 1,265 / 900 lines | Section 4 | Fact |
| Spec quality | Requirements as SHALL statements with WHEN/THEN scenarios carrying concrete values; no requirement IDs | Numbered requirements (FR-001…), acceptance scenarios, success criteria; the same rule often stated in several places | `runs/manual-tester-fit.md` | Judgement |
| Requirement → test traceability | 33 requirements extracted by `manual-tester`, 28 testable by hand; IDs had to be invented | 59 extracted, 53 testable by hand; IDs existed but about 24 requirements sat outside the numbered list | `runs/manual-tester-fit.md` | Fact + judgement |
| Planning artifacts | proposal, design, delta specs, tasks (34 tasks for the feature) | spec, plan, research, data model, contracts, quickstart, tasks (91 tasks for the feature) | variants at tag `change-1-done` | Fact |
| Time, tokens and cost | 48:41, 22.3 million tokens (335,297 output) and $36.13 for three changes | 1:12:52, 25.1 million tokens (491,696 output) and $55.53 | Section 4 | Fact |
| Human interventions | No questions. One confirmation at archive; archive needed a re-run | No questions, no confirmations, no re-runs | Section 4.3 | Fact |
| Test, lint, build | All pass on all three changes | All pass on all three changes | `verify.json` per change | Fact |
| Hidden acceptance tests | 30/30, 37/37, 41/41 | 30/30, 37/37, 41/41 | `acceptance-summary.json` per change | Fact |
| Rule adherence | No `interface`, `any`, wildcard import, long file, bad file name, service without spec or inline body type in changed files | The same: none found | `rules.json` per change | Fact |
| Brownfield overhead | 585 document lines for 122 code lines; living specs edited in place | 1,265 document lines for 139 code lines; new numbered spec, old one left stale | Section 5.2 | Fact |
| Bugfix overhead | 3:56, $4.35, 225 document lines | 10:03, $10.05, 900 document lines | Section 5.3 | Fact |
| PR reviewability | Kit documents are 25%, 50% and 95% of added lines; the behaviour change is one readable diff of `openspec/specs/` | 28%, 58% and 95%; the behaviour change is spread over a new spec folder | `stats.json` per change | Fact + judgement |
| CI gate without AI | Yes: `openspec validate --strict`, exit 0 or 1, about 0.2 s | None. `specify check` only checks installed tools; `/speckit-analyze` needs an agent | `validate.record.json`; `research.md` §3.3 | Fact |
| Parallel task support | None in the task format; the backend/frontend split came from the added instruction | Native `[P]` markers (57 of 91 feature tasks); the split followed its task ranges | `tracks.json`; `speckit-variant/specs/001-room-bookings/tasks.md` | Fact |
| Learning curve | Three commands per change (propose, apply, archive) plus one CLI check | Six commands per change, plus a one-off constitution | Section 2 | Judgement |
| Fit with the Acme kit | Overlaps `/make` and `writing-plans`; scenarios feed `manual-tester` well | Overlaps `/make`, `research` and `writing-plans` more heavily (it writes its own research and plan); IDs help `manual-tester` | Section 8 | Judgement |

## 4. Time, tokens and cost

### 4.1 Per change

| Change | Measure | OpenSpec | Spec Kit |
|---|---|---|---|
| Feature | Hidden acceptance tests | 30 of 30 | 30 of 30 |
|  | Build / lint / unit tests | pass / pass / 287 of 287 tests | pass / pass / 280 of 280 tests |
|  | Real time, all steps | 28:30 | 39:06 |
|  | Cost | $20.02 | $27.18 |
|  | Turns | 139 | 131 |
|  | Output tokens | 216,624 | 288,401 |
|  | All tokens, including cache reads | 11,566,666 | 12,579,345 |
|  | Kit steps run | 7 | 6 |
|  | Kit documents written | 12 files, 1,224 lines | 10 files, 1,605 lines |
|  | Code changed | 49 files, +1,458 / -16 | 47 files, +1,534 / -16 |
|  | Tests changed | 29 files, +2,254 / -1 | 31 file, +2,649 / -0 |
| Brownfield change | Hidden acceptance tests | 37 of 37 | 37 of 37 |
|  | Build / lint / unit tests | pass / pass / 305 of 305 tests | pass / pass / 310 of 310 tests |
|  | Real time, all steps | 16:15 | 23:42 |
|  | Cost | $11.76 | $18.31 |
|  | Turns | 185 | 228 |
|  | Output tokens | 97,076 | 143,536 |
|  | All tokens, including cache reads | 8,328,851 | 8,042,357 |
|  | Kit steps run | 4 | 6 |
|  | Kit documents written | 10 files, 585 lines | 9 files, 1,265 lines |
|  | Code changed | 9 files, +122 / -9 | 9 files, +139 / -21 |
|  | Tests changed | 11 file, +469 / -149 | 11 file, +771 / -74 |
| Bugfix | Hidden acceptance tests | 41 of 41 | 41 of 41 |
|  | Build / lint / unit tests | pass / pass / 309 of 309 tests | pass / pass / 321 of 321 tests |
|  | Real time, all steps | 3:56 | 10:03 |
|  | Cost | $4.35 | $10.05 |
|  | Turns | 84 | 146 |
|  | Output tokens | 21,597 | 59,759 |
|  | All tokens, including cache reads | 2,445,968 | 4,524,884 |
|  | Kit steps run | 4 | 6 |
|  | Kit documents written | 6 files, 225 lines | 9 files, 900 lines |
|  | Code changed | 1 file, +2 / -2 | 1 file, +2 / -2 |
|  | Tests changed | 1 file, +11 / -0 | 1 file, +47 / -0 |


### 4.2 Per phase

The kits' steps are mapped to common phases. OpenSpec plans inside its `propose` step, so its Specify and Plan cannot be separated. OpenSpec's Check is a CLI command with no AI session.


| Change | Phase | OpenSpec time | OpenSpec cost | Spec Kit time | Spec Kit cost |
|---|---|---|---|---|---|
| Feature | Specify | 6:50 | $3.97 | 3:11 | $2.98 |
|  | Plan | inside Specify | inside Specify | 11:40 | $7.31 |
|  | Check | 0:00 | $0.00 | 3:56 | $3.00 |
|  | Implement | 20:01 | $13.57 | 20:20 | $13.88 |
|  | Close | 1:39 | $2.48 | — | — |
| Brownfield change | Specify | 5:22 | $4.12 | 2:18 | $2.48 |
|  | Plan | inside Specify | inside Specify | 9:21 | $6.83 |
|  | Check | 0:00 | $0.00 | 3:00 | $2.53 |
|  | Implement | 9:27 | $5.85 | 9:03 | $6.47 |
|  | Close | 1:26 | $1.80 | — | — |
| Bugfix | Specify | 1:58 | $1.94 | 1:29 | $2.05 |
|  | Plan | inside Specify | inside Specify | 4:43 | $4.35 |
|  | Check | 0:00 | $0.00 | 1:23 | $0.91 |
|  | Implement | 1:20 | $1.36 | 2:28 | $2.73 |
|  | Close | 0:38 | $1.04 | — | — |


Notes on these figures:
- **OpenSpec Close, feature:** $2.48 includes two archive attempts that did not complete ($0.80 and $0.38) before the one that did ($1.30). See section 6.
- **OpenSpec Implement, feature:** includes the resumed part after the usage-limit interruption.
- **Backend and frontend tracks, feature:** OpenSpec 14:16 and 7:24; Spec Kit 15:37 and 8:06, run at the same time in both. [Verified: `runs/<kit>/change-1/tracks.json`]

### 4.3 Totals and interventions


| | OpenSpec | Spec Kit |
|---|---|---|
| Setup (one-off) | 0:17, $1.35 | 0:46, $1.01 |
| Three changes, real time | 48:41 | 1:12:52 |
| Three changes, cost | $36.13 | $55.53 |
| Three changes, turns | 408 | 505 |
| Three changes, output tokens | 335,297 | 491,696 |
| Three changes, all tokens | 22,341,485 | 25,146,586 |
| Kit documents written, lines | 2,034 | 3,770 |
| Code lines added | 1,582 | 1,675 |
| Test lines added | 2,734 | 3,467 |



| Change | Kind | OpenSpec | Spec Kit |
|---|---|---|---|
| Feature | question | 0 | 0 |
|  | approval | 1 | 0 |
|  | reprompt | 1 | 0 |
|  | manual-fix | 0 | 0 |
|  | interruption | 1 | 0 |
|  | denied-permission | 1 | 1 |
| Brownfield change | question | 0 | 0 |
|  | approval | 0 | 0 |
|  | reprompt | 0 | 0 |
|  | manual-fix | 0 | 0 |
|  | interruption | 0 | 1 |
|  | denied-permission | 1 | 1 |
| Bugfix | question | 0 | 0 |
|  | approval | 0 | 0 |
|  | reprompt | 0 | 0 |
|  | manual-fix | 0 | 0 |
|  | interruption | 0 | 1 |
|  | denied-permission | 1 | 1 |


"denied-permission" means the kit left its own live-stack check tasks open because `curl` was not allowed; it is the same cause for both. "interruption" is the account usage limit, not the kit.

### 4.4 Reading tokens, cost and turns

The three measures do not always rank the two kits the same way. [Verified: `runs/<kit>/change-<n>/*.record.json`]

| What | What it counts | Example from these runs |
|---|---|---|
| All tokens | Every token, including the cached input the model re-reads on every turn. Most of the count is cache reads, which are billed at a small fraction of the normal rate | Brownfield: OpenSpec 8.33 million against Spec Kit 8.04 million |
| Output tokens | The text and code the model writes; the most expensive kind | Brownfield: OpenSpec 97,076 against Spec Kit 143,536 |
| Cost | All token kinds at their own prices, including subagents | Brownfield: OpenSpec $11.76 against Spec Kit $18.31 |
| Turns | Rounds of the kit's main session only; subagents' turns are not counted | Feature: OpenSpec 139 against Spec Kit 131 |

- **More tokens can still cost less.** In the Brownfield change OpenSpec used more tokens in total but wrote a third fewer output tokens, so it cost less. Output tokens and cost are the better guide to effort.
- **Fewer turns can still cost more.** In the Feature change both kits handed the backend and frontend coding to two agents, whose work counts in tokens and cost but not in turns. Spec Kit's implementation step logged 36 turns while its agents wrote 303 messages of their own. OpenSpec's 139 turns also include 40 spent on its three `archive` attempts.

**Correction made after the runs.** Claude Code's per-session `usage` field leaves out subagents, while its cost includes them. The first version of this report took tokens from `usage`, which under-counted the two Feature implementation steps. Token figures now come from the per-model breakdown, which covers subagents; costs and turns did not change. [Verified: `runs/notes.md`]

| Feature, before and after the correction | OpenSpec | Spec Kit |
|---|---|---|
| All tokens | 5,335,453 → 11,566,666 | 5,244,635 → 12,579,345 |
| Output tokens | 76,314 → 216,624 | 130,123 → 288,401 |
| Cost (unchanged) | $20.02 | $27.18 |

### 4.5 The rest of the project

These are outside the kit comparison. Wall times are from `runs/project-log.jsonl`; token figures are what helper agents reported. I cannot read the token use of my own main session; `/usage` shows it.

| Piece | Time | Helper-agent tokens |
|---|---|---|
| Research (four parallel investigations) | 2 to 7 min each | 114k, 155k, 174k, 143k |
| Design review (builder check) | 2 min | 87k |
| Baseline: workspace, infra, contract | 3 min | none |
| Baseline: backend agent / frontend agent | 13 min / 11 min, in parallel | 148k / 138k |
| Baseline: integration, verification, tag | 13 min | none |
| Acceptance suite, briefs, runner | 4 min | none |
| Kit installs and hardening | 16 min | two recorded steps |
| `manual-tester` fit check | 6 min each | 77k, 75k |

## 5. Per change

In every change the step that writes the code took about the same time with both kits. The difference is the planning and checking each kit does before code. Times below are minutes:seconds of recorded real time.

### 5.1 Feature

| | OpenSpec | Spec Kit |
|---|---|---|
| Hidden tests | 22 of 22 new; 30 of 30 in total | 22 of 22 new; 30 of 30 in total |
| Planning steps | 1: `propose` (6:50) | 4: `specify` (2:17), `clarify` (0:54), `plan` (7:03), `tasks` (4:37) |
| What planning produced | Proposal, design, 4 delta specs, 34 tasks | Spec and checklist, plan, research notes, data model, 3 contract files, quickstart, 91 tasks (57 marked parallel) |
| Check before code | `openspec validate --strict`: a CLI format check, under 1 s, passed | `/speckit-analyze`: an AI session, 3:56; 3 high-severity findings, no critical ones |
| Implement | 20:01, $13.57 (includes the part resumed after the usage limit) | 20:20, $13.88 |
| Backend / frontend agent | 14:16 / 7:24, in parallel | 15:37 / 8:06, in parallel |
| Close | `archive`, three attempts, 1:39, $2.48; created 4 living specs (477 lines) | No close step |
| Kit documents | 12 files, 1,224 lines | 10 files, 1,605 lines |
| Total | 28:30, $20.02 | 39:06, $27.18 |

[Verified: `runs/<kit>/change-1/*.record.json`, `acceptance-summary.json`, `stats.json`, `tracks.json`]

- **Common to both:** they built bookings CRUD on backend and frontend, the idempotent create and the confirmation job. Both noticed the planted paging bug while reading the code, recorded it, and left it alone because the brief put the room service out of scope. [Verified: `propose.record.json`, `plan.record.json` result text]
- **Why Spec Kit took 10:36 longer:**
  1. It plans in four steps and writes more: its `plan` and `tasks` steps alone took 11:40, producing research, a data model, contracts and 91 tasks against OpenSpec's 34.
  2. Its check is an AI session (3:56), where OpenSpec's is a command-line check (under a second).
- **What it shows [Judgement]:** on a full feature, coding costs the same with both kits ($13.57 and $13.88). The difference is what happens before code: $13.29 for Spec Kit's specify, plan and check, against $3.97 for OpenSpec's single planning step.

### 5.2 Brownfield change

| | OpenSpec | Spec Kit |
|---|---|---|
| Hidden tests | 7 of 7 new; 37 of 37 in total | 7 of 7 new; 37 of 37 in total |
| Planning steps | 1: `propose` (5:22) | 4: `specify` (1:50), `clarify` (0:28), `plan` (5:19), `tasks` (4:02) |
| How the change was recorded | Delta specs against its existing specs, in 3 areas: 7 requirements added, 2 modified, 1 removed | A new folder, `specs/002-prevent-booking-overlap/`, with 25 requirements, its own plan and contracts; it says it overrides part of spec 001 |
| Tasks | 19 | 30 |
| Check before code | `validate`, under 1 s, passed | `analyze`, 3:00, no critical findings |
| Implement | 9:27, $5.85 | 9:03, $6.47 |
| Close | `archive`, 1:26, $1.80; merged the deltas into the living specs | No close step |
| Specs afterwards | `openspec/specs/` changed by 150 lines in 3 files and states the overlap rule | `specs/001-room-bookings/spec.md` is unchanged (one commit) and still says overlapping bookings are accepted |
| Kit documents | 10 files, 585 lines | 9 files, 1,265 lines |
| Code added | 122 lines | 139 lines |
| Total | 16:15, $11.76 | 23:42, $18.31 |

[Verified: `runs/<kit>/change-2/*.record.json`, `acceptance-summary.json`, `stats.json`; `git diff change-1-done change-2-done -- openspec/specs` in `openspec-variant/`; `git log --follow` on spec 001 in `speckit-variant/`]

- **Common to both:** both added the one new error code to the contract and kept every earlier test passing. Both chose the same design on their own: lock the room inside the database transaction, then look for an existing booking whose start is before the new end and whose end is after the new start, skipping the booking being edited. [Verified: `apps/booking/src/booking/booking-overlap.query.ts` in both variants]
- **Why Spec Kit took 7:27 longer:**
  1. It writes a complete new spec for the change (1,265 lines across four steps), where OpenSpec writes only what changes against its existing specs (585 lines in one step). Spec Kit was in fact slightly faster at writing the code: 9:03 against 9:27.
  2. Its AI check took 3:00, against under a second.
- **What it shows [Judgement]:** this is the clearest structural difference. With OpenSpec a reader opens one file per capability to learn current behaviour. With Spec Kit a reader must read the specs in order and work out which statements were superseded.

### 5.3 Bugfix

| | OpenSpec | Spec Kit |
|---|---|---|
| Hidden tests | 4 of 4 new; 41 of 41 in total | 4 of 4 new; 41 of 41 in total |
| Planning steps | 1: `propose` (1:58) | 4: `specify` (1:05), `clarify` (0:24), `plan` (2:40), `tasks` (2:03) |
| Where the cause is written up | `proposal.md` and `design.md`, plus a new `rooms-api` spec recording the correct paging | `research.md` and `spec.md`, alongside a plan, data model, 2 contract files and a quickstart |
| Tasks | 4 | 15 |
| Check before code | `validate`, under 1 s, passed | `analyze`, 1:23, nothing blocking |
| Implement | 1:20, $1.36 | 2:28, $2.73 |
| Close | `archive`, 0:38, $1.04 | No close step; its task list included a commit |
| The fix | The same 2 lines | The same 2 lines |
| Regression test | 11 lines | 47 lines |
| Kit documents | 6 files, 225 lines | 9 files, 900 lines |
| Total | 3:56, $4.35 | 10:03, $10.05 |

[Verified: `runs/<kit>/change-3/*.record.json`, `before.json`, `after.json`, `stats.json`]

- **Common to both:** both analysed the bug and wrote up the cause before changing code, made the same fix and added a regression test. Page 2 at 5 per page went from Room 11 and 12 to Room 06 to 10.
- **Why Spec Kit took 6:07 longer (about 2.5 times):**
  1. It ran its full feature process for a 2-line fix. Its `plan` and `tasks` steps alone (4:43) took longer than OpenSpec's whole run (3:56).
  2. More tasks meant longer coding: 15 tasks with verification steps and a 47-line test took 2:28, against 1:20 for OpenSpec's 4 tasks and 11-line test. The AI check added 1:23.
- **What each kit's own documentation recommends:** OpenSpec's docs say to run a full proposal for a bugfix. Spec Kit's docs say a bugfix needs no feature workflow, and it ships an opt-in bug extension (`specify extension add bug`) and a bugfix workflow bundle. Neither was used here: both kits ran their full flow so the bugfix could be shown side by side. Spec Kit's figure is therefore the cost of its feature flow applied to a bug, not of its lightest path. [Verified: `research.md` §3.2, §3.3]
- **What it shows [Judgement]:** process weight is roughly fixed per change, not proportional to the change. For small fixes it dominates: about 95% of the lines added in both variants were kit documents.

## 6. Strengths and weaknesses

| Area | OpenSpec | Spec Kit |
|---|---|---|
| Time and cost | **Strength:** lowest on every change (section 4) | **Weakness:** about 50% more time and 54% more cost for the same outcome |
| Small changes | **Strength:** a bugfix took under 4 minutes | **Weakness:** heaviest on small changes unless the team adopts its separate bug flow |
| Keeping specs current | **Strength:** living specs updated in place after each change (section 5.2) | **Weakness:** specs accumulate; nothing reconciles an old spec with a later change |
| Quality gate | **Strength:** free, instant, AI-free `openspec validate`, usable in CI | **Strength:** `analyze` checks plan against code and constitution and found real issues early. **Weakness:** needs an AI session; no check without an agent |
| Traceability | **Weakness:** no requirement IDs | **Strength:** numbered requirements and success criteria that trace mechanically |
| Parallel work | **Weakness:** no parallel markers in the task list | **Strength:** native `[P]` markers |
| Running unattended | **Weakness:** its archive step asks for confirmation, and its tool pre-approval only holds for the turn that invoked the command. Answering by resuming the session failed on permissions; re-running with the answers in the prompt worked [Verified: `runs/notes.md`] | **Strength:** no questions, confirmations or re-runs in any step |
| Security defaults | **Weakness:** broad tool pre-approval and default-on telemetry must be configured away | **Strength:** no pre-approved tools, no telemetry, no hooks |
| Footprint | **Strength:** 15 files, exactly what the research predicted | 29 files, plus a Python environment outside the repo |

**Common to both:** correct results on every change (41 of 41 hidden tests), clean build and lint, and no coding-rule breaks found in the code they wrote.

## 7. Security observations, compared with the audit

- **Audit condition 3 is now verified.** A `permissions.deny` rule overrides the generated `allowed-tools: Bash(openspec:*)`: `openspec feedback --help` and `openspec install --help` were blocked while `openspec list --json` ran. [Verified: `runs/openspec/install/deny-test.md`]
- **Telemetry stayed off.** With `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1`, no `~/.config/openspec` or `~/.local/share/openspec` was created. [Verified: `runs/install-summary.md`]
- **Neither kit wrote hooks or touched `.claude/settings.json`.** [Verified: hashes before and after init, `runs/install-summary.md`]
- **Spec Kit 1.3.3 is newer than the audited commit.** The source delta was read line by line; it adds workflow-engine settings, safer file deletion and stricter parsing, and nothing that changes a plain Claude init. The installed package has no `.py` file that differs from the tag. Tests and docs in the delta were not read. [Verified: `research.md` §3.3; `runs/install-summary.md`]
- **OpenSpec 1.17.0 exists** (published 2026-11-09) and was not used; the audit covers 1.16.1.
- **A wrapped command is not covered by the deny pattern.** `pnpm exec openspec feedback` does not match `Bash(openspec feedback:*)`. It is also not pre-approved, so it would be denied headless and would prompt interactively. [Assumption: reasoned from the patterns, not tested]
- **What a session inherits.** A session inside a variant loaded only that variant's agents, but also the user-level Postman and Slack plugins and their session-start hook. That was identical for both kits. [Verified: `runs/notes.md`]
- **Headless trust.** A folder never opened interactively has its allow rules ignored; deny rules and a skill's own `allowed-tools` still apply. Relevant to any CI use of either kit. [Verified: `runs/notes.md`]
- **Kit notes still name Acme** in one file of the copied `.claude/` kit (`skills/THIRD-PARTY-SKILLS.md`), as the origin of that kit. No application source does. During the runs a second file, `commands/get.md`, also did; it was removed afterwards with the other unused kit items. [Verified: `grep -ril acme` over the three repositories]

## 8. Fit with Acme

- **Overlap with `/make`, `research`, `writing-plans` [Judgement].** OpenSpec's `propose` replaces roughly what `/make` plus `writing-plans` produce, in one step. Spec Kit replaces those and also writes its own research and data-model documents, so it overlaps the existing `research` skill as well. Running either kit next to the current flow means choosing one planning path.
- **`manual-tester` [Verified: `runs/manual-tester-fit.md`].** Both specifications worked as a requirement source in place of a Jira ticket. OpenSpec's WHEN/THEN scenarios turned into test cases with the least guessing; Spec Kit's IDs made the coverage table easiest. Neither gave on-screen wording or test-data setup.
- **CI [Verified].** `openspec validate --strict` can be a pipeline step today. Spec Kit offers nothing equivalent without an agent.
- **Brownfield and bugfix work [Judgement].** Acme's daily work is mostly changes to existing behaviour and fixes. That is where OpenSpec's advantage was largest.
- **Shared rules [Verified].** Both kits accepted the same project rules (OpenSpec through `openspec/config.yaml`, Spec Kit through its constitution), and neither produced a rule break the checks could find.

**Recommendation and conditions**

Adopt OpenSpec, as a pilot on one Acme service, provided that:
1. the version is pinned and installed through npm, with the generated files diffed on every bump;
2. `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1` are set in shared settings;
3. the two deny rules are in place (now verified to work);
4. only the `core` profile is used;
5. nothing confidential goes into committed specs;
6. the team decides whether `/make` stays for large work or gives way to `/opsx:propose`;
7. `openspec validate --strict` is added to CI, and archiving is part of the definition of done so the living specs stay current.

Prefer Spec Kit only if numbered requirements, a written constitution and a built-in analysis step matter more to the team than roughly half again the time and cost per change, and the team accepts that its specs record history rather than current behaviour.

## 9. Open questions

- Would the result hold on a second run, or with a different model? This was one run each.
- How would the kits compare if they also had to design the API?
- What does Spec Kit's opt-in bug flow cost? It was not used.
- Does OpenSpec's confirmation at archive get in the way in interactive use, or only headless?
- Should `openspec/` be committed in Acme, given `.claude/` and `plans/` are gitignored there today?
- The baseline pairs `@hookform/resolvers` 5.4.0 with `react-hook-form` 7.51.1, as Acme does. Spec Kit's analyze step flagged that the resolver declares a newer peer version. Both variants built and passed, but Acme may want to check it.

## 10. How to show it

```bash
cd /workspace/spec-duel
node console/server.mjs        # http://127.0.0.1:4300
```

Three scenes (Feature, Brownfield change, Bugfix), each replaying the recorded run of both kits in about two minutes with the real figures. The bugfix scene opens on the wrong rooms, has a "Run bugfix" button, and ends on the corrected rooms and a side-by-side table. The console only replays recordings; it never calls Claude, so it costs nothing to use.

Final checks run on 2026-11-10: no git remote in the baseline or either variant; no `.env` file tracked; no stack left running; 30 tool and console tests pass.
