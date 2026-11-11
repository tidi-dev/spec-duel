# Code audit of the three kits: what each one wrote

**Author:** Dai Ho (contact@daiho.tech) · **Date:** 2026-11-11 · **Scope:** `apps/` and `libs/` of `openspec-variant/`, `speckit-variant/` and `cyberrock-variant/`, kit-written code only

This report puts the CyberRock kit's code next to the code OpenSpec and Spec Kit wrote. The findings for OpenSpec and Spec Kit are those of the original two-kit audit, `reports/openspec-vs-spec-kit-code-audit.md`, which is unchanged. The CyberRock kit was audited a day later with the same method. Process cost and time are in `reports/cyberrock-variant-evaluation.md`.

## 1. Summary

All three kits wrote correct, rule-compliant code. None has a critical finding, all pass build, lint and their unit tests, and all pass the hidden acceptance suite (41 of 41).

| | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| Audit score, out of 50 | 40 | 37 | 39 |
| Findings: critical / high / medium / low | 0 / 0 / 5 / 6 | 0 / 1 / 8 / 5 | 0 / 0 / 4 / 14 |
| Known bugs B1 to B12 present | 8 | 11 | 2 (one reduced) |
| Guarantees enforced in the database and tested there | none | none | overlap constraint, 38 real-database tests |
| Lines added to `apps` and `libs` | 4,158 | 5,047 | 5,791 |

- **OpenSpec** wrote the least code and has the highest score. Its worst bug: a partial edit can silently undo a concurrent edit.
- **Spec Kit** has the only high finding (a `null` date stored as 1970) and two web bugs the others avoid.
- **CyberRock kit:** no high finding, the fewest medium findings and the fewest known bugs, and the only code whose concurrency guarantees are enforced by the database and tested against it. It also wrote the most code, almost all of the extra in tests, and it has the most low findings.

The three scores are within what one reviewer differs from another. The differences that can be counted are the findings by severity and the bug table in section 6.

## 2. Method

| Step | What was done |
|---|---|
| Skill | `lean-audit` for all three, with RULES.md R1 to R11 and the TypeScript and architecture rules |
| Scope | Only the code each kit added to the shared starting code. Starting code was read only where new code calls it |
| Reviewers | One read-only reviewer per kit. Each saw only its own kit and could not open another kit, another audit or any report |
| Figures | The same scripts for all three: `runs/tools/code-metrics.mjs` and `runs/tools/complexity-metrics.mjs`. They reproduce the original audit's file, test, query and complexity counts; duplication uses a different rule, so compare it only across the columns here |
| Verification | For each kit the main session re-read the code behind the high and medium findings. Every bug found in one kit was looked for in the others (section 6) |

What differs for the CyberRock kit: it was audited a day later, its reviewer's brief asked explicitly for a strict review, and its real-database tests were run (the other kits have none to run).

## 3. Metrics

Kit-written code only, unless marked *whole scope*.

| Metric | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| Files changed, lines added | 89, +4,158 | 91, +5,047 | 84, +5,791 |
| Source files / code lines | 55 / 1,668 | 52 / 1,713 | 45 / 1,580 |
| Test files / test code lines | 34 / 2,211 | 39 / 2,894 | 39 / 3,585 |
| Test lines per source line | 1.33 | 1.69 | 2.27 |
| Test cases in kit-written tests | 172 | 182 | 233 |
| Test files that run against a real Postgres | 0 | 0 | 6 (38 tests) |
| Unit tests run, *whole scope* (all pass) | 309 | 321 | 429 |
| Line / branch coverage, *whole scope* | 99.2% / 93.3% | 99.1% / 93.7% | 97.7% / 94.4% |
| Build / lint / test | pass / pass / pass | pass / pass / pass | pass / pass / pass |
| Files over 200 lines | 0 | 0 | 1 (a test file, 201 lines) |
| Function complexity: average / highest | 1.73 / 14 | 1.79 / 10 | 1.73 / 11 |
| Functions with complexity over 5 | 2 | 4 | 3 |
| Functions over 50 lines | 4 | 4 | 2 |
| Functions with 4 or more parameters | 2 | 3 | 1 |
| Duplicated source lines | 3.2% | 6.0% | 2.1% |
| Raw SQL calls, all parameterised | 7, yes | 11, yes | 9, yes |
| Transactions | 2, ORM helper | 2, hand-rolled | 2, ORM helper |
| Database constraint behind the overlap rule | no | no | yes |
| `interface` / `any` / wildcard imports / lint suppressions | 0 | 0 | 0 |
| Lines a cleanup could remove | about 35 | about 65 | about 510, nearly all in tests |

Notes: coverage for OpenSpec and Spec Kit is from the original audit; the CyberRock figure was measured with its database running. The CyberRock kit's unit test run needs Postgres, because its real-database tests run in the same target; this is a defect of the kit's own instructions, recorded in the evaluation report.

## 4. Findings by criterion

### 4.1 Code quality

- **All three:** clear names, typed results from repositories, existing helpers reused.
- **OpenSpec:** maps every repository result in one complete `switch`.
- **Spec Kit:** maps raw SQL rows by hand; does not handle `null` input.
- **CyberRock kit:** small pure functions for parsing and merging input (`apps/booking/src/booking/booking-input.ts`), typed outcomes, one complete `switch` for create results. A few over-careful branches and two formatting slips.

### 4.2 Code smells

- **All three:** short functions, no filler comments, named constants.
- **OpenSpec and Spec Kit:** both carry a `response_status` column that is written and never read.
- **Spec Kit:** repeats in SQL a check the code and the table already enforce.
- **CyberRock kit:** no dead `response_status` column. Three smells of its own: a "pipe" that is not used as a pipe (`apps/gateway/src/booking/idempotency-key.pipe.ts`), a gateway service that receives the HTTP response object, and repository helpers that throw the business error themselves.

### 4.3 Structure

- **All three:** controller → service → repository is respected; transactions sit in repositories; the gateway stays thin.
- **OpenSpec:** one home for each booking rule; the service checks the time order for create and update.
- **Spec Kit:** create and update apply the rules in different layers, so a new rule is added twice.
- **CyberRock kit:** one overlap helper and one span check shared by create and update. The rules live in pure modules but are run, and turned into errors, inside the repository, because the merge must happen inside the lock.

### 4.4 Duplication

- **OpenSpec and Spec Kit:** the Title, Start and End fields are copied between the create form and the edit dialog. OpenSpec also copies the validation rules; Spec Kit shares them in one schema but copies its transaction code twice.
- **CyberRock kit:** one form schema and one fields component for both forms (`apps/web/src/views/bookings/booking-form-schema.ts`, `booking-form-fields.tsx`). Its duplication is in tests: the real-database tests copy the same setup four times.

### 4.5 Potential bugs

Section 6 has the full list. In short: OpenSpec has 0 high and 3 medium bugs; Spec Kit 1 high and 4 medium; the CyberRock kit 0 high and 3 medium, two of them shared by all three.

### 4.6 Security

- **All three:** input validated with a whitelist, ids and keys checked as UUIDs, every SQL parameter bound, no `LIKE` patterns, no hardcoded config.
- **OpenSpec:** reads a time without a zone as UTC.
- **Spec Kit:** lets `null` dates through, and reads a time without a zone in server-local time.
- **CyberRock kit:** rejects `null`, times without a zone and unusual date forms with a 400. It rejects a NUL character in a title, which would otherwise answer 500. It is too strict in one place: valid times without seconds are refused.

### 4.7 Rule compliance

- **OpenSpec and Spec Kit:** no violation of R1 to R11 or the TypeScript and architecture rules.
- **CyberRock kit:** R1 to R11 hold. One test file is 201 lines against the 200-line limit, and one export is unused.

### 4.8 Tests

- **OpenSpec and Spec Kit:** broad suites; gateway tests run the real HTTP app. Their repository tests check SQL strings and the order of mock calls. Neither runs the overlap race or the locks against Postgres, which is the main guarantee of the second change. One OpenSpec test asserts that a failed queue call is swallowed, which locks a bug in.
- **CyberRock kit:** tests on every layer, plus real-database tests with real concurrency: ten identical creates, two overlapping creates, two updates into each other, and a case that fails when the room lock is removed. Weak points: those tests skip silently when the database variables are missing; about 400 lines of unit tests only check which ORM calls were made; and three tests pin the behaviours of its own medium findings.

### 4.9 Maintainability

| Task | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Add a booking rule | One place | Two paths: create service and update repository | One place |
| Add a booking field | Entity, migration, DTO, mapper, fingerprint, two forms | The same, plus the raw column list | Entity, migration, DTO, mapper, fingerprint, one shared form schema. The fingerprint lists fields by hand, so a new one can be missed |
| Add a page | One view folder and a route | One view folder and a route | One view folder and a route |
| Persistence code to understand | ORM calls | Raw SQL and a hand-rolled transaction | ORM calls, two advisory-lock queries, one exclusion constraint |
| Weight of the test suite | 2,211 lines | 2,894 lines | 3,585 lines; the call-checking tests slow refactors |

### 4.10 Frontend

- **All three:** small components; loading, error and empty states; late responses ignored; labelled controls.
- **OpenSpec:** keeps the retry key until the form is edited; steps back a page after a delete; times entered in UTC. Its page component is the most complex function of the three kits (complexity 14). Loads only the first 100 rooms.
- **Spec Kit:** drops the retry key on any error, so a retry after a 503 looks like a double-booking. Deleting the last row of the last page leaves an empty page. Times entered in local time, which is friendlier. Loads only the first 100 rooms.
- **CyberRock kit:** keeps the retry key while the outcome is unknown; steps back to the last page; sends only the fields an edit changed; pages through all rooms (ten at a time, which is slow). Its own gaps: the confirmation column goes stale until a reload, a delete error stays on screen, delete has no confirmation, and after a create error with an unknown outcome the list is not reloaded.

## 5. Strengths and weaknesses

### OpenSpec

| Strengths | Weaknesses |
|---|---|
| Least code for the same behaviour | A partial edit read outside the transaction can undo a concurrent edit |
| ORM transaction helper; no hand-mapped SQL | A failed queue call is swallowed, with no timeout, and a test locks that in |
| One home for each booking rule | Create and edit forms copy fields and rules |
| A time without a zone is read as UTC | Locks tested only against mocks; no database constraint |
| The retry key survives a retry; the pager recovers after a delete | The bookings page component has complexity 14 |

### Spec Kit

| Strengths | Weaknesses |
|---|---|
| Edits merge inside the room lock, so no edit is lost | `null` dates store 1 January 1970 (high) |
| Tells "still running" (409) from "reused key" (422) | A time without a zone is read in server-local time |
| Queue calls time out after 2 seconds | The retry key is dropped on a 503; empty page after a delete |
| Form rules shared in one schema; local-time inputs | Raw SQL with a hand-kept column list; duplicated transaction code |
| More tests than OpenSpec; thorough paging regression test | Rules split across layers between create and update |

### CyberRock kit

| Strengths | Weaknesses |
|---|---|
| Overlap is stopped twice: a room lock and a Postgres exclusion constraint, both answering the same 409 | A booking can be stored while the caller is told it failed; its confirmation is then sent only if the caller retries |
| The key claim, the booking and the stored answer are one transaction; a second request with the same key is told "in progress" at once | Network errors use up the worker's three attempts, so a booking can stay pending after a restart |
| No network call inside a database transaction | Valid times without seconds are refused |
| Edits lock the row, merge inside the lock and write only the changed columns | The real-database tests skip silently when the database variables are missing |
| The guarantees are tested against a real Postgres with real concurrency | About 510 lines of tests could be removed |
| The web client keeps the retry key while the outcome is unknown, sends only changed fields, and recovers after deleting the last row | Most low findings of the three (14) |

## 6. Potential bugs, checked in all three kits

B1 to B12 are the bugs of the original audit. C1 to C3 are the medium findings of the CyberRock audit that were not in that list; the main session looked for each in the other two kits' code.

| # | Bug | Severity | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|---|---|
| B1 | An edit with `null` for a date stores 1970 | high | no | **yes** | no |
| B2 | A partial edit undoes a concurrent edit | medium | **yes** | no | no |
| B3 | The confirmation job is lost after the booking is saved | medium | **yes** | **yes** | **reduced**: timeout and a 503; the caller's retry re-queues it |
| B4 | A date without a time zone is read in server-local time | medium | no | **yes** | no |
| B5 | The web form drops the retry key on a 503 | medium | no | **yes** | no |
| B6 | Empty page after deleting the last row | medium | no | **yes** | no |
| B7 | An ordinal date is misread | low | **yes** | **yes** | no |
| B8 | Editing the title drops the seconds | low | **yes** | **yes** | no |
| B9 | The same instant written differently gets 422 | low | **yes** | **yes** | no |
| B10 | Retry keys and finished jobs are never cleaned up | low | **yes** | **yes** | **yes**, by a recorded decision |
| B11 | Only the first 100 rooms load | low | **yes** | **yes** | no |
| B12 | No database constraint against overlap | medium | **yes** | **yes** | no |
| C1 | Network errors between worker and booking service use up the three confirmation attempts; the booking can stay pending for good | medium | **yes** (rated low in its own audit) | **yes** (missed by its own audit) | **yes** |
| C2 | Valid ISO 8601 times the contract accepts (for example without seconds) are refused with 400 | medium | no | no | **yes** |
| C3 | The only real proof of the concurrency guarantees can be skipped silently | medium | has no such proof | has no such proof | **yes** |

Evidence for the CyberRock column is in `reports/cyberrock-variant-evaluation.md` section 11. C1 in the other kits: `openspec-variant/apps/worker/src/confirmation/confirmation.service.ts:13-27` and `speckit-variant/apps/worker/src/confirmation/confirmation.service.ts:16-27` have the same shape as `cyberrock-variant/apps/worker/src/confirmation/confirmation.processor.ts:39-51`: a failed read or report throws, and the queue counts it as an attempt.

The fix from the third change (wrong rooms on page 2) is correct in all three.

**Fix first:**

- OpenSpec: B2, B3.
- Spec Kit: B1, B4, B3, B5.
- CyberRock kit: C2, B3 with C1, C3.
- All three: a recovery path for confirmations that does not depend on the caller (B3, C1).

## 7. Scorecard

1 to 5, 5 is best. These are each reviewer's own scores.

| Area | OpenSpec | Spec Kit | CyberRock kit |
|---|:---:|:---:|:---:|
| Code quality | 4 | 4 | 4 |
| Code smells | 4 | 4 | 4 |
| Structure | 5 | 4 | 4 |
| Duplication | 3 | 4 | 4 |
| Potential bugs | 3 | 3 | 3 |
| Security | 5 | 4 | 4 |
| Rule compliance | 5 | 5 | 4 |
| Tests | 3 | 3 | 4 |
| Maintainability | 4 | 3 | 4 |
| Frontend | 4 | 3 | 4 |
| **Total** | **40** | **37** | **39** |
| Findings (critical / high / medium / low) | 0 / 0 / 5 / 6 | 0 / 1 / 8 / 5 | 0 / 0 / 4 / 14 |

## 8. What the code says about the kits

1. **Code quality still does not separate the kits by much.** All three produced production-shaped code with the same architecture and near-identical complexity. A reader could not tell from one file which kit wrote it.
2. **OpenSpec remains the leanest.** It has the least code and the highest score, and its two serious bugs are well understood.
3. **CyberRock kit: the bug catalogue worked where the bug was in it.** Ten of the twelve known bugs are gone, and the two hard guarantees are in the database. That is the measurable effect of putting the earlier findings into the coding agents.
4. **CyberRock kit: it did not stop new mistakes.** Three of its four medium findings are in areas the catalogue covers: the side effect after commit, strict date parsing taken too far, and tests of the guarantee that can skip. A rule prevents the bug it describes, not the neighbouring one.
5. **CyberRock kit: the extra tests are a cost as well as a gain.** It wrote 62% more test code than OpenSpec (3,585 lines against 2,211). The real-database tests are what the original audit asked for. About 400 lines of call-checking tests next to them are not.
6. **One weakness is shared by all three (C1, with B3):** a confirmation can be lost for good. That points to the brief and the model, not to any kit.

## 9. Limitations

- One run per kit, one model, one operator. Kit effects cannot be separated from run-to-run variance.
- The review is AI-based, with a different reviewer for each kit. The CyberRock reviewer's brief asked explicitly for strictness, which may explain part of its 14 low findings.
- The CyberRock kit's low findings were not looked for in the other two kits; only its medium ones were (C1 to C3).
- Concurrency was executed for the CyberRock kit only, through its own real-database tests. For the other two it was traced by reading.
- The CyberRock kit was built knowing the original audit's findings. Avoiding them is its purpose; it does not show the same result on code nobody has audited yet.
- The codebase is small (about 1,600 to 1,700 kit-written source lines per kit), so percentages move with a few files.

## 10. Per-kit audits

The three reviewers' reports, unedited:

- OpenSpec: `plans/reports/openspec-variant-code-audit.md` (11 findings: 0 high, 5 medium, 6 low)
- Spec Kit: `plans/reports/speckit-variant-code-audit.md` (14 findings: 1 high, 8 medium, 5 low)
- CyberRock kit: `plans/reports/cyberrock-variant-code-audit.md` (18 findings: 0 high, 4 medium, 14 low)
