## Specification Analysis Report

**Feature**: `specs/002-prevent-booking-overlap` (read-only analysis, no file changed).

There are no constitution violations and no uncovered requirements. One HIGH finding needs your decision before `/speckit-implement`: the port variables for the runtime proof exist only in `.env`, so the implementer cannot run it. The rest are three MEDIUM and five LOW.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| U1 | Underspecification | HIGH | tasks.md:L119-123, L156-157; L87, L109; quickstart.md:L41 | Every run against the stack needs `GATEWAY_PORT` / `WEB_PORT`, which exist only in `.env` (written by `scripts/make-local-env.sh`), and that file may not be read. T019–T021 then end as "not run", which leaves SC-003, FR-012 to FR-014 and FR-023 without evidence. T029 and the Phase 3 and 4 checkpoints need the same port but have no fallback. Scenarios 1–4 are not a task until T029 ("once more"). | Export both ports in the shell before implementing, or have the tasks take them from the `Stack is up: gateway on …, web on …` line that `scripts/stack-up.sh` prints. Add the same guard to T029, and make the Phase 3/4 checkpoint runs explicit tasks. |
| G1 | Coverage gap | MEDIUM | spec.md:L135 (FR-013), L104; quickstart.md:L154-159; tasks.md:L123 | FR-013 covers an update racing "with a create or with another update". Scenario 6 and T021 prove only update against create. Update against update is pinned only by the mocked statement order in T013(h). | Add a variation to scenario 6 and T021: two `PATCH`es that would overlap each other (A's end to 11:30, B's start to 11:00) → exactly one 200, one 409. |
| G2 | Coverage gap | MEDIUM | spec.md:L67 (US3-2), L134 (FR-012), L175 (SC-004); tasks.md:L121 | In the race, "the loser leaves no stored idempotent response" is never checked at runtime. T019 counts bookings and confirmation states only, and the `book` helper discards the keys. The "no job for a booking that does not exist" check in `tmp/logs/worker.log` also has no stated method. | Add to T019: after the loop, the number of rows in `idempotency_keys` is 100, and the completed-job count from quickstart L142-144 is 100. |
| I1 | Inconsistency | MEDIUM | tasks.md:L28, L154, L273; quickstart.md:L28-29 | The T027 scope check uses `git status --porcelain` and `git diff --stat` on the working tree, while tasks.md leaves commits to the owner. Once the contract line is staged or committed, the diff prints nothing and the status check passes without checking anything. The check is also narrower than the rule at L28: `apps/gateway`, `apps/worker`, the rest of `libs/backend-common`, `apps/web/src/pages`, `apps/web/src/services` and `package.json` (the constitution's no-dependency rule) are not verified. | Compare against the base commit (`git diff --stat 332be46 -- …`) and extend the path list to the full untouched set, including `package.json`. |
| I2 | Inconsistency | LOW | plan.md:L45, L99-100, L116-119; tasks.md:L35 | The plan says the existing specs are edited in place ("3 edited specs in `apps/web`"). The tasks create four new sibling spec files instead. The reason is sound (the existing specs are 180–185 lines), but the plan's file list is now out of date. | Update the plan's source tree and scope line to name the four new spec files. |
| U2 | Underspecification | LOW | tasks.md:L79 (T009), L101 (T015), L35 | T009 adds two cases with three request flows to `create-booking.service.spec.ts` (176 lines). T015 replaces three cases with four in `booking.service.spec.ts` (175 lines). Both will probably pass 200 lines, and the fallback is only in assumption 1. | Name the sibling file in T009 and T015, or repeat the fallback in the task text. |
| I3 | Inconsistency | LOW | tasks.md:L18, L61-63, L84-85, L106-107 | `[P]` is defined as "no dependency on an incomplete task", yet T004–T006, T011, T012, T017 and T018 carry `[P]` and each depends on an earlier task of the same phase. The Dependencies section (L166, L191-193) gives the real order. | Drop `[P]` from T004, or reword the definition to "parallel with its siblings once the stated dependency is done". |
| A1 | Ambiguity | LOW | spec.md:L129 (FR-010), L185, L193; plan.md:L157-158 | FR-010 says a title-only update "MUST succeed" without condition. The plan runs the overlap check on it, so on data that already overlaps it answers 409. Only the assumptions limit this to "data that respects the rule". | Add "on data that respects the rule" to FR-010, or skip the check when no time is sent. The first is the smaller change. |
| I4 | Inconsistency | LOW | spec.md:L84, L146, L191; contracts/bookings-page.md:L23-29; tasks.md:L131, L138 | Terminology drift: the spec says "edit form" and "next to the form"; the plan, contract and tasks say "edit dialog" and "inside the form". The spec's assumption allows "inside", so behaviour is unaffected. | Use "edit dialog" and "inside the form" in the spec, or leave as is. |

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 to FR-004 (overlap rule) | Yes | T003, T005, T029 | |
| FR-005 (create → 409) | Yes | T007, T009, T011, T012 | |
| FR-006 (nothing stored, no job) | Yes | T007, T009, T011, T012 | |
| FR-007 (key stays usable) | Yes | T007, T009 | |
| FR-008 (create check order) | Yes | T007, T012, T029 | End to end only in T029 (U1) |
| FR-009 (update → 409, resulting span) | Yes | T013, T015, T017, T018 | |
| FR-010 (no self-conflict) | Yes | T003, T013, T017 | A1 |
| FR-011 (update check order) | Yes | T013, T015, T017, T018 | |
| FR-012 (simultaneous creates) | Yes | T007, T011, T019 | Loser's key unchecked at runtime (G2) |
| FR-013 (update races) | Partial | T013, T017, T021 | Update against update unproven (G1) |
| FR-014 (no false rejection) | Yes | T020 | |
| FR-015 (one contract change) | Yes | T002, T027 | I1 |
| FR-016 (message) | Yes | T004, T006 | |
| FR-017 (create form) | Yes | T022, T024, T030 | |
| FR-018 (edit form) | Yes | T023, T024, T030 | |
| FR-019 (message clears) | Yes | T022, T024 | |
| FR-020 (unchanged behaviour) | Yes | T026, T029 | |
| FR-021 (room untouched) | Yes | T027 | I1 |
| FR-022 (no migration) | Yes | T027 | I1 |
| FR-023 (end to end) | Yes | T019–T021, T029 | Depends on U1 |
| FR-024 (unit tests) | Yes | T003, T004, T007, T009, T013, T015 | |
| FR-025 (build, lint, test) | Yes | T001, T026 | |
| SC-001, SC-002 | Yes | T019, T021, T029 | |
| SC-003 (100 rounds) | Yes | T019 | Depends on U1 |
| SC-004 (nothing left by a rejection) | Partial | T007, T009, T019 | G2 |
| SC-005 (page) | Yes | T022–T025, T030 | |
| SC-006 (nothing else changed) | Yes | T029 | |
| SC-007 (gates and scope) | Yes | T026, T027 | I1 |

**Constitution Alignment Issues:** None.

- **Principle V (Test-First):** the User Story 4 specs are expected to pass on first run because there is no implementation to follow. The plan states this in writing (plan.md:L74-77), which the Governance section accepts.
- **Principle II (Layered Architecture):** `booking-overlap.query.ts` holds SQL outside a repository class, but only the two repositories call it, inside their own transactions.

**Unmapped Tasks:** None needing action. T001 (baseline run) and T028 (constitution check) map to the Quality Gates and the principles, not to a requirement.

**Metrics:**

- Total Requirements: 32 (25 FR + 7 SC)
- Total Tasks: 30
- Coverage % (requirements with >=1 task): 100% (32 of 32; 2 partial: FR-013, SC-004)
- Ambiguity Count: 1
- Duplication Count: 0
- Critical Issues Count: 0

## Next Actions

- No CRITICAL issue. `/speckit-implement` can start once U1 is settled; otherwise the tasks for User Story 3 and T029 will be reported as "not run".
- G1, G2 and I1 are small manual edits to `tasks.md` and `quickstart.md`. They do not change the design and can be done before implementing, or at the latest before T019.
- I2 to I4, U2 and A1 are optional wording fixes in `plan.md`, `tasks.md` and `spec.md`. No re-run of `/speckit-specify` or `/speckit-plan` is needed.

Would you like me to suggest concrete remediation edits for the top 4 issues (U1, G1, G2, I1)? Nothing will be applied without your approval.