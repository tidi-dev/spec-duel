# OpenSpec vs Spec Kit: code audit of what each kit wrote

Date: 2026-11-11. Scope: `apps/` and `libs/` of `openspec-variant/` and `speckit-variant/`, kit-written code only (`baseline-v1..HEAD`). Companion to `reports/openspec-vs-spec-kit-comparison.md`, which covers process cost, time and documents.

## 1. Summary

Both kits wrote correct, rule-compliant, well-tested code. Neither has a critical finding, both pass build, lint and all unit tests, and both pass the hidden acceptance suite (41/41). The code is close in quality: the same architecture, near-identical metrics, and about half the findings are shared by both.

Where they differ:

- **OpenSpec** wrote 18% less code (+4,158 lines against +5,047) for the same behaviour. It has no high finding, the simpler persistence code (TypeORM API, one `dataSource.transaction`), and the better web edge cases. Its worst bug: a partial `PATCH` can silently undo a concurrent change (medium).
- **Spec Kit** has the more careful concurrency on update (it merges inside the room lock), an enqueue timeout, shared form validation and more tests. It also has the only high finding (`PATCH {"startsAt": null}` moves a booking to 1970), two client-side bugs OpenSpec avoided, and raw SQL with a hand-kept column list.

**Verdict on code:** OpenSpec is slightly ahead (11 findings, 0 high, against 14 findings, 1 high), but the gap is small. It is within what one run of the same model can vary. The code evidence does not overturn the process result, and it supports the existing recommendation: **pilot OpenSpec**.

## 2. Method

| Step | What was done |
|---|---|
| Skills | `lean-audit` (adapted from Ponytail `ponytail-audit`, MIT, commit `96608e0`), with RULES.md R1–R11 and the TypeScript/architecture rules. The new `lean-*` skills are in `.claude/skills/`; their source and local edits are in `.claude/skills/THIRD-PARTY-SKILLS.md`. |
| Scope split | Each variant was diffed against its own `baseline-v1` tag. The kit-written diff was reviewed in depth; baseline code was read only where the new code calls it. Both variants were clean (`git status` empty) before and after. |
| `libs/contract` | Identical in both variants (`diff -r`: no output). Both kits added the same one line, `BOOKING_OVERLAP`, to `error-code.enum.ts`, as the change-2 brief asked. Not scored. |
| Metrics | Collected first, by the main session, with the same scripts for both variants, so both auditors started from the same facts. Only tools already installed were used (Nx, Jest, ESLint core rules, git); the clone finder is a small local script, so nothing was installed. |
| Audit | Two subagents ran **in parallel**, one per variant, with the identical brief and rubric. Each was barred from opening the other variant or its report. They were read-only and wrote `plans/reports/openspec-variant-code-audit.md` and `plans/reports/speckit-variant-code-audit.md`. |
| Verification | The main session re-read the code for every high finding and the top medium findings. It then checked every kit-specific bug against the *other* kit's code, so a bug one auditor missed is not counted as an advantage. The results are in section 6. |

Why parallel and not sequential: the two audits are independent and read-only, so running them at once halves the wall-clock time. Separate contexts also keep one kit's code from shaping the review of the other. A single sequential synthesis step then calibrates both reports against each other.

## 3. Metrics

Kit-written code only, unless marked *whole scope*.

| Metric | OpenSpec | Spec Kit |
|---|---:|---:|
| Diff, `apps` + `libs` | 89 files, +4,158 / −19 | 91 files, +5,047 / −18 |
| Source files / code lines (non-blank, non-comment) | 52 / 1,641 | 52 / 1,713 |
| Spec files / spec lines | 34 / 2,211 | 39 / 2,894 |
| Spec-to-source ratio | 1.35 | 1.69 |
| Test cases in kit-written specs | 172 | 182 |
| Unit tests run, *whole scope* (all pass) | 309 | 321 |
| Unit-test line / branch coverage, *whole scope* | 99.2% / 93.3% | 99.1% / 93.7% |
| Build / lint / test | pass / pass / pass | pass / pass / pass |
| Build / lint / test time, no cache (s) | 27 / 7 / 43 | 24 / 7 / 43 |
| Files over 200 lines | 0 | 0 |
| Cyclomatic complexity: average / max | 1.73 / 14 (`bookings-page.tsx:20`) | 1.79 / 10 (`booking.repository.ts:77`, `bookings-page.tsx:17`) |
| Functions with complexity > 5 | 2 | 4 |
| Functions over 50 lines (all are React components with JSX) | 4 | 4 |
| Functions with ≥ 4 parameters | 2 | 3 |
| Duplicated source lines (≥ 6 normalised lines) | 7.9% (92 / 1,166) | 8.3% (101 / 1,223) |
| Raw `.query(` calls / all parameterised | 7 / yes | 11 / yes |
| Transactions | 2, `dataSource.transaction`, in repositories | 2, hand-rolled `queryRunner`, in repositories |
| `interface` / `any` / wildcard imports / `eslint-disable` / `@ts-ignore` | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| Baseline files modified | 12 (same 12 files in both) | 12 |

Notes: Coverage counts only the files the tests load, Jest's default, so 99% overstates real coverage of untested files. Timings are single runs on one laptop; the differences are noise. Runtime and load benchmarking were out of scope.

### Line vs branch coverage, with a real example

Line coverage asks whether each line ran. Branch coverage asks whether each possible path through every decision was taken. A line can run while one of its paths never does. This line is from OpenSpec's update code (`apps/booking/src/booking/booking.service.ts:70`):

```ts
const startsAt = BookingTimeUtil.toDate(changes.startsAt ?? stored.startsAt);
```

The `??` gives this one line two paths:

1. The request sends `startsAt`, so the code uses `changes.startsAt`.
2. The request leaves it out, so the code falls back to `stored.startsAt`.

| If every test sends `startsAt` | Result | Why |
|---|---:|---|
| Line coverage | 100% | The line ran. |
| Branch coverage | 50% | The fallback path never ran. |

The untested path is exactly where bugs like this hide. It decides what a partial `PATCH` does, and Spec Kit's `null` bug (B1) sits in the same kind of path. That is why branch coverage is always the lower figure (about 93% against 99% here) and the better guide to how many edge cases the tests exercise. Both share one limit: they show code ran, not that a test checked the result.

## 4. Findings by criterion

Paths are relative to each variant. "OS" = OpenSpec, "SK" = Spec Kit. Finding numbers refer to each kit's audit file.

### 4.1 Code quality

- **Both:** clear names, typed outcome enums from repositories, baseline helpers reused (`ExceptionHelper`, `NatsRequestUtil`). Both moved `isErrorResponse` into `libs/backend-common` instead of copying it (`libs/backend-common/src/lib/errors/error-response.guard.ts`).
- **OS:** the service maps every repository outcome in one exhaustive `switch` (`apps/booking/src/booking/booking.service.ts:74-81`, `:97-110`).
- **SK:** creation has its own `CreateBookingService`. The repository maps raw SQL rows by hand (`apps/booking/src/booking/booking.repository.ts:17-37`), and `null` input is not handled (SK F1).

### 4.2 Code smells

- **Both:** short functions, no narrative comments, named constants. Both carry the same dead `response_status` column (OS #10, SK F12).
- **SK only:** the update SQL repeats the end-after-start check that the code and the table `CHECK` already enforce (`booking.repository.ts:36`, SK F8). `CONFIRMATION_ENQUEUE_TIMEOUT_MS` is exported but used in one file.

### 4.3 Structure

- **Both:** controller → service → repository is respected, transactions sit in repositories (R1, architecture rules), and the gateway stays thin.
- **OS:** the overlap check is one helper used by create and update. The service validates the time order for both paths (`booking.service.ts:39`, `:72`).
- **SK:** create and update apply the rules in different layers. On create, the time range is checked in the service; on update, in the repository, after the merge (SK F9). A new rule such as "at most 8 hours" has to be added in two places.

### 4.4 Duplication

- **Both:** the Title/Start/End fields are copied between `booking-create-form.tsx` and `booking-edit-dialog.tsx`, and these copies make up most of each kit's ~8% duplication.
- **OS** also copies the validation rules inline in both forms (OS #5).
- **SK** shares its rules in one yup schema (`apps/web/src/views/bookings/booking-form.schema.ts`), so only the markup is copied. SK copies its 13-line `queryRunner` transaction boilerplate twice (SK F10), where TypeORM's `dataSource.transaction` would do.
- **Not a problem:** OS's backend fixture against the web test data. They live in different apps with different test runners.

### 4.5 Potential bugs

The full list is in section 6. In short: OS has 0 high and 3 medium bugs; SK has 1 high and 4 medium. The lost confirmation job is the one medium bug both share.

### 4.6 Security

- **Both:** DTOs validated with a whitelist, UUID-checked ids and keys, bound parameters in every raw query, no `LIKE`/`ILIKE` (R11 not triggered), no hardcoded config (R4).
- **SK:** two input-validation gaps let bad values through: `null` dates (F1), and dates without a time-zone offset, which are read in server-local time (F2).
- **OS:** treats a date without an offset as UTC (`apps/booking/src/booking/booking-time.util.ts:4-11`), so the stored instant does not depend on the container's time zone.

### 4.7 Rule compliance

- No violation of RULES.md R1–R11 or the TypeScript/architecture rules in either kit: no `interface`, no `any`, named DTOs, explicit repository return types, no transaction in a service, every file under 200 lines, kebab-case names.
- Both auditors and the automated scan agree.

### 4.8 Tests

- **Both:** broad suites, and the gateway specs boot the real HTTP app with the production pipes and filter. In both, the repository specs check SQL strings and mock call order. **No test runs the overlap race or the advisory locks against Postgres** (OS #3, SK F6), which is the main guarantee of change 2.
- **OS:** one spec asserts that a failed enqueue is swallowed (`confirmation-queue.producer.spec.ts:36`), which locks a bug in.
- **SK:** 31% more spec lines. Its change-3 regression test walks every page and the page after the last one (`apps/room/src/room/room.repository.spec.ts:65-91`).

### 4.9 Maintainability and extensibility

| Task | OpenSpec | Spec Kit |
|---|---|---|
| Add a booking rule | One place: service + shared overlap helper | Two paths: create service and update repository (F9) |
| Add a booking field | Entity, migration, DTO, mapper, fingerprint, two forms | The same, plus the raw `RETURNING` column list (F8) |
| Add a page | One view folder + route | One view folder + route |
| Persistence code to understand | TypeORM API | Raw SQL, `COALESCE`, `RETURNING` and a hand-rolled transaction |

OpenSpec is easier to extend. Spec Kit's raw SQL is correct, but it is a second, untested copy of the entity mapping.

### 4.10 Frontend (`apps/web`)

- **Both:** small components, loading, error and empty states, a guard against late responses, labelled controls. Both load only the first 100 rooms, and both drop the seconds when a booking is edited.
- **OS:**
  - The create form keeps its idempotency key until the user edits the form, so a retry after a timeout replays safely (`booking-create-form.tsx:29-53`).
  - The page steps back after the last row on a page is deleted (`bookings-page.tsx:77`).
  - Times are entered in UTC, with labels saying so.
  - Its page component is the most complex function in either kit (complexity 14).
- **SK:**
  - Drops the key on any HTTP error, so a retry after a 503 looks like a double-booking (F4).
  - Deleting the last row on the last page strands the user on an empty page with no pager (F5).
  - Times are entered in the user's local time, which is friendlier.

## 5. Strengths and weaknesses

### OpenSpec

| Strengths | Weaknesses |
|---|---|
| Least code for the same behaviour (−18% lines, −24% spec lines) | Partial `PATCH` reads the row outside the transaction, so it can undo a concurrent change (#1) |
| Idiomatic TypeORM: `dataSource.transaction`, no hand-mapped SQL | A failed enqueue is swallowed, has no timeout, and a spec locks the behaviour in (#2) |
| One home for each booking rule | Create and edit forms copy fields *and* validation rules (#5) |
| Deterministic time handling: a date without an offset is read as UTC | The bookings page component has complexity 14 |
| Client keeps the idempotency key across a retry; pager recovers after a delete | Locks tested only against mocks; no DB exclusion constraint |
| No high finding; lowest finding count (11) | |

### Spec Kit

| Strengths | Weaknesses |
|---|---|
| Update merges inside the room lock with `COALESCE`, so no lost update | `PATCH {"startsAt": null}` stores 1970-01-01 (F1, high) |
| Careful idempotency claim: two try-locks tell "in progress" (409) from "reused" (422) | A date without an offset is read in server-local time (F2) |
| Enqueue has a 2 s timeout, so a Redis outage cannot hang a create | Client drops the idempotency key on 503 (F4); empty-page trap after a delete (F5) |
| Form validation shared in one yup schema; local-time inputs | Raw SQL with a hand-kept `RETURNING` column list (F8); duplicated `queryRunner` boilerplate (F10) |
| More tests (+10 unit tests, +31% spec lines); thorough paging regression test | Rules split across layers between create and update (F9) |
| | 21% more lines written for the same behaviour |

## 6. Potential bugs

"Other kit" was checked by the main session in the other variant's code, so each bug is counted once per kit that really has it.

| # | Bug | Severity | OpenSpec | Spec Kit | Evidence |
|---|---|---|---|---|---|
| B1 | `PATCH {"startsAt": null}` passes `@IsOptional`; `new Date(null)` stores 1970-01-01, which blocks the room or returns a wrong 409 | high | **no**: `changes.startsAt ?? stored.startsAt` falls back (`booking.service.ts:70-71`) | **yes** | SK `booking.service.ts:21-22,43`, `booking.repository.ts:39,91-94`; `libs/contract/src/lib/dto/update-booking.dto.ts:10-16` |
| B2 | Title-only `PATCH` racing a time-only `PATCH` writes back the old times; the move is lost with no error | medium | **yes** | **no**: merge happens after `lockRoom` and SQL uses `COALESCE` (`booking.repository.ts:86-94`, `:30-33`) | OS `booking.service.ts:67-73`, `booking.repository.ts:60-75` |
| B3 | Confirmation job lost if Redis fails or the process dies after commit; booking stays `PENDING`; a replay never re-enqueues | medium | **yes** (no timeout) | **yes** (2 s timeout) | OS `confirmation-queue.producer.ts:18-31`; SK `create-booking.service.ts:31-35`, `confirmation-queue.producer.ts:23-38` |
| B4 | A date-time without an offset (`2030-01-07T09:00`) is stored in the container's local time | medium | **no**: read as UTC (`booking-time.util.ts:4-11`) | **yes** | SK `booking-time-range.util.ts:1-4` |
| B5 | Create form drops the idempotency key on a 503 or 409 in-progress; the retry reports the user's own booking as a double-booking | medium | **no**: key kept until the form is edited (`booking-create-form.tsx:29-53`) | **yes** | SK `booking-create-form.tsx:38-43` |
| B6 | Deleting the last row on the last page shows "No bookings found." with no pager | medium | **no**: steps back a page (`bookings-page.tsx:77`) | **yes** | SK `bookings-page.tsx:60-73`, `use-bookings.ts:30` |
| B7 | Ordinal ISO date `2030-007` (7 Jan) passes validation and is parsed as ~1 July | low | **yes** | **yes** | Checked with node: `new Date('2030-007')` → `2030-06-30T17:00Z` here. The shared contract's `@IsISO8601({strict:true})` accepts it |
| B8 | Editing only the title drops the seconds from both times | low | **yes** | **yes** | OS `booking-time-format.ts:3`; SK `booking-date.util.ts:5-9` |
| B9 | Retrying with the same instant written differently (`…00Z` vs `…00.000Z`) gets 422 instead of a replay | low | **yes** | **yes** | `booking-fingerprint.util.ts` in both |
| B10 | Idempotency rows and finished BullMQ jobs are never cleaned up | low | **yes** | **yes** | OS #9, SK F13 |
| B11 | Only the first 100 rooms load on the bookings page | low | **yes** | **yes** | OS `bookings-page.tsx:35`; SK `bookings-page.tsx:26` |
| B12 | No DB exclusion constraint; overlap holds only while every write path takes the lock | medium (design) | **yes** | **yes** | the bookings migration in both |

The change-3 pagination fix is correct in both (`skip = (page-1)*limit`, `apps/room/src/room/room.repository.ts:19`): it works for the last page and past the end, and the limit is capped at 100.

**Fix first:**
- OpenSpec: B2, B3.
- Spec Kit: B1, B4, B3, B5.
- Both: one integration spec against the docker-compose Postgres for the overlap race, plus the `EXCLUDE USING gist` constraint (B12).

## 7. Scorecard

1–5, 5 = best. These are each auditor's own scores. The cross-check in section 6 found them consistent with the code, so none was changed.

| Area | OpenSpec | Spec Kit | Edge |
|---|:---:|:---:|---|
| Code quality | 4 | 4 | = |
| Code smells | 4 | 4 | = |
| Structure | 5 | 4 | OpenSpec: one home for each rule |
| Duplication | 3 | 4 | Spec Kit: shared yup schema |
| Potential bugs | 3 | 3 | OpenSpec slightly: no high, fewer bugs (B2–B3 against B1, B3–B6) |
| Security | 5 | 4 | OpenSpec: no input-validation gap |
| Rule compliance | 5 | 5 | = |
| Tests | 3 | 3 | = (Spec Kit has more; both mock the locks) |
| Maintainability / extensibility | 4 | 3 | OpenSpec: ORM API, single rule path |
| Frontend | 4 | 3 | OpenSpec: no key-release or empty-page bug |
| **Total** | **40** | **37** | |
| Findings (critical / high / medium / low) | 0 / 0 / 5 / 6 | 0 / 1 / 8 / 5 | |
| Lean (lines that could be removed) | ~35 | ~65 | |

## 8. Recommendation

**Adopt OpenSpec, as the pilot the process report already recommends.**

1. **Code quality does not separate the kits much.** Both produced production-shaped code that follows the same rules and the same architecture, with near-identical metrics. Most findings are shared (B3, B7–B12). That points to the model and the brief, not the kit. The kit-specific bugs (B1, B2, B4–B6) are the kind of variance one more run could reverse.
2. **Where the code does differ, OpenSpec is ahead.** It has no high finding, simpler persistence, one home for each rule, and better client edge cases. And it got there with 18% less code to read and maintain. Spec Kit's real advantages (lock-safe update merge, enqueue timeout, shared form schema) are worth copying as review checklist items, not worth choosing the kit for.
3. **This agrees with the process findings.** The process report found the same correctness from both kits (41/41 hidden tests, three changes each). OpenSpec got there in about two thirds of the time and cost (48 min 41 s and $36.13, against 1 h 12 min 52 s and $55.53), with 2,034 lines of kit documents against 3,770. The code audit shows that the cheaper process did not buy worse code. If anything it produced leaner code. There is no conflict.
4. **The pilot should add what neither kit caught.** Neither kit wrote a real-database concurrency test or a DB-level overlap constraint, and both shipped the lost-confirmation bug (B3). Add an integration spec against Postgres to the definition of done, and use `lean-review` or the code-reviewer agent on each change, whichever kit is used.

## 9. Limitations

- One run per kit, one model, one operator: kit effects cannot be separated from run-to-run variance.
- The review is AI-based. Two auditors scored one variant each, and calibration relies on the main session's cross-check (section 6). The cross-check covered every kit-specific bug and the high and top medium findings; not every low finding was re-verified.
- Concurrency and lock behaviour were traced by reading, not executed: no Postgres, Redis or NATS was running. BullMQ and ioredis behaviour under a Redis outage was not confirmed.
- The codebase is small (≈1.7k kit-written source lines per variant), so percentages swing on a few files.
- The duplication and complexity figures come from a local clone script and ESLint core rules, not from a dedicated tool such as jscpd or SonarQube.
- Code was judged against the shared brief, not against each kit's own spec documents (`openspec/`, `specs/`).
- The API contract was fixed in the baseline, so API design quality was not compared.

## 10. Per-kit audits

The two reviewers' reports, unedited. Each reviewer saw only its own kit; paths inside are relative to that kit's folder, and finding numbers are each reviewer's own (section 6 shows which bugs turned out to be shared).

- OpenSpec: [`plans/reports/openspec-variant-code-audit.md`](../plans/reports/openspec-variant-code-audit.md) (11 findings: 0 high, 5 medium, 6 low)
- Spec Kit: [`plans/reports/speckit-variant-code-audit.md`](../plans/reports/speckit-variant-code-audit.md) (14 findings: 1 high, 8 medium, 5 low)

Both are also reproduced at the end of the published page: https://claude.ai/artifact/J69PYSozk2S47BbKJwgtzN
