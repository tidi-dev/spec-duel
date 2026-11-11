# Design

## Context

See `proposal.md` for the motivation. What the code does today, as read from `apps/booking/src/booking`:

- **Create** — `BookingService.createBooking` validates the time order, reads the idempotency key (fast-path replay or 422), asks the `room` service, then calls `IdempotentBookingRepository.create`. That method runs one transaction: `pg_try_advisory_xact_lock` on the key, re-read of the key, insert of the booking, insert of the key row. It returns a named outcome (`CREATED`, `EXISTING`, `IN_PROGRESS`) that the service turns into an answer; the confirmation job is enqueued only for `CREATED`.
- **Update** — `BookingService.updateBooking` reads the stored booking, merges the changed values, validates the time order and calls `BookingRepository.update`, a single `UPDATE` without a transaction that returns `BookingDto | null`. `roomId` cannot be changed by an update.
- **Storage** — `bookings` has `CHECK (ends_at > starts_at)` and the index `IDX_bookings_room_id_starts_at_id (room_id, starts_at, id)`. Nothing prevents overlap.
- **Errors** — `ExceptionHelper.conflict(errorCode, message)` already raises a 409. The gateway relays any `{ statusCode, errorCode, message }` from the `booking` service unchanged (`booking.controller.spec.ts` has a table of relayed errors).
- **Web** — `BookingCreateForm` and `BookingEditDialog` already catch any rejection, show `error.message` in an `Alert` inside the form and never reset the fields on failure. `ApiError.message` is the API's `message`.

Constraints from the project rules that shape the approach: transactions live in repositories only; no inline object parameter types; explicit repository return types; no new dependency; files under 200 lines.

## Goals / Non-Goals

**Goals:**

- One place decides "does this span overlap another booking of the room", used by both create and update.
- The decision and the write happen atomically per room, so concurrent requests cannot both pass.
- A rejected create leaves no trace: the transaction that would have stored the booking and the key stores neither.
- Deterministic answers: the loser of a race gets 409 `CONFLICT.BOOKING_OVERLAP`, never a 500 or a deadlock error.

**Non-Goals:**

- No schema change, no migration, no database extension.
- No change to the order or meaning of the existing create answers (400, replay, 422, in-progress 409, 404, 503).
- No change to the stale-read behaviour of an update (two updates of the *same* booking still apply last-writer-wins on the merged values); the no-overlap rule holds regardless, because the check runs on the values being written.
- No new UI component and no mapping of error codes to client-side texts: the page shows the API's message.

## Decisions

### D1. Serialise writes per room with a transaction-scoped advisory lock, then check, then write

Inside the write transaction, before the overlap check, take a blocking lock for the room:

```sql
SELECT pg_advisory_xact_lock(hashtextextended($1, 0))   -- $1 = 'booking-room:' || roomId
```

Then run the overlap check (D2), and only write when it finds nothing. The lock is released at commit or rollback. With the default `READ COMMITTED` isolation each statement sees rows committed before it starts, so the second request, which waited for the lock, sees the first request's booking and is rejected.

- The lock is *blocking* (not `pg_try_…`): a concurrent request for the same room waits a few milliseconds and then gets a definite answer (201/200 or 409 overlap). A try-lock would need a third answer ("room busy") that the required behaviour does not have.
- The lock text is prefixed with `booking-room:` because the idempotency key lock hashes a bare UUID with the same function. Without the prefix, a client sending an `Idempotency-Key` equal to a room id would collide with that room's lock and get a false `CONFLICT.IDEMPOTENCY_IN_PROGRESS`.
- Requests for different rooms take different locks and do not wait for each other.

**Alternatives considered:**

- *Exclusion constraint* (`EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`). Strongest guarantee, but it needs the `btree_gist` extension and a migration, it reports the conflict as a driver error that the repository would have to recognise by SQLSTATE and constraint name, and two concurrent conflicting inserts can end in a deadlock error for one of them rather than a clean conflict, which would need a second error mapping. More moving parts than the rule requires, for a table with one writer.
- *`SERIALIZABLE` transactions with retry.* Correct, but adds a retry loop and a serialization-failure mapping to both write paths.
- *`SELECT … FOR UPDATE` on the room's bookings.* Does not lock the gap: two creates into an empty span lock nothing and both pass.
- *Check in the service before calling the repository.* Not atomic; two concurrent creates both pass. Also puts a multi-step data decision outside the repository.

### D2. One overlap query helper shared by both repositories

New file `apps/booking/src/booking/booking-overlap.query.ts`: a static class `BookingOverlapQuery` (same style as `BookingTimeUtil` and `BookingMapper`) with one method

```ts
static async existsLocked(manager: EntityManager, criteria: BookingOverlapCriteria): Promise<boolean>
```

that takes the room lock (D1) and then answers whether a conflicting row exists:

```ts
manager.existsBy(BookingEntity, {
  roomId: criteria.roomId,
  startsAt: LessThan(criteria.endsAt),
  endsAt: MoreThan(criteria.startsAt),
  ...(criteria.excludedBookingId ? { id: Not(criteria.excludedBookingId) } : {}),
})
```

- Strict `<` and `>` implement the half-open span: `existing.startsAt < new.endsAt AND existing.endsAt > new.startsAt`. A booking that starts exactly when another ends satisfies neither.
- `excludedBookingId` is how a booking never conflicts with itself on update. Create leaves it unset.
- `BookingOverlapCriteria` is a class in `dto/booking-overlap-criteria.ts` (`roomId`, `startsAt: Date`, `endsAt: Date`, `excludedBookingId?: string`), because an inline object parameter type is not allowed.
- Lock and check live in one method so no caller can run the check without the lock.
- It takes the caller's `EntityManager`, so it always runs in the caller's transaction. It is not a provider and needs no module registration.
- The existing index `(room_id, starts_at, id)` serves the query; no new index.

*Alternative:* a method on `BookingRepository` called by `IdempotentBookingRepository`. Rejected: it would make one repository depend on the other and pass a transaction manager across provider boundaries.

### D3. Create: check inside the existing idempotent transaction

`IdempotentBookingRepository.createLocked` gains one step and one outcome. New order:

1. try the key lock → `IN_PROGRESS` when not acquired (unchanged)
2. re-read the key → `EXISTING` when found (unchanged)
3. **`BookingOverlapQuery.existsLocked(manager, { roomId, startsAt, endsAt })` → `OVERLAP` when true**
4. insert the booking, insert the key row → `CREATED` (unchanged)

`IdempotentCreateOutcomeKindEnum` gains `OVERLAP`, and the outcome union gains `{ kind: OVERLAP }`. `BookingService.resolveCreateOutcome` maps it to `ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, …)`; its `switch` stays exhaustive.

Why this satisfies the specs:

- `OVERLAP` returns before either insert, so no booking and no key row exist; the key stays usable and a repeat is evaluated again.
- The service enqueues only for `CREATED`, so no confirmation job is enqueued.
- Steps 1–2 and the service's fast-path key read stay ahead of the check, so a completed key is replayed (or answered 422) without ever being compared with its own booking.
- Lock order is always key lock, then room lock; an update takes only the room lock. No cycle, so no deadlock.

The service's sequence (validate → key read → room lookup → repository) is unchanged, which keeps the precedence the specs state: 400, replay/422, 404/503, then in-progress 409 or overlap 409.

### D4. Update: move into a transaction that returns a named outcome

`BookingRepository.update` becomes a transaction (`DataSource` is injected next to the existing `Repository<BookingEntity>`):

1. read the booking by id with the transaction's manager → `NOT_FOUND` when missing (needed for its `roomId`)
2. `BookingOverlapQuery.existsLocked(manager, { roomId, startsAt, endsAt, excludedBookingId: id })` → `OVERLAP` when true
3. `manager.update(BookingEntity, { id }, values)` → `NOT_FOUND` when no row was affected (deleted meanwhile)
4. re-read and map → `UPDATED` with the `BookingDto`

Return type: `Promise<UpdateBookingOutcome>`, a discriminated union in `dto/update-booking-outcome.ts` with `UpdateBookingOutcomeKindEnum` (`UPDATED`, `NOT_FOUND`, `OVERLAP`), mirroring `idempotent-create-outcome.ts`. `BookingService.updateBooking` keeps its read-merge-validate steps and then switches on the outcome: `UPDATED` → the booking, `NOT_FOUND` → the existing 404, `OVERLAP` → 409.

- The check runs on every update, including a title-only one. That keeps one code path; it succeeds because the booking is excluded from its own check and no other booking overlaps it.
- *Alternative:* keep `BookingDto | null` and throw from the repository on overlap. Rejected: raising HTTP-shaped errors is the service's job everywhere else in this module.

### D5. Contract and message

- `libs/contract/src/lib/error-code.enum.ts`: add `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'` after `IDEMPOTENCY_IN_PROGRESS`. Nothing else in the contract changes.
- One message for both paths, held as a constant in `booking.service.ts`: `The room already has a booking that overlaps this time span`. **Assumption:** the request fixes the status and the code but not the wording; this text names no other booking's id, title or organizer, so nothing about someone else's booking leaks.

### D6. Gateway and web: no production code change expected

- Gateway: add the overlap code to the existing table of relayed errors in `apps/gateway/src/booking/booking.controller.spec.ts` for `POST` and `PATCH`. No source change.
- Web: both forms already meet the `bookings-page` delta. The work is specs that pin it down for `CONFLICT.BOOKING_OVERLAP`: message shown in the form, values kept, edit dialog still open, alert cleared and request re-sent on the next submit. **Assumption:** "next to the form" is met by the alert each form already renders inside itself (above the create fields, inside the edit dialog). If a new spec fails, fix the form rather than the spec.

### D7. Test layout

Unit specs mock the entity manager as the existing repository specs do (`transaction` invoking its callback with a mocked manager), so they assert the order of calls and the outcome, not real locking.

- `booking-overlap.query.spec.ts` (new): lock SQL and its `booking-room:` argument are sent before `existsBy`; the where-clause uses `LessThan(endsAt)` / `MoreThan(startsAt)`; `Not(id)` only when `excludedBookingId` is set.
- `idempotent-booking.repository.spec.ts`: the mocked `manager` gains `existsBy`; `query` answers per SQL text. New cases: `OVERLAP` stores nothing; check runs after the key read and before the save.
- `booking.repository.update.spec.ts` (new, so `booking.repository.spec.ts` stays under 200 lines): the four outcomes of D4; the existing update cases move here.
- `booking.service.update.spec.ts` (new, same reason): the existing update cases move here, adapted to the outcome type, plus `OVERLAP` → 409.
- `booking.service.create.spec.ts`: `OVERLAP` → 409 `CONFLICT.BOOKING_OVERLAP`, nothing enqueued.
- Real concurrency is verified once, by hand against the local stack, in the final task group (the repository has no automated end-to-end suite).

## Risks / Trade-offs

- [The rule is enforced by the `booking` service, not by the database] → The `booking` service is the only writer of `bookings`, and both of its write paths go through `BookingOverlapQuery.existsLocked`. A row written by hand in SQL could still overlap; accepted, and an exclusion constraint can be added later as a backstop without changing behaviour.
- [A unit test with a mocked manager cannot prove the lock works] → The final task group runs the concurrent scenarios of the `bookings-api` delta against the real stack and records the answers.
- [All writes for one room queue on one lock] → The critical section is one indexed existence check plus one or two writes; rooms do not block each other. Acceptable for this system's load.
- [A request waiting for the room lock holds a database connection] → Bounded by the same short critical section; the gateway's 5-second NATS timeout already caps the wait a client sees.
- [Overlapping rows that exist before this change would make any update of either row fail, even a title-only one] → Out of scope by decision: the database is reset before this change is used.
- [Two hash inputs could collide in `hashtextextended`] → A collision between two rooms only makes them share a lock (slower, still correct). The `booking-room:` prefix removes the realistic collision, a key equal to a room id.
- [`BookingRepository.update` changes its return type] → It has one caller, `BookingService.updateBooking`, changed in the same task group.

## Migration Plan

No schema or data migration. Deploy is a normal restart of the `booking` service (and of the gateway and web only because they rebuild against `libs/contract`). Reset the database first, as agreed, so no overlapping rows pre-exist. Rollback is reverting the commit; nothing persisted by this change needs undoing.
