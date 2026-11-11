# Research: what a third kit should keep, drop and add

Date: 2026-11-11. Read-only. Paths are relative to `/Users/tidi/sunbytes/openspec-demo/`.
Sources: `reports/openspec-vs-spec-kit-code-audit.md` (CA), `reports/openspec-vs-spec-kit-comparison.md` (CR), `plans/reports/openspec-variant-code-audit.md` (OS-A), `plans/reports/speckit-variant-code-audit.md` (SK-A), the recordings under `runs/`, and both kits' instruction files.

## 1. Problem understanding

Decide what a purpose-built kit (`cyberrock-variant`) must contain to beat OpenSpec and Spec Kit on cost, time and output tokens, match them on correctness, and produce fewer code-audit findings. The decision this supports: the kit's flow, artifact format, validator, skills and agents (`design.md`).

Out of scope: changing the briefs, the acceptance suite, the other variants or their recordings.

## 2. Existing implementation

- **Runner.** Each kit step is one headless `claude -p` session (`runs/tools/run-step.mjs:61-73`), scored by `verify-change.mjs`, `score-change.mjs`, `change-stats.mjs`, `check-rules.mjs`. Kit lists are hardcoded in `rollup.mjs:7`, `phases.json`, `make-prompts.mjs:8-22`, `score-change.mjs:13`, `report-tables.py`.
- **Variants.** `baseline/` plus an allowlist in `.claude/settings.json` plus the kit (`runs/install-summary.md`). Both kits coded with the baseline agents `nestjs-expert` and `nextjs-fe-developer`.
- **Agent rule that caused a finding.** The baseline backend agent tells the model to hand-roll transactions: "with an explicit QueryRunner: `connect`, `startTransaction` …" (`baseline/.claude/agents/nestjs-expert.md:29`). Spec Kit followed it and got SK-A F10 (duplicated `queryRunner` boilerplate); OpenSpec ignored it and used `dataSource.transaction`. [Verified]

## 3. Findings

### A. Strengths to keep

| # | Strength | From | Evidence | Kind |
|---|---|---|---|---|
| A1 | Living specs updated in place by ADDED / MODIFIED / REMOVED deltas | OpenSpec | CR §5.2; `openspec-variant/openspec/specs/` (5 files) | Verified |
| A2 | One planning step | OpenSpec | CR §5.1: 1 step against 4 | Verified |
| A3 | Free AI-free gate, about 0.2 s | OpenSpec | CR §3 "CI gate without AI"; `runs/openspec/change-*/validate.record.json` (cost 0) | Verified |
| A4 | SHALL + WHEN/THEN scenarios with concrete values; they became test cases with the least guessing | OpenSpec | `runs/manual-tester-fit.md`; CR §8 | Verified |
| A5 | Code read before drafting found real facts (existing spec asserted the opposite, a lock-name clash) | Both | `openspec-variant/openspec/changes/archive/2026-11-10-prevent-room-booking-overlap/design.md:5-11,44` | Verified |
| A6 | Numbered requirement IDs that trace mechanically | Spec Kit | CR §3 traceability row; `speckit-variant/.specify/templates/spec-template.md:90` | Verified |
| A7 | Parallel task markers `[P]` (57 of 91 feature tasks) | Spec Kit | CR §3; `speckit-variant/specs/001-room-bookings/tasks.md` | Verified |
| A8 | A check that reads plan against code and found real inconsistencies | Spec Kit | `runs/speckit/change-1/analyze-report.md` (3 high findings) | Verified |
| A9 | Fully unattended: no question, confirmation or re-run | Spec Kit | CR §4.3 interventions | Verified |
| A10 | No pre-approved tools, no telemetry | Spec Kit | `runs/install-summary.md` | Verified |
| A11 | Code: `dataSource.transaction`, one home per rule, UTC for offset-less dates, key kept across a retry, pager steps back after a delete, −18% lines | OpenSpec | CA §4.3, §4.6, §4.10, §5 | Verified |
| A12 | Code: partial update merged inside the lock, enqueue timeout, one shared form schema, thorough paging regression test | Spec Kit | CA §5, §6 B2, §4.4, §4.8 | Verified |
| A13 | A "verify …" clause on every task: 19 tasks in 43 lines | OpenSpec | `…/2026-11-10-prevent-room-booking-overlap/tasks.md:7-42` | Verified |

### B. Weaknesses to avoid

| # | Weakness | From | Evidence | Kind |
|---|---|---|---|---|
| B-1 | No requirement IDs, no parallel markers | OpenSpec | CR §6 | Verified |
| B-2 | Archive asks up to three confirmations; feature archive took 3 attempts, $2.48 | OpenSpec | `openspec-variant/.claude/commands/opsx/archive.md:80,102,124-127`; `runs/openspec/change-1/archive*.record.json` | Verified |
| B-3 | The model performs the spec merge by hand and re-reads each spec pair three times | OpenSpec | `archive.md:115,157`; sync skill `:106-108` | Verified |
| B-4 | `Bash(openspec:*)` pre-approval in every file; telemetry on by default | OpenSpec | `runs/install-summary.md` | Verified |
| B-5 | About 13 CLI round trips in propose, about 21 in apply (status re-run after every task) | OpenSpec | `propose.md:27-143`, `apply.md:39-109` | Inferred count |
| B-6 | MODIFIED cannot drop a scenario, so requirements are removed and re-added whole | OpenSpec | `…/prevent-room-booking-overlap/specs/booking-idempotency/spec.md:28-62` | Verified |
| B-7 | Six AI sessions per change, whatever its size | Spec Kit | CR §5; section D below | Verified |
| B-8 | AI-only check, $0.91–3.00 per run | Spec Kit | `runs/speckit/change-*/analyze.record.json` | Verified |
| B-9 | Dated specs go stale: spec 001 still allows overlaps | Spec Kit | CR §5.2 | Verified |
| B-10 | The same rule restated in up to 7 files; 114 of 274 task-file lines are template filler | Spec Kit | `speckit-variant/specs/002-prevent-booking-overlap/` (`spec.md:29`, `plan.md:17`, `research.md:88`, `data-model.md:54`, `contracts/gateway-http-api.md:39`, `tasks.md:71,161-274`, `quickstart.md:90`) | Verified |
| B-11 | Instruction weight: 1,520 skill lines per pipeline, 70 lines of unused hook boilerplate per skill, a 114-line constitution loaded six times | Spec Kit | `speckit-variant/.claude/skills/speckit-plan/SKILL.md:22-56,72-105` | Verified |
| B-12 | Code: rules split across layers (F9), raw SQL with a hand-kept column list (F8), duplicated transaction boilerplate (F10) | Spec Kit | SK-A F8–F10 | Verified |
| B-13 | No real-database test of locks or the overlap rule; no database constraint | Both | OS-A #3, #4; SK-A F6, F7 | Verified |
| B-14 | A spec that asserts a failure is swallowed | OpenSpec | `openspec-variant/apps/booking/src/booking/confirmation-queue.producer.spec.ts:36` | Verified |
| B-15 | Form fields duplicated between create and edit | Both | OS-A #5, SK-A F11 | Verified |
| B-16 | Line coverage (99%) overstates what was checked; branch coverage (93%) is the better guide | Both | CA §3 | Verified |

### C. Bug-class catalogue

Each row is a class, not a roombook fix. "Src" lists the findings it generalises.

| ID | Class | Detection question | Avoid rule | Required test shape | Src |
|---|---|---|---|---|---|
| R-01 | Explicit `null` on an optional input | Which optional fields can arrive as `null`, and what do the parser and the `??` / `COALESCE` fallback do with it? | Optional means absent. Reject `null` at the DTO, or handle it as a named case | Send `null` for every optional field; assert rejection or the stated result | B1 |
| R-02 | Read-modify-write outside the guard | Is any value read before the lock or transaction and written back inside it? | Read, merge and write inside the same transaction that takes the lock | Two partial updates of different fields; both survive | B2 |
| R-03 | Side effect after commit with no recovery | What happens if the queue, bus or mail call fails or the process dies after commit? | Give the call a timeout, never swallow its failure silently, and state the recovery path (outbox, sweep or replay) | Make the side effect fail; assert the recorded state and the retry path | B3, OS-A #11 |
| R-04 | Date-time without an offset | How is `2030-01-07T09:00` read, and does the answer depend on the server's zone? | Reject offset-less input or define it as UTC in one helper | The same input under two `TZ` values gives the same instant | B4 |
| R-05 | Validator and parser disagree | Does the validator accept any form the parser reads differently? | Validate and parse with the same strict grammar | Unusual but valid forms (ordinal or week dates, lower-case, extra precision) are rejected or parsed correctly | B7 |
| R-06 | Equality on non-normalised input | Is a hash, fingerprint or uniqueness check computed on raw strings? | Normalise (parse, trim, case-fold) before hashing or comparing | Two spellings of the same value are treated as equal | B9 |
| R-07 | Unbounded growth | Which rows, keys or jobs are written and never removed? | Give each a TTL, a retention option or a recorded decision | Assert the retention setting exists | B10 |
| R-08 | Invariant only in application code | Does the invariant still hold if one write path forgets the check or the lock? | Back it with a database constraint (unique, check, exclusion); keep the application check for the friendly error | Insert a violating row directly; the database refuses | B12 |
| R-09 | Guarantee tested only against mocks | Is a lock, transaction, constraint or raw SQL statement tested without a real database? | One integration spec against the real database for each such guarantee | Concurrent requests against real Postgres; exactly one wins | OS-A #3, SK-A F6 |
| R-10 | A test that locks in a bug | Does any spec assert that an error is swallowed or that data is lost? | Assert the behaviour the requirement states, never the current accident | Review each "does not throw" or "is ignored" assertion against a requirement | B-14 |
| R-11 | One rule, two homes | Is the same rule implemented in two layers, paths or forms? | One function or schema per rule, called from every path | A new rule value changes one file | SK-A F9, OS-A #5 |
| R-12 | Hand-kept copy of the schema | Is there a column list, row mapper or transaction scaffold written by hand next to an ORM that provides it? | Use the ORM API (`dataSource.transaction`, repository or query builder); raw SQL only where the ORM cannot express it | Add a column; no query needs editing | SK-A F8, F10 |
| R-13 | Dead data | Is any column, field or option written and never read? | Do not add it | Grep shows a reader for every new column | OS-A #10, SK-A F12 |
| R-14 | Client retry identity | When a request times out or returns 5xx or "in progress", does the retry carry the same idempotency key? | Keep the key until the user changes the payload; drop it only after a final answer | A 503 then a retry sends the same key | B5 |
| R-15 | List state after a mutation | After deleting the last row of the last page, where is the user? | Step back to the last non-empty page; refetch after every mutation | Delete the only row on page N; page N−1 shows | B6 |
| R-16 | Hardcoded fetch cap | Does a list silently stop at a literal limit? | Page through, or show that the list is truncated | More items than the cap; all are reachable or the cut is visible | B11 |
| R-17 | Precision lost on a round trip | Does editing one field rewrite another through a lossy format? | Send only changed fields; format without dropping precision | Edit the title of a record whose time has seconds; the time is unchanged | B8 |

### D. AI-interaction and cost analysis

Computed with `runs/tools/profile-steps.mjs` (new, read-only) over every `*.record.json` and `*.events.jsonl` of both kits. Command: `node runs/tools/profile-steps.mjs openspec speckit`.

**D1. What a dollar bought.** A least-squares fit of cost on token counts over the non-resumed step records gives effective prices of about **$21.6 per million output tokens, $19.9 per million cache-write tokens and $0.15 per million cache-read tokens** (largest residual $0.52). [Verified: fit over `runs/*/change-*/*.record.json`]

| Kit, change | Output | Cache write | Cache read | Total |
|---|---:|---:|---:|---:|
| OpenSpec, feature | $4.68 (23%) | $13.77 (69%) | $1.62 (8%) | $20.02 |
| OpenSpec, brownfield | $2.10 (19%) | $7.86 (70%) | $1.19 (11%) | $11.77 |
| OpenSpec, bugfix | $0.47 (10%) | $3.78 (82%) | $0.34 (7%) | $4.34 |
| Spec Kit, feature | $6.24 (23%) | $19.21 (71%) | $1.72 (6%) | $27.18 |
| Spec Kit, brownfield | $3.10 (17%) | $13.85 (77%) | $1.09 (6%) | $18.31 |
| Spec Kit, bugfix | $1.29 (12%) | $8.53 (82%) | $0.61 (6%) | $10.05 |

**This corrects the comparison report.** CR §2 says output tokens are the most expensive kind. Per token they are, but **70–82% of every change's cost was cache writes**: every token that enters a context for the first time (system prompt, tool results, files read, the model's own earlier output) is written to the cache once at about the output price. The total number of turns matters little: cache reads were 6–11% of cost. **The cost lever is how many tokens enter how many contexts.**

**D2. Every session pays an entry fee.** The first turn of every session loads 49,000–59,000 tokens before any work (`contextLoadTokens` in the profile; `runs/notes.md` measured $0.6–0.7 per empty step).

| Kit, change | AI sessions | Context-load tokens | About | Share of the change's cost |
|---|---:|---:|---:|---:|
| OpenSpec, feature | 6 (3 are archive attempts or resumes) | 419,839 | $8.36 | 42% |
| OpenSpec, brownfield | 3 | 153,537 | $3.06 | 26% |
| OpenSpec, bugfix | 3 | 154,007 | $3.07 | 71% |
| Spec Kit, feature | 6 | 314,091 | $6.26 | 23% |
| Spec Kit, brownfield | 6 | 309,343 | $6.16 | 34% |
| Spec Kit, bugfix | 6 | 310,128 | $6.18 | 61% |

The dollar figure is an upper bound (part of each load is a cheaper cache read), but the shape holds: **on the bugfix, session start-up was 60–70% of what both kits cost.** This is why process weight looked fixed per change (CR §5.3).

**D3. Where the pre-code money went.** Feature, before any code: OpenSpec $3.97 in 1 session (43,457 output tokens, 752 document lines); Spec Kit $13.30 in 5 sessions (118,665 output tokens, 1,620 document lines). Coding cost the same: $13.57 against $13.88. [Verified: profile rows `propose`, `specify`…`analyze`, `apply`, `implement`]

**D4. AI calls that bought nothing.**
- OpenSpec archive: $2.48, $1.80 and $1.04 per change for a merge a script can do; the feature archive needed three sessions because of a confirmation (B-2, B-3).
- Spec Kit `clarify`: $1.29, $0.95, $0.87; no spec has a `## Clarifications` section, so it changed nothing.
- Spec Kit `tasks`: $3.30, $3.31, $1.97 to repackage the plan (B-10).
- **Denied tool calls: 39, 23 and 12 per change for OpenSpec; 22, 23 and 20 for Spec Kit.** Each is a wasted round trip. 97 of the 138 were compound shell commands (`cd … && cat …`, `for f in …; do cat`, pipes, `sed -i`, heredocs) that the allowlist cannot match; 16 were `curl`, which no kit was allowed. Neither kit's instructions say how to read files or which commands are permitted. [Verified: `permission_denied` events joined to their `tool_use` commands]

**D5. AI calls that bought quality.**
- Reading the code before drafting (A5).
- Spec Kit `analyze` (A8): real findings, but $0.91–3.00 for a pass that re-reads four documents and no code diff. Its coverage pass (requirement without task, task without requirement) is mechanical and can be a script.
- Neither kit ran any review of the code it wrote. All 25 audit findings shipped.

**D6. Subagents.** Only the feature implement step used them (two each, as the brief's note asked). They made 242 and 264 tool calls, against 86 and 53 in the main session, and read 94 and 92 distinct files. Their tokens count in cost but not in turns. Both kits spent the same there, so parallel tracks are a time lever, not a cost lever.

### E. Levers, ranked

Cost levers (evidence in brackets):

1. **Fewer sessions.** Feature and change: 2 (propose, apply). Bugfix: 1. Saves about $1 per avoided session [D2].
2. **Script what is mechanical.** Format validation, coverage checks, task ticking and the spec merge run in a Node script, at no cost [D4, A3].
3. **One document per change, with a size budget.** Each rule stated once and referenced by ID. Every document line costs twice: written as output, then re-read as a cache write in the next session [D1, B-10].
4. **Tell the model how to use its tools.** Read with Read, Grep and Glob; shell only for allowlisted single commands. Removes most of 12–39 denied calls per change [D4].
5. **Short instruction files.** A whole pipeline in about 300 skill lines instead of 923 or 1,520 [B-11].
6. **Read narrowly.** Only the files the change touches and the nearest sibling; never a whole tree [D1].

Quality levers:

1. **Bug classes in the coding agents** (R-01…R-17 as short imperatives), so the mistakes are avoided while writing, not found afterwards [C].
2. **A risk table in the change document**, mapping each class that applies to a test task; the validator enforces it [C, A8].
3. **One targeted AI review of the diff** against the catalogue, in a fresh context, for feature and change tiers. This is where AI is spent on purpose: neither kit did it and 25 findings shipped [D5].
4. **Real-database specs** for anything that relies on a lock, transaction or constraint, and a database constraint behind each invariant [B-13].
5. **Fix the agent rule that caused F10**: `dataSource.transaction`, not a hand-rolled `queryRunner` [section 2].

## 4. Approaches and trade-offs

| Option | Sessions (feature / change / bugfix) | Human review point | Expected cost | Risk |
|---|---|---|---|---|
| A. OpenSpec plus IDs and a review step | 4 / 4 / 4 | Yes | Higher than OpenSpec today | Keeps the CLI round trips and the AI merge |
| B. Spec Kit minus clarify and tasks | 4 / 4 / 4 | Yes | Between the two kits | Keeps stale specs and document weight |
| **C. New kit: one change file, script gate and merge, tiers, review inside apply** | **2 / 2 / 1** | Yes for feature and change; the diff itself for a bugfix | Lowest | New code to maintain: about 400 lines of dependency-free Node |
| D. One session for everything | 1 / 1 / 1 | No | Lowest | No point at which a person can stop a wrong spec before code |

## 5. Recommendation

Option C. It is the only one that removes the entry fees (D2) and the wasted AI calls (D4) while keeping a review point and adding the quality steps neither kit had (D5).

## 6. Risks and edge cases

- **The review subagent costs a context of its own.** Limited to feature and change tiers and to the code diff; skipped for a bugfix.
- **Real-database specs can break the unit test run when the stack is down.** They get their own file suffix and are excluded from the default test target.
- **A size budget can squeeze out a needed requirement.** The validator reports the overrun; the model must cut restatement first, and the budget is one constant to raise.
- **The brief's parallel note names the baseline agents.** `cr-apply` maps those names to the kit's agents, and every delegation prompt points at the risk catalogue, so the rules arrive either way.
- **A headless session ignores allow rules in an untrusted folder** (`runs/notes.md`). The kit's script is also granted through each skill's own `allowed-tools`, which holds regardless.

## 7. Suggested implementation plan

See `design.md` and `plan.md` in this folder. Assumptions recorded there; no open question blocks the build.
