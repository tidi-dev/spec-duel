---

description: "Task list for the No Overlapping Bookings feature"
---

# Tasks: No Overlapping Bookings for the Same Room

**Input**: Design documents from `/specs/002-prevent-booking-overlap/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (gateway-http-api.md, bookings-page.md), quickstart.md

**Tests**: Included. FR-024 and Constitution Principle V (Test-First, non-negotiable) require them: a spec task marked "failing" is done first and MUST fail (a compile error on a missing export counts) before the implementation task that follows it.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Every task names the exact file it creates, edits or runs

## Path Conventions

Nx monorepo, paths from the repository root: `libs/contract/src/lib/…`, `apps/booking/src/booking/…`, `apps/web/src/views/bookings/…`. A spec sits next to its source file as `*.spec.ts` / `*.spec.tsx`.

## Rules that apply to every task

- The only change to `libs/contract` is T002 (FR-015). Nothing is changed in `apps/room`, `apps/gateway`, `apps/worker`, `libs/backend-common`, `apps/web/src/views/rooms`, `apps/web/src/pages`, `apps/web/src/services`, `package.json` or `specs/001-room-bookings` (FR-021, FR-022). No table, migration, route, message pattern or dependency is added.
- Errors are raised with `ExceptionHelper` from `@roombook/backend-common` and an `ErrorCodeEnum` value from `@roombook/contract`.
- No `interface`, no `any`, no inline object type as a parameter, explicit return type on every repository method and query function, named imports only, kebab-case file names, every file under 200 lines, no narrative comments.
- Transactions only in repositories. `.env` files are never read; configuration is referred to by variable name. Git stays local.

## Assumptions made in this task list

1. **Spec files and the 200-line limit.** plan.md lists the existing specs as "edit", but four of them are within 25 lines of the limit. New cases therefore go to a new sibling file where the existing one would pass 200 lines: `idempotent-booking.repository.overlap.spec.ts`, `booking.repository.update.spec.ts`, `booking-create-form.overlap.spec.tsx` and `bookings-page.overlap.spec.tsx`. `create-booking.service.spec.ts`, `booking.service.spec.ts` and `booking-edit-dialog.spec.tsx` are edited in place; if one of them would reach 200 lines, its new cases move to a sibling `<name>.overlap.spec.ts(x)` instead.
2. **Names the design leaves open.** The two query functions are `lockRoom` and `isRoomSpanTaken`; the error function is `raiseBookingOverlap`; the new repository method is `BookingRepository.update`; the update result holds a `BookingEntity | null`.
3. **Repository specs mock `./booking-overlap.query`** with `jest.mock`, so the SQL text of the lock and the check is asserted once, in `booking-overlap.query.spec.ts`.
4. **User Story 3 adds no code.** The room lock is part of the create and update transactions built in User Stories 1 and 2 (plan.md, research R1); taking it out of them to add it later would leave those stories half-built. The unit tests that pin the lock and the order of statements are in those stories; the User Story 3 phase is the proof of the race against the running stack (research R7).
5. **User Story 4 specs are expected to pass when first run** (research R6): the page already has the behaviour. They are regression tests for the new error; a component is edited only if one of them fails.
6. `claim-booking-result.dto.ts` and `update-booking-result.dto.ts` hold no logic and get no spec of their own (plan.md).
7. T008 and T014 change existing specs so they keep passing with the new collaborators; they are not failing-first tasks.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the starting point; the project, tooling and dependencies already exist.

- [X] T001 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root (scripts in `package.json`) and confirm all three pass before any change; stop and report if one fails

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one contract change and the two shared pieces both write paths use: the room lock with the overlap check, and the overlap rejection.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Edit `libs/contract/src/lib/error-code.enum.ts`: add the member `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'` on the line after `IDEMPOTENCY_IN_PROGRESS`; change nothing else in `libs/contract`
- [X] T003 [P] Write the failing spec `apps/booking/src/booking/booking-overlap.query.spec.ts` with an `EntityManager` whose `query` is a `jest.fn()`: `lockRoom(manager, roomId)` runs exactly one statement, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, with the parameters `['room:<roomId>']`, and two different room ids give two different lock names; `isRoomSpanTaken(manager, roomId, startsAt, endsAt, excludedBookingId)` runs exactly one statement whose text contains `"room_id" = $1`, `"starts_at" < $3`, `"ends_at" > $2` and `$4::uuid IS NULL OR "id" <> $4::uuid` and does not contain `confirmation_status`, with the parameters `[roomId, startsAt, endsAt, excludedBookingId]` (`null` passed through as `null`), and returns `true` for the row `[{ taken: true }]` and `false` for `[{ taken: false }]`
- [X] T004 [P] Write the failing spec `apps/booking/src/booking/booking-overlap.error.spec.ts` (after T002): `raiseBookingOverlap()` throws an `RpcException` whose error is exactly `{ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: 'The room is already booked for that time' }` (read the error the way the `errorOf` helper of `create-booking.service.spec.ts` does)
- [X] T005 [P] Create `apps/booking/src/booking/booking-overlap.query.ts` exporting `lockRoom(manager: EntityManager, roomId: string): Promise<void>` (kind: transaction-scoped advisory lock, waiting (`pg_advisory_xact_lock`); name: `room:<roomId>`, hashed with `hashtextextended(…, 0)`) and `isRoomSpanTaken(manager: EntityManager, roomId: string, startsAt: Date, endsAt: Date, excludedBookingId: string | null): Promise<boolean>` (`SELECT EXISTS (SELECT 1 FROM "bookings" WHERE "room_id" = $1 AND "starts_at" < $3 AND "ends_at" > $2 AND ($4::uuid IS NULL OR "id" <> $4::uuid)) AS "taken"`): a stored booking `b` is in the way when `b.room_id = R AND b.starts_at < end AND b.ends_at > start`, and, on update, `b.id` is not the booking being changed; both are plain functions, not providers (T003 passes)
- [X] T006 [P] Create `apps/booking/src/booking/booking-overlap.error.ts` exporting `raiseBookingOverlap(): never`, one statement: `ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, 'The room is already booked for that time')` (T004 passes; depends on T002)

**Checkpoint**: `pnpm run build` and `pnpm run test` pass; user story work can begin.

---

## Phase 3: User Story 1 - A room cannot be double-booked on create (Priority: P1) 🎯 MVP

**Goal**: `POST /api/bookings` for a span that overlaps a booking of the same room is answered 409 `CONFLICT.BOOKING_OVERLAP`; nothing is stored against the booking, the `Idempotency-Key` or the queue. Touching spans and other rooms are still accepted.

**Independent Test**: Through the gateway alone, create a booking for a room, then send creates for the same room that overlap it, touch it and sit in another room, and reuse the key of a rejected create (quickstart scenarios 1, 2 and 3).

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T007 [P] [US1] Write the failing spec `apps/booking/src/booking/idempotent-booking.repository.overlap.spec.ts` with the `DataSource`, query runner and `manager` mocked as in `idempotent-booking.repository.spec.ts` and `./booking-overlap.query` mocked with `jest.mock`: (a) free span — `claim` calls `lockRoom(manager, booking.roomId)` then `isRoomSpanTaken(manager, booking.roomId, new Date(booking.startsAt), new Date(booking.endsAt), null)`, in this order by `invocationCallOrder`: `manager.findOneBy` (stored key) → `lockRoom` → `isRoomSpanTaken` → `manager.save`, and answers `CREATED`; (b) `isRoomSpanTaken` resolves `true` — the result is `{ outcome: ClaimBookingOutcomeEnum.OVERLAP, booking: null }`, `manager.save` and `manager.insert` are not called, the transaction is committed once, not rolled back, and the runner released once; (c) for each of `IN_PROGRESS` (first try-lock not obtained), `KEY_REUSED` (second try-lock not obtained), `REPLAYED` (stored row, same fingerprint) and `KEY_REUSED` (stored row, other fingerprint) neither `lockRoom` nor `isRoomSpanTaken` is called
- [X] T008 [P] [US1] Edit `apps/booking/src/booking/idempotent-booking.repository.spec.ts`: add `jest.mock('./booking-overlap.query')` and, in `beforeEach`, make `isRoomSpanTaken` resolve `false` and `lockRoom` resolve; change no existing case and keep the file under 200 lines
- [X] T009 [P] [US1] Edit `apps/booking/src/booking/create-booking.service.spec.ts`: in `claim outcomes` add a failing case — a claim `{ outcome: ClaimBookingOutcomeEnum.OVERLAP, booking: null }` raises 409 with `errorCode` `ErrorCodeEnum.BOOKING_OVERLAP` and the message `The room is already booked for that time`, and `ConfirmationQueueProducer.enqueue` is not called; in `the same key after a rejected request` add a failing case — after an `OVERLAP` claim, the same key and body with the claim still `OVERLAP` raises the same 409 again (not a replay), and the same key with a claim that answers `CREATED` returns `{ booking, replayed: false }` and enqueues exactly one job

### Implementation for User Story 1

- [X] T010 [US1] Edit `apps/booking/src/booking/claim-booking-result.dto.ts`: add `OVERLAP = 'OVERLAP'` to `ClaimBookingOutcomeEnum` after `IN_PROGRESS`
- [X] T011 [P] [US1] Edit `apps/booking/src/booking/idempotent-booking.repository.ts`: in `claimWithin`, after the stored-key branch and before `insertBookingWithKey`, call `lockRoom(manager, booking.roomId)`, then `isRoomSpanTaken(manager, booking.roomId, new Date(booking.startsAt), new Date(booking.endsAt), null)`, and return `{ outcome: ClaimBookingOutcomeEnum.OVERLAP, booking: null }` when it is `true`; the order inside the transaction is: try-lock key+fingerprint → try-lock key → read stored key → lock room (waits) → overlap check → insert booking + idempotency row (T007 passes, T008 stays green; depends on T005, T010)
- [X] T012 [P] [US1] Edit `apps/booking/src/booking/create-booking.service.ts`: in `toResult`, after the `IN_PROGRESS` branch, call `raiseBookingOverlap()` when the outcome is `ClaimBookingOutcomeEnum.OVERLAP`; the enqueue stays limited to outcome `CREATED` and the order of the earlier checks (stored key, time pair, room) is not changed (T009 passes; depends on T006, T010)

**Checkpoint**: `pnpm run test` passes; quickstart scenarios 1, 2 and 3 pass against the running stack.

---

## Phase 4: User Story 2 - A room cannot be double-booked by moving a booking (Priority: P2)

**Goal**: `PATCH /api/bookings/:id` whose resulting span overlaps another booking of the same room is answered 409 `CONFLICT.BOOKING_OVERLAP` and leaves the booking unchanged; 404 and 400 are answered as before and win over overlap; a booking never conflicts with itself.

**Independent Test**: Through the gateway alone, create two bookings of one room that do not overlap, then update one with times that overlap the other, touch the other and stay within its own span (quickstart scenario 4).

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T013 [P] [US2] Write the failing spec `apps/booking/src/booking/booking.repository.update.spec.ts` for `BookingRepository.update(id, changes)`, with the `BookingEntity` repository token mocked, the `DataSource` mocked as a query runner whose `manager` has `findOneBy` and `query` (pattern of `idempotent-booking.repository.spec.ts`), and `./booking-overlap.query` mocked; the stored booking is 09:00–10:00 in room `R`: (a) first read finds no row → `{ outcome: NOT_FOUND, booking: null }`, `lockRoom` not called; (b) the read after the lock finds no row → `NOT_FOUND`; (c) `{ endsAt: 09:00 }` and `{ startsAt: 10:30 }` → `INVALID_TIME_RANGE` (resulting `ends_at` not later than resulting `starts_at`; the stored value is used for the time that was not sent), `isRoomSpanTaken` not called; (d) `isRoomSpanTaken` resolves `true` → `OVERLAP` with `booking: null` and no `UPDATE`; (e) `{ endsAt: 11:00 }` → `isRoomSpanTaken(manager, R, stored start, 11:00, id)` and one `UPDATE "bookings"` whose text still contains `"title" = COALESCE($2::varchar, "title")`, `"starts_at" = COALESCE($3::timestamptz, "starts_at")`, `"ends_at" = COALESCE($4::timestamptz, "ends_at")`, `"updated_at" = now()`, `COALESCE($4::timestamptz, "ends_at") > COALESCE($3::timestamptz, "starts_at")` and `RETURNING`, with the parameters `[id, null, null, new Date(11:00)]`, answering `{ outcome: UPDATED, booking: <returned row> }`; (f) a title-only change takes the lock and checks the stored span; (g) the `UPDATE` returns no row → `NOT_FOUND`; (h) order by `invocationCallOrder`: first read → `lockRoom(manager, R)` → second read → `isRoomSpanTaken` → `UPDATE`; (i) every outcome commits once and releases once; a statement that rejects rolls back, releases and rethrows
- [X] T014 [P] [US2] Edit `apps/booking/src/booking/booking.repository.spec.ts`: remove the `updateIfTimeRangeValid` describe (its SQL assertions now live in T013) and add `{ provide: DataSource, useValue: { createQueryRunner: jest.fn() } }` to the providers; change no other case
- [X] T015 [P] [US2] Edit `apps/booking/src/booking/booking.service.spec.ts`: mock `BookingRepository.update` in place of `updateIfTimeRangeValid` and replace the three cases that follow the repository update with four failing ones — `UPDATED` returns the mapped DTO; `NOT_FOUND` raises 404 `NOT_FOUND.BOOKING` (`Booking not found`); `INVALID_TIME_RANGE` raises 400 `BAD_REQUEST.VALIDATION` (`endsAt must be later than startsAt`); `OVERLAP` raises 409 `CONFLICT.BOOKING_OVERLAP` (`The room is already booked for that time`) — and in all four `findById` is not called; the no-field case (stored booking returned, `update` not called) and the unparsable-time case (400, `update` not called) stay as they are

### Implementation for User Story 2

- [X] T016 [US2] Create `apps/booking/src/booking/update-booking-result.dto.ts` exporting `enum UpdateBookingOutcomeEnum { UPDATED, NOT_FOUND, INVALID_TIME_RANGE, OVERLAP }` (string values equal to the names) and `class UpdateBookingResultDto { outcome: UpdateBookingOutcomeEnum; booking: BookingEntity | null }`
- [X] T017 [P] [US2] Edit `apps/booking/src/booking/booking.repository.ts`: inject `DataSource`, delete `updateIfTimeRangeValid` and add `update(id: string, changes: UpdateBookingDto): Promise<UpdateBookingResultDto>` as one query-runner transaction (commit, rollback on error, release — the shape of `IdempotentBookingRepository.claim`): 1. read the booking by id with the transaction's manager — no row → `NOT_FOUND`; 2. `lockRoom(manager, roomId)`; 3. read the booking again — no row → `NOT_FOUND`; 4. form the resulting span from the sent times and the stored ones — end not later than start (`isEndAfterStart`) → `INVALID_TIME_RANGE`; 5. `isRoomSpanTaken(manager, roomId, start, end, id)` → `OVERLAP`; 6. run the existing conditional `UPDATE … RETURNING` statement unchanged on the manager → `UPDATED` with the row, or `NOT_FOUND` when it returns no row; every rejecting outcome returns before step 6; `deleteById`, `findPage`, `findById` and `recordConfirmationResult` are not changed and take no lock; the file stays under 200 lines (T013 passes, T014 stays green; depends on T005, T016)
- [X] T018 [P] [US2] Edit `apps/booking/src/booking/booking.service.ts`: `updateBooking` keeps its two earlier checks (no field → `findBookingById`; a time that does not parse → 400), then calls `bookingRepository.update(id, changes)` and maps the outcome — `UPDATED` → `toBookingDto(result.booking)`, `NOT_FOUND` → 404 `NOT_FOUND.BOOKING` `Booking not found`, `INVALID_TIME_RANGE` → 400 `BAD_REQUEST.VALIDATION` `endsAt must be later than startsAt`, `OVERLAP` → `raiseBookingOverlap()`; remove the follow-up `findBookingById` read that told 404 from 400 (T015 passes; depends on T006, T016)

**Checkpoint**: `pnpm run test` passes; quickstart scenario 4 passes against the running stack; scenarios 1 to 3 still pass.

---

## Phase 5: User Story 3 - Two people cannot take the same room at the same moment (Priority: P3)

**Goal**: Two overlapping creates for one room arriving together end as exactly one 201 and one 409 `CONFLICT.BOOKING_OVERLAP`, with one booking, one confirmation job and one stored idempotent response; the same holds for an update racing with a create.

**Independent Test**: Send two overlapping creates for the same room at the same moment, each with its own `Idempotency-Key`, 100 times; after every round count the answers and the stored bookings (quickstart scenario 5).

**No code in this phase** (assumption 4): the lock was built and unit-tested in T003, T005, T007, T011, T013 and T017. These tasks prove it against the running stack. They need the gateway port by name, `GATEWAY_PORT`; if it is not set in the shell, do not read a `.env` file — report the task as not run and ask the owner. If a round gives another result, stop, report the output and do not weaken the expectation; the fix belongs in `apps/booking/src/booking/idempotent-booking.repository.ts` or `apps/booking/src/booking/booking.repository.ts`, test first.

- [ ] T019 [US3] After `pnpm run stack:reset`, run the 100-round loop of scenario 5 in `specs/002-prevent-booking-overlap/quickstart.md` and confirm its output is the single line `100 201 409`; then confirm the checks of its table: 100 bookings for the room, every one `SENT` with 1 attempt 10 seconds later, and no job in `tmp/logs/worker.log` for a booking that does not exist (SC-003, SC-004)
- [ ] T020 [US3] Run the three variations of scenario 5 in `specs/002-prevent-booking-overlap/quickstart.md`, a few rounds each: room R and room S with the same span → `201 201`; room R 10:00–11:00 and 11:00–12:00 → `201 201`; the same key and body twice → one booking, and never `CONFLICT.BOOKING_OVERLAP` (FR-014)
- [ ] T021 [US3] Run scenario 6 of `specs/002-prevent-booking-overlap/quickstart.md` about 20 times (needs User Story 2): a `PATCH` that extends booking A to 11:30 racing with a create for 11:00–12:00 in the same room → every round exactly one of the two succeeds, the other is 409 `CONFLICT.BOOKING_OVERLAP`, and the room's bookings never overlap (FR-013)

**Checkpoint**: SC-003 is met; the outputs of T019 to T021 are reported.

---

## Phase 6: User Story 4 - See the conflict on the Bookings page without losing the input (Priority: P4)

**Goal**: On `/bookings`, an overlap rejection of a create or an edit shows the API's `message` inside the form that was submitted, keeps everything typed, and disappears after the next successful submit.

**Independent Test**: With `apps/web/src/services/booking.service.ts` mocked to reject with `new ApiError({ statusCode: 409, errorCode: ErrorCodeEnum.BOOKING_OVERLAP, message: 'The room is already booked for that time' })`, render the form, the dialog and the page and check the message and the kept values; by hand, quickstart scenario 7.

### Tests for User Story 4 (expected to pass when first run — assumption 5)

- [X] T022 [P] [US4] Write `apps/web/src/views/bookings/booking-create-form.overlap.spec.tsx` (helpers and mocks in the style of `booking-create-form.spec.tsx`), `createBooking` rejecting once with the overlap `ApiError`: after the submit, an `alert` inside the form `New booking` shows the API's message, Room, Title, Organizer email, Start and End still hold what was typed, and `onCreated` is not called; the next submit carries an `Idempotency-Key` that is a UUID and differs from the first; when that submit succeeds the alert is gone, the five fields are cleared and `onCreated` is called once
- [X] T023 [P] [US4] Edit `apps/web/src/views/bookings/booking-edit-dialog.spec.tsx`: add a case — with a new title and a new end typed and `updateBooking` rejecting once with the overlap `ApiError`, Save shows an `alert` inside the dialog `Edit booking` with the API's message, Title, Start and End still hold what was typed, and neither `onSaved` nor `onClose` is called; a second Save that succeeds calls `onSaved` once
- [X] T024 [P] [US4] Write `apps/web/src/views/bookings/bookings-page.overlap.spec.tsx` (mocks and helpers in the style of `bookings-page.spec.tsx`): a create rejected with the overlap `ApiError` shows the message inside the form and `listBookings` is still called once; an edit of the row `Planning` rejected with the overlap `ApiError` keeps the dialog open with the typed title, the table row still shows `Planning`, and `listBookings` is still called once; after a second Save that succeeds the dialog closes, the row shows the new title and `listBookings` has been called twice

### Implementation for User Story 4

- [X] T025 [US4] Run `pnpm run test` and read the result of T022 to T024: if all pass, change no production file in `apps/web` and report that the first run was green (research R6); if a case fails, fix only the component it names — `apps/web/src/views/bookings/booking-create-form.tsx`, `apps/web/src/views/bookings/booking-edit-dialog.tsx` or `apps/web/src/views/bookings/bookings-page.tsx` — so that it shows `error.message` of the `ApiError` without branching on the error code, and run the tests again

**Checkpoint**: `pnpm run test` passes; the page behaviour of `contracts/bookings-page.md` is pinned.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The completion gates and the end-to-end proof that nothing else changed.

- [X] T026 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root (scripts in `package.json`); all three MUST pass (FR-025); fix the cause of any failure, never the expectation
- [X] T027 [P] Run the scope check of `specs/002-prevent-booking-overlap/quickstart.md` ("Automated gates"): `git status --porcelain -- apps/room apps/web/src/views/rooms apps/web/src/pages/rooms apps/web/src/services/room.service.ts libs/backend-common/src/lib/database` prints nothing, and `git diff --stat -- libs/contract` shows one file, `error-code.enum.ts`, with one added line (SC-007)
- [X] T028 [P] Check every file created or edited under `apps/booking/src/booking/` and `apps/web/src/views/bookings/` against the constitution: under 200 lines, kebab-case name, no `interface`, no `any`, no `import * as`, no inline object parameter type, no narrative comment, and no remaining reference to `updateIfTimeRangeValid`
- [ ] T029 Run scenarios 1 to 4 of `specs/002-prevent-booking-overlap/quickstart.md` once more on a fresh `pnpm run stack:reset`, then scenario 8 (scenarios 1 to 10 of `specs/001-room-bookings/quickstart.md`, with a different span for each booking in the same room) and confirm every expected answer (FR-020, FR-023, SC-006)
- [ ] T030 Run scenario 7 of `specs/002-prevent-booking-overlap/quickstart.md` in a browser at `/bookings` (port by name, `WEB_PORT`), then `pnpm run stack:down`; if no browser is available, report the scenario as not run instead of marking it passed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; blocks every user story. T002 → T004 → T006; T003 → T005.
- **User Story 1 (Phase 3)**: after Foundational.
- **User Story 2 (Phase 4)**: after Foundational; shares no file with User Story 1.
- **User Story 3 (Phase 5)**: T019 and T020 after User Story 1; T021 after User Stories 1 and 2.
- **User Story 4 (Phase 6)**: after T002 only (its mocks use `ErrorCodeEnum.BOOKING_OVERLAP`); shares no file with the backend stories.
- **Polish (Phase 7)**: after every story.

### User Story Dependencies

```text
Setup → Foundational ─┬─▶ US1 (create) ──┬─▶ US3 (race proof: T019, T020)
                      │                  └─▶ ┐
                      ├─▶ US2 (update) ──────┴─▶ US3 (T021)
                      └─▶ US4 (page tests)
                                   all ─▶ Polish
```

- **US1 (P1)**: independent; the MVP.
- **US2 (P2)**: independent of US1 in code; delivered second because it closes the bypass of US1.
- **US3 (P3)**: depends on US1 (and on US2 for T021); it proves, it does not build.
- **US4 (P4)**: independent in code; meaningful by hand (T030) only once US1 and US2 run.

### Within Each User Story

- Spec tasks first; a "failing" spec MUST fail before its implementation task starts.
- DTO (T010, T016) before the repository and the service that use it.
- Repository and service of one story are in different files and can be done in parallel once the DTO exists.
- Story complete, with its checkpoint, before the next priority.

### Parallel Opportunities

- Phase 2: T003 and T004 together; then T005 and T006 together.
- US1: T007, T008 and T009 together; after T010, T011 and T012 together.
- US2: T013, T014 and T015 together; after T016, T017 and T018 together.
- US4: T022, T023 and T024 together.
- After Foundational, US1, US2 and US4 can be worked on at the same time: they share no file.
- Polish: T027 and T028 together.

---

## Parallel Example: User Story 1

```bash
# Specs of User Story 1 together:
Task: "Write the failing spec apps/booking/src/booking/idempotent-booking.repository.overlap.spec.ts"
Task: "Edit apps/booking/src/booking/idempotent-booking.repository.spec.ts to mock ./booking-overlap.query"
Task: "Add the OVERLAP cases to apps/booking/src/booking/create-booking.service.spec.ts"

# After T010, the two implementations together:
Task: "Take the room lock and check the span in apps/booking/src/booking/idempotent-booking.repository.ts"
Task: "Map OVERLAP to 409 in apps/booking/src/booking/create-booking.service.ts"
```

## Parallel Example: User Story 2

```bash
# Specs of User Story 2 together:
Task: "Write the failing spec apps/booking/src/booking/booking.repository.update.spec.ts"
Task: "Edit apps/booking/src/booking/booking.repository.spec.ts (remove the old update describe, provide DataSource)"
Task: "Replace the update cases in apps/booking/src/booking/booking.service.spec.ts"

# After T016, the two implementations together:
Task: "Add the transactional update to apps/booking/src/booking/booking.repository.ts"
Task: "Map the update outcome in apps/booking/src/booking/booking.service.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Write apps/web/src/views/bookings/booking-create-form.overlap.spec.tsx"
Task: "Add the overlap case to apps/web/src/views/bookings/booking-edit-dialog.spec.tsx"
Task: "Write apps/web/src/views/bookings/bookings-page.overlap.spec.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001).
2. Phase 2: Foundational (T002–T006).
3. Phase 3: User Story 1 (T007–T012).
4. **STOP and VALIDATE**: `pnpm run test`, then quickstart scenarios 1 to 3.

At this point a room can no longer be double-booked by a create, also under a race; it can still be double-booked by moving a booking until User Story 2 is done.

### Incremental Delivery

1. Setup + Foundational → the error code, the lock, the check and the rejection exist.
2. User Story 1 → create is safe (MVP).
3. User Story 2 → update is safe; the rule can no longer be bypassed.
4. User Story 3 → the race is proven against the running stack.
5. User Story 4 → the page behaviour is pinned by tests.
6. Polish → gates, scope check, full quickstart.

### Parallel Team Strategy

After Foundational, three people can take User Story 1, User Story 2 and User Story 4 at once; User Story 3 follows when 1 and 2 are merged.

---

## Notes

- [P] tasks touch different files and depend on no incomplete task.
- Requirement coverage: FR-001 to FR-004 → T003, T005; FR-005 to FR-008 → T007 to T012; FR-009 to FR-011 → T013 to T018; FR-012 to FR-014 → T007, T011, T013, T017, T019 to T021; FR-015, FR-016 → T002, T004, T006; FR-017 to FR-019 → T022 to T025; FR-020 to FR-025 → T026 to T030.
- A spec that fails for a reason other than the missing behaviour is fixed before the implementation starts.
- No commit task is listed: git is local and the owner decides when to commit.
- Stop at any checkpoint to validate the story on its own.
