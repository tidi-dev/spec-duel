---

description: "Task list for the rooms list paging fix"
---

# Tasks: Rooms List Shows the Right Rooms on Every Page

**Input**: Design documents from `/specs/003-fix-rooms-pagination/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (gateway-http-api.md, rooms-page.md), quickstart.md

**Tests**: Included. FR-008 and Constitution Principle V (Test-First, non-negotiable) require them: the spec tasks T003 to T005 are done first and their cases MUST fail (T006) before the repository is edited (T007).

**Organization**: Tasks are grouped by user story, in the priority order of spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US3)
- Every task names the exact file it edits, reads or runs

## Path Conventions

Nx monorepo, paths from the repository root. The defect and its spec are in `apps/room/src/room/`; the spec sits next to its source file as `room.repository.spec.ts`.

## Rules that apply to every task

- Exactly two source files change: `apps/room/src/room/room.repository.spec.ts` and `apps/room/src/room/room.repository.ts`. Nothing else under `apps/**` or `libs/**` is edited, nor `package.json`, `docker-compose.yml`, `scripts/**`, `specs/001-*/**` or `specs/002-*/**` (FR-009, research R3). No route, DTO, constant, error code, table, migration or dependency is added or changed.
- No `interface`, no `any`, no inline object type as a parameter, explicit return type on every repository method, named imports only, every file under 200 lines, no narrative comments.
- `.env` files are never read; configuration is referred to by variable name (`GATEWAY_PORT`, `WEB_PORT`). Git stays local: no remote, no push, no pull request. Commit messages use the conventional format and carry no AI reference.
- A failing check is fixed at its cause, never by weakening the expectation.

## Assumptions made in this task list

1. **Two local commits are tasks** (T002, T014). plan.md ("Order of work", assumption 6) and research R5 require the feature folder to be committed before the first source edit so that the analysis predates the fix in the history (SC-003); the order check of quickstart.md needs the fix to be committed as well. Feature 002 listed no commit task; this feature does because a success criterion depends on the history.
2. **The test and the fix go in one commit** (T014), made after the gates and the scope check, because the scope check of quickstart.md reads the two files as uncommitted changes. The proof that the test fails without the fix is the recorded run of T006, not a separate commit.
3. **Phases follow the priority order of spec.md; one dependency crosses it.** The analysis of User Story 2 already exists (`research.md`, written during planning); its "before any code change" half is secured by Phase 2, and its history check (T015) can only run after the commit of T014, so it sits in the last phase.
4. **All new spec cases are written in the User Story 1 phase**, before the fix, because test-first requires it. User Story 3 adds no code: its "fails before" half is T006, and its own phase checks that the cases meet FR-008 and pass with the whole suite.
5. **The walk at 10 per page passes before the fix** (the constant equals the page size there); the other four page sizes fail. T006 states the expected result case by case.
6. **Names the design leaves open.** The mocked `findAndCount` of the walk is typed with `FindManyOptions<RoomEntity>` from `typeorm` (a named type, already a dependency); the existing `roomEntity` helper is reused for the 12 rooms.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the starting point; the project, tooling and dependencies already exist.

- [X] T001 Run `git status --porcelain -- apps libs package.json` (expected: no output — no source file is modified) and `pnpm exec nx test room` (expected: the 4 existing cases of `apps/room/src/room/room.repository.spec.ts` and all other `room` specs pass); stop and report if either differs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Put the root-cause analysis into the history before any code changes (FR-007, SC-003, research R5).

**⚠️ CRITICAL**: No source file may be edited until this phase is complete.

- [X] T002 Commit the feature folder locally: `git add specs/003-fix-rooms-pagination` then `git commit -m "docs: specify and plan the rooms paging fix"`; the commit MUST contain `specs/003-fix-rooms-pagination/research.md` and no file under `apps/` or `libs/` (check with `git show --stat --oneline HEAD`)

**Checkpoint**: The analysis is committed; the working tree has no source change.

---

## Phase 3: User Story 1 - Browse every room at any page size (Priority: P1) 🎯 MVP

**Goal**: For page `P` and page size `L`, the rooms list returns the rooms at positions `(P − 1) × L + 1` to `P × L` of all rooms ordered by `name` ascending, or as many as exist — for every page (1 or more) and every page size (1 to 100), not only 10.

**Independent Test**: With the 12 seeded rooms, `GET /api/rooms?page=2&limit=5` returns `Room 06` to `Room 10`, page 3 returns `Room 11` and `Room 12`, and the `/rooms` page shows the same (quickstart scenarios 1, 2, 3 and 5).

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T003 [US1] Edit `apps/room/src/room/room.repository.spec.ts`: after the case `skips the rooms of the previous pages`, add the reported case — `await repository.findPage({ page: 2, limit: 5 })` then `expect(findAndCount).toHaveBeenCalledWith({ skip: 5, take: 5, order: { name: 'ASC' } })`; change no existing case
- [X] T004 [US1] Edit `apps/room/src/room/room.repository.spec.ts`: add an `it.each` table of further offsets, each row asserting `findAndCount` is called with `{ skip, take: limit, order: { name: 'ASC' } }` — page 3, limit 5 → skip 10; page 4, limit 5 → skip 15; page 3, limit 1 → skip 2; page 2, limit 12 → skip 12; page 2, limit 100 → skip 100
- [X] T005 [US1] Edit `apps/room/src/room/room.repository.spec.ts`: add a `describe` "walking every page" in which `findAndCount` gets a `mockImplementation` that answers from 12 in-memory entities named `Room 01` to `Room 12` (built with the existing `roomEntity` helper, in name order) by applying the `skip` and `take` it receives — `[rooms.slice(skip, skip + take), 12]`, its parameter typed `FindManyOptions<RoomEntity>` (named import from `typeorm`); with `it.each([1, 5, 10, 12, 100])`, for each `limit` call `findPage({ page, limit })` for `page` 1 to `Math.ceil(12 / limit)`, concatenate `items[].name` and expect exactly the 12 names once, in order (SC-002), every page reporting `total` 12, its own `page` and `limit`; then call the page after the last and expect `items` to be `[]` with `total` 12; keep the file under 200 lines and add no comment
- [X] T006 [US1] Run `pnpm exec nx test room` with `apps/room/src/room/room.repository.ts` still unchanged and record the output: T003 MUST fail (called with `skip: 10`, expected `skip: 5`), all five rows of T004 MUST fail (called with skip 20, 30, 20, 10, 10), the walk of T005 MUST fail for `limit` 1, 5, 12 and 100 and pass for 10 (assumption 5), and the 4 cases that existed before MUST still pass; if a new case fails for another reason (compile error, wrong mock), fix the spec and run again before going on

### Implementation for User Story 1

- [X] T007 [US1] Edit `apps/room/src/room/room.repository.ts`, in `RoomRepository.findPage`: change `skip: (query.page - 1) * DEFAULT_PAGE_SIZE` to `skip: (query.page - 1) * query.limit` — rooms skipped before `items`: `(page − 1) × limit`; rooms taken: `limit` — and remove `DEFAULT_PAGE_SIZE` from the `@roombook/contract` import of that file (the constant itself stays in `libs/contract`); `take`, `order`, the returned `total`, `page`, `limit`, the explicit return type `Promise<PagedRoomsDto>` and `findById` are not changed
- [X] T008 [US1] Run `pnpm exec nx test room`: every case of `apps/room/src/room/room.repository.spec.ts`, new and old, and every other `room` spec MUST pass
- [ ] T009 [US1] Prove the API against the running stack with `specs/003-fix-rooms-pagination/quickstart.md`: `pnpm run stack:reset`, define `API` and `names` as in "Start the stack", then run scenario 1 (`page=2&limit=5` → `Room 06`–`Room 10`, `total` 12, `page` 2, `limit` 5), scenario 2 (page 1 → `Room 01`–`Room 05`; page 3 → `Room 11`, `Room 12`; page 4 → none, `total` 12), scenario 3 (no parameters → `Room 01`–`Room 10`, `page` 1, `limit` 10; `page=2` → `Room 11`, `Room 12`; `page=0` → 400; `limit=101` → 400) and scenario 4 (for each page size 1, 5, 10, 12 and 100: `12 distinct of 12 rows`, no "disorder" message); the gateway port is needed by name, `GATEWAY_PORT` — if it is not set in the shell, do not read a `.env` file: report the task as not run
- [ ] T010 [US1] Run scenario 5 of `specs/003-fix-rooms-pagination/quickstart.md` in a browser at `/rooms` (port by name, `WEB_PORT`): load → `Room 01`–`Room 10`, "1–10 of 12"; next → `Room 11`, `Room 12`; choose 5 rows per page → page 1, `Room 01`–`Room 05`; next → `Room 06`–`Room 10`, "6–10 of 12"; next → `Room 11`, `Room 12`, "11–12 of 12"; then `pnpm run stack:down` and `rm -f /tmp/rooms-*.txt`; if no browser is available, report the scenario as not run instead of marking it passed

**Checkpoint**: `pnpm exec nx test room` passes; `GET /api/rooms?page=2&limit=5` returns `Room 06` to `Room 10` (SC-001, SC-002).

---

## Phase 4: User Story 2 - The cause is written down before the fix (Priority: P2)

**Goal**: A written analysis states where the defect is, why it produces the observed rooms and why the existing tests passed, and it explains all four reported observations.

**Independent Test**: Read `research.md` against the four observations of spec.md; the history check is T015.

**No code in this phase** (assumption 3): the analysis was written during planning and committed in T002.

- [X] T011 [P] [US2] Read `specs/003-fix-rooms-pagination/research.md` and confirm, without editing any source file, that it has the three parts FR-007 asks for ("Where the defect is", "Why it happens", "Why the existing tests did not catch it") and that its table accounts for 4 out of 4 reported observations: page 1 right at every page size; page 2 right at 10 per page; page 2 wrong at 5 per page; page 2 at 5 per page showing exactly `Room 11` and `Room 12`; if a part or an observation is missing, report it and stop — the document is amended and committed before any further source edit

**Checkpoint**: The analysis is complete (SC-003, first half).

---

## Phase 5: User Story 3 - The defect cannot come back unnoticed (Priority: P3)

**Goal**: The automated tests fail if paging breaks again for a page size other than the default.

**Independent Test**: The recorded run of T006 shows the new cases failing against the code before the fix; the run of T008 shows them passing after it.

**No code in this phase** (assumption 4): the cases were written in T003 to T005.

- [X] T012 [US3] Check `apps/room/src/room/room.repository.spec.ts` against FR-008 and SC-004: at least one case exercises a page beyond the first at a page size other than 10 (T003: page 2 at 5), the outputs of T006 (new cases fail) and T008 (all pass) are both reported, and the two cases that existed before for the default page size (`skip: 0`, `skip: 10` at limit 10) are still there unchanged

**Checkpoint**: SC-004 is met.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The completion gates, the proof that nothing else changed, and the history.

- [X] T013 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root (scripts in `package.json`); all three MUST pass (SC-005); then run the scope check `git status --porcelain -- apps libs package.json` — expected: exactly two modified files, `apps/room/src/room/room.repository.ts` and `apps/room/src/room/room.repository.spec.ts` (FR-009) — and confirm both are under 200 lines with no `interface`, no `any`, no `import * as`, no inline object parameter type, no added comment and no remaining `DEFAULT_PAGE_SIZE` in `apps/room/src/room/room.repository.ts`
- [X] T014 Commit the test and the fix locally in one commit (after T013): `git add apps/room/src/room/room.repository.ts apps/room/src/room/room.repository.spec.ts` then `git commit -m "fix(room): page the rooms list by the requested page size"`
- [X] T015 Run the order check of `specs/003-fix-rooms-pagination/quickstart.md`: `git log --oneline -- specs/003-fix-rooms-pagination/research.md apps/room/src/room/room.repository.ts` — the commit of T002 that adds `research.md` MUST be older than the commit of T014 that changes the repository (SC-003, second half)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; blocks every source edit.
- **User Story 1 (Phase 3)**: after Foundational. T003 → T004 → T005 (one file) → T006 → T007 → T008 → T009 → T010.
- **User Story 2 (Phase 4)**: T011 reads a document only; it can run any time after T002.
- **User Story 3 (Phase 5)**: T012 after T008.
- **Polish (Phase 6)**: T013 after every story; T014 after T013; T015 after T014.

### User Story Dependencies

```text
Setup → Foundational (analysis committed) ─┬─▶ US1 (tests fail → fix → proof) ─▶ US3 (check)
                                           └─▶ US2 (read the analysis)
                                                          all ─▶ Polish (gates → commit → order check)
```

- **US1 (P1)**: independent; the MVP. It holds every code change.
- **US2 (P2)**: independent of US1; its history half is closed by T015.
- **US3 (P3)**: depends on US1 — it checks the cases US1 wrote first.

### Within User Story 1

- The three spec tasks, then the failing run, then the fix: T007 MUST NOT start before T006 has shown the failures.
- The unit run (T008) before the stack scenarios (T009, T010).

### Parallel Opportunities

- T003, T004 and T005 edit the same file and are done in sequence.
- T011 can run alongside any task of User Story 1.
- Nothing else is parallel: the change is one spec and one source file.

---

## Parallel Example: User Story 1

```bash
# The only work that can run next to User Story 1:
Task: "Check specs/003-fix-rooms-pagination/research.md against the four reported observations"   # T011

# Sequential, one file:
Task: "Add the page 2 at 5 per page case to apps/room/src/room/room.repository.spec.ts"            # T003
Task: "Add the table of further offsets to apps/room/src/room/room.repository.spec.ts"            # T004
Task: "Add the walk over every page to apps/room/src/room/room.repository.spec.ts"                # T005
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001).
2. Phase 2: Foundational (T002).
3. Phase 3: User Story 1 (T003–T010).
4. **STOP and VALIDATE**: `pnpm exec nx test room`, then quickstart scenarios 1 to 5.

At this point the defect is fixed and pinned by tests; what remains is checking, the gates and the commit.

### Incremental Delivery

1. Setup + Foundational → the analysis is in the history.
2. User Story 1 → failing tests, the fix, the end-to-end proof (MVP).
3. User Story 2 → the analysis is confirmed complete.
4. User Story 3 → the regression test is confirmed to meet FR-008.
5. Polish → gates, scope check, commit, order check.

### Parallel Team Strategy

Not applicable: one person completes the change in sequence; only T011 can be handed to someone else.

---

## Notes

- Requirement coverage: FR-001, FR-002 → T003, T004, T007; FR-003 → T005, T009; FR-004 → T010; FR-005, FR-006 → T005, T009 (scenario 3), T012; FR-007 → T002, T011, T015; FR-008 → T003 to T006, T008, T012; FR-009 → T013.
- Success criteria: SC-001 → T009, T010; SC-002 → T005, T009; SC-003 → T002, T011, T015; SC-004 → T006, T008, T012; SC-005 → T013.
- T009 and T010 need the running stack; a task that cannot be run is reported as not run, never marked passed.
- Stop at any checkpoint to validate the story on its own.
