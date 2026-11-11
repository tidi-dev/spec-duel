# Research: No Overlapping Bookings for the Same Room

**Feature**: `specs/002-prevent-booking-overlap` | **Date**: 2026-11-10

The Technical Context had no open `NEEDS CLARIFICATION` after reading the repository: the stack, the
contract and the test tooling are those of `specs/001-room-bookings`. The decisions below settle the
design questions the specification leaves to the plan. Facts marked *(verified)* were checked in this
repository's source; everything else is a design choice or a stated assumption. References such as
"001 R3" point to `specs/001-room-bookings/research.md`.

## R1. How the rule is enforced when requests race

- **Decision**: Every write that can create an overlap runs in a repository transaction that first
  takes a transaction-scoped advisory lock for the room,
  `pg_advisory_xact_lock(hashtextextended('room:<roomId>', 0))`, then checks for an overlapping
  booking, then writes. The lock is the blocking kind: a second writer for the same room waits until
  the first commits or rolls back, and then checks against what the first one stored.
- **Rationale**:
  - A check followed by a write is not safe on its own: at the default isolation level two
    transactions cannot see each other's uncommitted bookings, so both checks would pass. Making the
    writers of one room take turns closes that gap for create against create, update against create
    and update against update with one mechanism (FR-012, FR-013).
  - Each statement in a `READ COMMITTED` transaction sees everything committed before it starts, so
    the check that runs after the wait sees the booking the previous holder stored.
  - The lock is per room. Writers for different rooms never wait for each other, and writers for the
    same room whose spans do not overlap both succeed, one after the other (FR-014).
  - The lock is released at commit or rollback; nothing is released by hand and a crashed request
    leaves nothing behind. This is the mechanism the create flow already uses for the idempotency
    key *(verified: `idempotent-booking.repository.ts`)*, so no new technique enters the code base.
  - No schema change, no extension and no migration are needed (FR-022, and the spec's "the database
    is used as it is").
- **Consequences to know**:
  - The wait is as long as the holder's transaction: a handful of statements. It is far below the
    gateway's 5-second NATS timeout (001 R6).
  - A 64-bit hash collision between two rooms makes their writers take turns needlessly; it can
    never cause a wrong answer, because the overlap check still compares `room_id`.
  - The lock name starts with `room:`; the idempotency locks are a UUID or `<uuid>:<fingerprint>`,
    so the two families cannot produce the same name.
  - Lock order cannot deadlock: the idempotency locks are try-locks (they never wait), and the room
    lock is the only lock a transaction waits for.
  - `DELETE` takes no lock. A delete racing with a create is answered by whichever commits first,
    which the spec accepts.
  - The rule is enforced by the `booking` service, not by the database: a row written by hand could
    still overlap. No other writer exists in this system.
- **Alternatives considered**:
  - An exclusion constraint (`EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH
    &&)`): the strongest guarantee, but it needs the `btree_gist` extension and a schema migration
    that fails on data that already overlaps; the rejection would arrive as a database error to be
    recognised by its code, which 001 R3 rejected as control flow; and two simultaneous conflicting
    inserts can wait on each other until the database aborts one as a deadlock, which is not the
    clean "one 201, one 409" of FR-012 (known PostgreSQL behaviour, not reproduced here).
  - `SERIALIZABLE` transactions with a retry loop: correct, but every writer needs retry handling
    and the failure again arrives as an error code.
  - `SELECT … FOR UPDATE` on the overlapping rows: locks nothing when the span is still free, which
    is exactly the racing case.
  - Locking the room's row in `rooms`: that table belongs to the `room` service (FR-021).

## R2. The overlap check

- **Decision**: One query answers whether a span is taken:
  a booking exists with the same `room_id`, `starts_at` earlier than the new end, `ends_at` later
  than the new start, and — for an update — an `id` other than the booking being changed.
- **Rationale**: This is FR-001 as written; the two strict comparisons give half-open spans, so
  touching bookings do not match. Excluding the booking's own id gives FR-010. Deleted bookings are
  not in the table and `confirmation_status` is not in the predicate (FR-004). The existing index
  `IDX_bookings_room_id_starts_at` *(verified: migration `1731200000002`)* serves it.
- **Where it lives**: `booking-overlap.query.ts` in `apps/booking`, two functions that take the
  transaction's `EntityManager` — take the room lock, and run the check — each with an explicit
  return type. Both repositories call them, so the lock name and the predicate exist once.
- **Alternatives considered**: repeating the predicate inside the `INSERT` and the `UPDATE`
  (`WHERE NOT EXISTS …`) — two copies of the rule, and a write that silently changes nothing would
  then have to be told apart from the other reasons for "no row".

## R3. Create: where the check goes and what a rejection leaves

- **Decision**: Inside the existing claim transaction of `IdempotentBookingRepository`, after the
  two idempotency try-locks and the read of the stored key, and before the insert: take the room
  lock, run the check, and return a new internal outcome `OVERLAP` when the span is taken.
  `CreateBookingService` maps `OVERLAP` to 409 `CONFLICT.BOOKING_OVERLAP` and enqueues nothing.
- **Rationale**:
  - **Order** (FR-008): the order of 001 R4 is kept and overlap is its last check — key format, body,
    stored key (replay or 422), time pair, room exists, claim (in progress, key reused, replay),
    then overlap.
  - **Nothing stored** (FR-006, FR-007): the outcome is returned before any insert, so the
    transaction ends without a booking and without an idempotency row. The key is free: the same key
    with a free span creates (scenario US1-8), and the same key and body while the conflict remains
    is checked again and answered 409 without the replay header (US1-9).
  - **No job** (FR-006): the service enqueues only for outcome `CREATED` *(verified:
    `create-booking.service.ts`)*.
  - **Twins** (edge case): a request whose twin already committed finds the stored key before the
    overlap check and replays; one whose twin is still open fails the try-lock and gets
    `CONFLICT.IDEMPOTENCY_IN_PROGRESS`. Neither can be rejected for overlapping its own twin.
  - **Replays are not re-checked**: both replay paths return before the room lock is taken.
- **Alternatives considered**: checking in the service before the claim (not safe against a race,
  and a second check under the lock would still be needed).

## R4. Update: one transaction, one outcome

- **Decision**: `BookingRepository` replaces `updateIfTimeRangeValid` with a transactional update
  that returns an outcome (`UPDATED`, `NOT_FOUND`, `INVALID_TIME_RANGE`, `OVERLAP`) and, when
  updated, the stored booking:
  1. read the booking's `room_id` — no row → `NOT_FOUND`;
  2. take the room lock (R1);
  3. read the booking again — it may have changed or gone while waiting; no row → `NOT_FOUND`;
  4. form the resulting span from the sent times and the stored ones; end not later than start →
     `INVALID_TIME_RANGE`;
  5. run the overlap check (R2) with the booking's own id excluded → `OVERLAP`;
  6. run the existing conditional `UPDATE … RETURNING` → `UPDATED` (no row, because the booking was
     deleted in between → `NOT_FOUND`).

  `BookingService` maps the outcome: 404 `NOT_FOUND.BOOKING`, 400 `BAD_REQUEST.VALIDATION`, 409
  `CONFLICT.BOOKING_OVERLAP`, or the booking.
- **Rationale**:
  - **Order** (FR-011): the steps are the existing answers in their existing order with overlap
    last. The service's earlier checks stay in front: an empty body still returns the booking
    unchanged without a transaction, and a time that does not parse is still 400.
  - **Resulting span** (FR-009): step 4 uses the stored value for a time that was not sent, read
    under the lock, so an update that sends only one time is checked on the pair it would store.
  - **Uniform** (spec assumption): a title-only update goes through the same steps and passes on
    data that respects the rule.
  - **Unchanged on rejection**: every rejecting outcome returns before step 6.
  - The room cannot change on update, so the room read in step 1 is still the right lock in step 2.
  - Under the lock no other request can change this booking's times, so 001 R9's guarantee (two
    concurrent one-sided updates never store an invalid pair) still holds; the statement's own
    condition and `CK_bookings_time_range` stay as they are.
  - The repository reports what happened and the service chooses the answer, as the claim does
    (001 R3). This also removes the service's follow-up read that told 404 from 400.
- **Alternatives considered**: a single `UPDATE … WHERE NOT EXISTS (…)` without a lock (not safe
  against a race, R1); keeping the null return and letting the service work out the reason (three
  possible reasons need two more reads outside the transaction, open to races).

## R5. Contract change and message

- **Decision**: Add `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'` to `ErrorCodeEnum`, after
  `IDEMPOTENCY_IN_PROGRESS`. Raise it with the existing `ExceptionHelper.conflict` from one small
  function in `apps/booking` used by both services, with the message
  `The room is already booked for that time`.
- **Rationale**: FR-015 allows exactly this one contract change. `ExceptionHelper.conflict`,
  the `RpcExceptionFilter` and the web `ApiError` already carry any `{ statusCode, errorCode,
  message }` end to end *(verified: `exception.helper.ts`, `api-error.ts`)*, so the gateway, the
  worker and `libs/backend-common` need no change. One function keeps the wording identical on
  create and update (FR-016). The message names no booking (spec: conflicts are not disclosed).
- **Alternatives considered**: a message constant in the contract (a second contract change).

## R6. Bookings page

- **Finding** *(verified: `booking-create-form.tsx`, `booking-edit-dialog.tsx`,
  `bookings-page.tsx`)*: the page already behaves as FR-017 to FR-019 require for any error the API
  answers.
  - The create form shows the error's `message` in an alert inside the form, resets its fields only
    after a success, clears the alert at the start of each submit, and drops the idempotency key
    after any `ApiError`, so the next submit carries a new key (scenario US4-4).
  - The edit dialog shows the message in an alert inside its form, closes only through `onSaved`
    or Cancel, and keeps its field values; the list is reloaded only after a success, so the row
    keeps the stored values (US4-5).
- **Decision**: No production code in `apps/web` is planned. The change adds test cases, with the
  service layer mocked to reject with `ApiError` 409 `CONFLICT.BOOKING_OVERLAP`, that pin each
  scenario of User Story 4 in `booking-create-form.spec.tsx`, `booking-edit-dialog.spec.tsx` and
  `bookings-page.spec.tsx`. If one of them fails, the component is fixed to satisfy it.
- **Note on test-first**: these cases are expected to pass when first run, because the behaviour
  already exists. They are regression tests for the new error, not a red-green cycle; this is said
  here so that a green first run is not mistaken for a skipped step.
- **Alternatives considered**: branching on the error code in the page (the spec asks for the API's
  message as sent; the page needs no knowledge of the code).

## R7. How the race is proven

- **Decision**: Unit tests cover each outcome and the order of statements (lock, check, write) with
  the database mocked, as the existing repository specs do *(verified:
  `idempotent-booking.repository.spec.ts`)*. The race itself (SC-003: 100 rounds) is proven against
  the running stack in the quickstart.
- **Rationale**: Same split as `specs/001-room-bookings` (its plan assumption 11); a mocked
  database cannot show a race, and no integration-test harness exists or is added.
