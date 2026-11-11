Analysis is done; it was read-only and no files were changed. `.specify/extensions.yml` does not exist, so no hooks ran.

## Specification Analysis Report

Feature: `specs/001-room-bookings` — checked `spec.md`, `plan.md`, `tasks.md` against constitution v1.0.0, with `research.md`, `data-model.md`, `contracts/`, `quickstart.md` and the existing source as supporting evidence.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | HIGH | spec.md:L108; research.md R10 (L177-185); tasks.md T032 (L102) | The `PATCH` rule "unknown field answers 400" is unlikely to work as designed. The gateway's global `ValidationPipe({ whitelist: true })` runs before any handler or parameter pipe (`router-execution-context.js:148`, `pipes.concat(paramPipes)`), so `roomId`/`organizerEmail` are stripped before the `forbidNonWhitelisted` pipe sees them and the answer is 200. No unit test would catch it: T021 mocks NATS and runs no pipes. | Change the design in research R10 and T032 (for example, reject unknown raw body keys before the pipes). Add a spec that runs the real pipe chain through `configureGatewayApp`. |
| I2 | Inconsistency | HIGH | plan.md:L30; research.md R14 (L219-220); tasks.md T081, T082 | The plan calls `@hookform/resolvers` usable as installed, but 5.4.0 declares the peer `react-hook-form ^7.55.0` and the repo has 7.51.1. Nothing in the repo uses the pair yet, `package.json` is listed as "not touched", and the constitution forbids adding dependencies. | Add an early task that proves `yupResolver` builds and runs with 7.51.1. If it does not, either write a small local resolver over yup or ask the owner to approve a version bump. |
| I3 | Inconsistency | HIGH | data-model.md:L85; tasks.md T005 (L59); quickstart.md:L105; spec.md FR-014, SC-003 | `response_body` is `jsonb`, which does not keep object key order. A replay is the same JSON value but not "the same body byte for byte" as quickstart scenario 4 requires, so T090 fails as written. | Store the body as `json` or `text`, or change the check to compare parsed JSON (`jq -S`). State which meaning of "unchanged" FR-014 intends. |
| G1 | Coverage gap | MEDIUM | plan.md assumption 11 (L211-213); tasks.md T036, T090; quickstart.md:L116-126 | The two advisory locks are tested only against a mocked `DataSource`. Scenario 6 accepts "201 or 409", so a 409 (FR-016) may never be observed, and the edge case "different body while in progress answers 422" has no end-to-end check. | Add a deterministic quickstart step: hold the same advisory lock in an open `psql` transaction, then send the request and expect 409, and 422 for a different body. |
| I4 | Inconsistency | MEDIUM | quickstart.md:L28-29; tasks.md T088 (L215), L340 | The scope check runs `git diff --stat main`, but the work is on `main` and tasks are committed there. After a commit the diff is empty, so it cannot prove FR-033 or SC-007. | Record the starting commit in T001 (currently `3d22c28`) and diff against it. |
| I5 | Inconsistency | MEDIUM | spec.md:L181; plan.md assumption 2 (L200); data-model.md:L90-92 | The spec's idempotency record holds "whether that request is still in progress or completed". The plan stores no such state; "in progress" is an open transaction. | Reword the Key Entities entry so it does not imply a stored status. |
| A1 | Ambiguity | MEDIUM | spec.md:L116; research.md R6 (L128-129); quickstart.md:L147-151; tasks.md T090 | The Redis-down behaviour is an open point ("to verify during implementation"), yet scenario 9 expects the booking to stay `PENDING` with 0 attempts. If the queue client buffers the `add` while offline, the job runs once Redis is back and the booking ends `SENT`. | Settle the expected result before implementing: either accept both outcomes in scenario 9 or make the timed-out `add` not deliver later. |
| C1 | Constitution | MEDIUM | constitution IV; tasks.md T018, T037, T043, T069, T072, T089 | The 200-line limit applies to spec files too. `create-booking.service.spec.ts` grows over three stories, and the form and page specs carry many cases. The only check is T089 at the end, and its path list omits the three edited `app.module.ts` files. | Plan the spec-file split now (for example one spec per story concern), and widen T089 to every edited path. |
| U1 | Underspecification | MEDIUM | contracts/service-messages.md:L55-64; tasks.md T049, T059 | No row covers the report itself failing after the sender succeeded. An ordinary address would then end `SENT` with 2 attempts, and a `@retry.example` booking can stay `PENDING` after its last attempt. | Add the row and a T049 case; state the accepted outcome. |
| A2 | Ambiguity | LOW | spec.md:L204; research.md R5 (L105-107), R11 (L193-195) | "Same body" means identical strings, so `…00Z` and `…00.000Z` answer 422. A time without an offset is read in the service's time zone, although FR-001 says UTC. | Note both in the spec's Assumptions so the behaviour is intended, not incidental. |
| U2 | Underspecification | LOW | contracts/bookings-page.md:L33-40; tasks.md T072, T084 | Nothing says what the page shows when `listRooms` fails (filter, create form, room column). | Add one state row and one test case. |
| U3 | Underspecification | LOW | tasks.md T036 (L119), T040 | The lock statements are written with the key and fingerprint inside the SQL text. | Say they are bound parameters. |
| I6 | Inconsistency | LOW | plan.md:L44, L95; tasks.md assumption 1 (L35) | The plan says every source file has a spec and estimates about 45 new files. The tasks exempt modules, entities, migrations, the DTO and the page index, and add up to roughly 67 files. | Align the plan's wording and estimate with the tasks. |
| I7 | Inconsistency | LOW | tasks.md T009 (L63), T008, L249 | T009 is marked parallel but needs `BookingEntity`, which is created in T004 and exported in T008. | Remove `[P]` or note the dependency. |
| I8 | Inconsistency | LOW | spec.md:L183; contracts/service-messages.md; tasks.md | The same thing is called confirmation "outcome", "result" and "report"; "idempotency record" is also "idempotency row" and `IdempotencyKeyEntity`. | Pick one term per concept in the prose. |
| D1 | Duplication | LOW | spec.md:L105-118 vs L197-217; FR-014 vs FR-020/021; FR-033/035 vs SC-007 | Several rules are stated twice (queue failure, empty update, mismatch before in-progress, replay snapshot, one job per booking, scope and gates). | Keep one statement and reference it from the other. |
| G2 | Coverage gap | LOW | spec.md SC-006 (L194) | "Create a booking in under 1 minute" has no check; T091 does not time it. | Drop the time or add it to scenario 10. |

I could not run the chained-pipe check for I1 (the command needed approval), so that finding rests on the Nest source order and class-validator's whitelist behaviour, not on an executed test.

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 booking shape, UTC times | Yes | T004, T009, T010 | |
| FR-002 create 201, `PENDING`/0 | Yes | T015, T018, T025, T028, T032 | |
| FR-003 list, paging, room filter | Yes | T014, T017, T024, T027 | |
| FR-004 read / 404 | Yes | T017, T027, T029 | |
| FR-005 update three fields only | Yes | T014, T017, T024, T027, T032 | Unknown-field 400 at risk (I1) |
| FR-006 delete 204 / 404 | Yes | T014, T017, T021, T024, T032 | |
| FR-007 error shape | Yes | T002, T003, T016, T026 | |
| FR-008 invalid body 400 | Yes | T011, T012, T032 | Field rules come from the contract DTOs |
| FR-009 end later than start | Yes | T011, T014, T017, T018, T024 | |
| FR-010 room must exist | Yes | T016, T018, T026, T028 | |
| FR-011 ownership, thin gateway | Yes | T029, T030, T032, T033 | |
| FR-012 key header required | Yes | T034, T035, T038, T039 | |
| FR-013 key + booking in one transaction | Yes | T015, T025 | |
| FR-014 replay unchanged, header | Yes | T020, T031, T036, T037, T041 | "Unchanged" at risk (I3) |
| FR-015 different body 422 | Yes | T036, T037, T040, T041 | |
| FR-016 in progress 409 | Yes | T036, T037, T040, T041 | Mock-only (G1) |
| FR-017 never two bookings | Yes | T036, T040, T090 | Manual proof only (G1) |
| FR-018 failed validation keeps key usable | Yes | T037, T041 | |
| FR-019 keys never expire | Yes | T005, T007 | By absence of expiry |
| FR-020 one job enqueued | Yes | T042, T043, T051, T053 | |
| FR-021 job id | Yes | T042, T051 | |
| FR-022 3 attempts, backoff | Yes | T042, T051 | |
| FR-023 worker processes and reports | Yes | T048–T050, T054–T061 | |
| FR-024 simulated sender rules | Yes | T047, T057 | |
| FR-025 safe to run twice | Yes | T044, T049, T054 | |
| FR-026 page and navigation link | Yes | T073, T085, T086 | |
| FR-027 table | Yes | T067, T079 | |
| FR-028 room filter | Yes | T068, T080 | |
| FR-029 create form | Yes | T064, T069, T076, T081 | Resolver risk (I2) |
| FR-030 key per submission | Yes | T065, T069, T077, T081 | |
| FR-031 edit and delete | Yes | T070, T071, T082, T083 | |
| FR-032 loading, empty, error | Yes | T066, T072, T078, T084 | |
| FR-033 frozen areas, contract only | Yes | T088 | Check ineffective (I4) |
| FR-034 tests | Yes | all spec tasks | |
| FR-035 build, lint, test | Yes | T001, T087 | |
| SC-001 end-to-end answers | Yes | T090 | Manual |
| SC-002 one booking, one job | Yes | T090 | Manual (G1) |
| SC-003 identical replay | Yes | T090 | See I3 |
| SC-004 final state in 10 s | Yes | T090 | Manual |
| SC-005 second run changes nothing | Yes | T044, T049 | |
| SC-006 page usability | Partly | T091 | No timing (G2) |
| SC-007 gates and no frozen changes | Yes | T087, T088 | See I4 |

**Constitution Alignment Issues:** No MUST principle is violated by the artifacts. C1 is a risk to Principle IV that is only checked at the end. Fixing I2 by adding or bumping a package would touch the "Dependencies MUST NOT be added" constraint and needs an owner decision.

**Unmapped Tasks:** None. T001 (baseline) and T089 (constitution check) map to the quality gates, not to a requirement.

**Metrics:**

- Total Requirements: 42 (35 functional, 7 success criteria)
- Total Tasks: 91
- Coverage: 100% of functional requirements have at least one task; 41 of 42 overall are fully covered (SC-006 partly)
- Ambiguity Count: 2
- Duplication Count: 1
- Critical Issues Count: 0

## Next Actions

There are no CRITICAL issues, but resolve the three HIGH findings before `/speckit-implement`; each would otherwise surface late as a failed quickstart step or a broken build.

- **I1**: rerun `/speckit-plan` with a refinement for research R10, then edit T021 and T032 in `tasks.md` to add a test through the real pipe chain.
- **I2**: manually add a Phase 2 task to `tasks.md` that proves the resolver works with the installed `react-hook-form`, with the fallback named.
- **I3**: manually edit `data-model.md`, T005 and quickstart scenario 4 to agree on the column type and on what "unchanged" means.
- The MEDIUM items (G1, I4, I5, A1, C1, U1) are small manual edits to `quickstart.md`, `tasks.md` and the Key Entities section of `spec.md`. The LOW items can wait.

Would you like me to suggest concrete remediation edits for the top 3 issues? I will not apply anything without your approval.