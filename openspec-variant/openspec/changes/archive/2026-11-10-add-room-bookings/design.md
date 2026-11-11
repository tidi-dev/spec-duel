# Design

## Context

See `proposal.md` for motivation and `specs/` for the required behaviour. What the code looks like today, and what constrains the approach:

- `libs/contract` already exports everything the feature names: `ApiRouteEnum.BOOKINGS`, `BookingPatternEnum`, `QueueEnum.BOOKING_CONFIRMATION`, the booking, message and confirmation DTOs, `ErrorCodeEnum`, the two header names and the confirmation constants. It is frozen.
- `apps/gateway` controllers call `NatsRequestUtil.send` directly; there is no gateway service layer. `configureGatewayApp` installs a `ValidationPipe` (`transform`, `whitelist`) and `RpcExceptionFilter`, which turns an `{ statusCode, errorCode, message }` error or a `BadRequestException` into the error answer.
- `apps/booking` and `apps/worker` have health handlers only. Both already configure BullMQ against Redis; `booking` already configures TypeORM. Neither imports `NatsClientModule` yet.
- The NATS services install no validation pipe (see `apps/room/src/main.ts`), so DTO decorators are enforced at the gateway only. The `booking` service must check its own semantic rules.
- An error answered by one NATS service reaches the caller as a plain object, not an `RpcException`. A service that forwards it unchanged would answer "Internal server error", so it must be re-raised through `ExceptionHelper`.
- Entities, the data source and migrations live in `libs/backend-common`; `synchronize` is off, so schema changes need a migration.
- `apps/web` follows `pages/<route>/index.tsx` → `views/<route>/*`, with one service file per resource over `apiClient`, which turns error answers into `ApiError` and rethrows a network error untouched.
- Installed versions: `react-hook-form` 7.51.1, `@hookform/resolvers` 5.4.0 (peer range `react-hook-form ^7.55.0`), `uuid` 11.1.1. No dependency may be added.
- Observed and out of scope: `RoomRepository.findPage` computes `skip` from `DEFAULT_PAGE_SIZE` instead of `query.limit`. The `room` service must not be changed; this design only ever reads page 1 of the room list, which is unaffected.

## Goals / Non-Goals

**Goals:**

- Exactly one booking per idempotency key under concurrency, guaranteed by the database rather than by timing.
- No idempotency state that can be left stuck by a crash.
- A stateless worker whose result depends only on the booking and the attempt number.
- Reuse existing patterns (gateway forwarding, `ExceptionHelper`, repository-per-aggregate, view/service split in the web app).

**Non-Goals:**

- Room availability or overlap checks.
- A transactional outbox between storing the booking and enqueueing its job.
- Live refresh of confirmation status on the page.
- Authentication, per-user ownership, key expiry or cleanup.
- Fixing the room paging defect noted above.

## Decisions

### D1. Module layout

| App | New files (kebab-case, each under 200 lines) |
|---|---|
| `apps/gateway/src/booking/` | `booking.module.ts`, `booking.controller.ts`, `idempotency-key.guard.ts`, `idempotency-replayed.interceptor.ts` |
| `apps/booking/src/booking/` | `booking.module.ts`, `booking.controller.ts`, `booking.service.ts`, `booking.validator.ts`, `booking.repository.ts`, `idempotent-booking.repository.ts`, `booking.mapper.ts`, `booking-time.util.ts`, `booking-fingerprint.util.ts`, `room-lookup.client.ts`, `confirmation-queue.producer.ts`, `dto/` for internal command and outcome classes |
| `apps/worker/src/confirmation/` | `confirmation.module.ts`, `confirmation.processor.ts`, `confirmation.service.ts`, `simulated-confirmation.sender.ts`, `booking.client.ts` |
| `libs/backend-common/src/lib/` | `entities/booking.entity.ts`, `entities/idempotency-key.entity.ts`, `database/migrations/1731200000002-create-bookings.ts`, `errors/error-response.guard.ts` |
| `apps/web/src/` | `pages/bookings/index.tsx`, `services/booking.service.ts`, `views/bookings/*` (D9) |

Each new module is registered once in its app module. `booking` and `worker` app modules import `NatsClientModule`; the `booking` module registers the queue with `BullModule.registerQueue`.

### D2. Gateway: guard for the key, interceptor for the replay header

`BookingController` has five handlers, each a single `NatsRequestUtil.send`. `:id` goes through `ParseUUIDPipe`, whose `BadRequestException` the existing filter already answers as `BAD_REQUEST.VALIDATION`. `DELETE` uses `@HttpCode(204)`.

- `IdempotencyKeyGuard` reads `IDEMPOTENCY_KEY_HEADER`, checks it with class-validator's `isUUID`, and raises `ExceptionHelper.badRequest(IDEMPOTENCY_KEY_INVALID, …)`. A guard runs before pipes, which fixes the order "key error before body error" required by the spec. Alternative considered: a parameter pipe on `@Headers()`; rejected because parameter pipes resolve concurrently, so the winning error would not be deterministic.
- `IdempotencyReplayedInterceptor` maps the `CreateBookingResultDto` from the booking service to its `booking` and sets `IDEMPOTENCY_REPLAYED_HEADER: true` when `replayed` is true. Alternative: `@Res({ passthrough: true })` in the handler; rejected because it puts a branch in the controller.

The status is always 201: only successful creates are stored, so the stored status is 201 by construction.

### D3. Data model

One migration creates both tables; entities sit beside `RoomEntity` and are added to the data source list and the library index.

`bookings`: `id uuid` PK (`gen_random_uuid()`), `room_id uuid`, `title varchar(120)`, `organizer_email varchar(320)`, `starts_at timestamptz`, `ends_at timestamptz`, `confirmation_status varchar(16)` default `PENDING`, `confirmation_attempts integer` default 0, `created_at`, `updated_at timestamptz`. Constraints: `CHECK (ends_at > starts_at)`, `CHECK (confirmation_status IN ('PENDING','SENT','FAILED'))`. Indexes: `(starts_at, id)` and `(room_id, starts_at, id)`, matching the two list queries.

`idempotency_keys`: `key uuid` PK, `request_fingerprint char(64)`, `response_status integer`, `response_body jsonb`, `created_at timestamptz`.

- No foreign key from `bookings.room_id` to `rooms`: the room is owned by another service and existence is asked over NATS, as the request states.
- No foreign key from `idempotency_keys` to `bookings`: keys outlive deleted bookings.
- Delete is a hard delete.
- List order is `starts_at ASC, id ASC` so paging is stable for equal start times. Paging uses `skip = (page - 1) * limit`.

### D4. Idempotent create: one transaction with a transaction-scoped advisory lock

`BookingService.createBooking` runs these steps in order:

1. `BookingValidator` resolves both times (D6) and checks the order → 400.
2. Fast path: read the key row. If found, resolve it (same fingerprint → replay, else 422) and stop.
3. `RoomLookupClient` asks `RoomPatternEnum.FIND_BY_ID` → 404 / 503.
4. `IdempotentBookingRepository.create(command)` in one transaction:
   - `SELECT pg_try_advisory_xact_lock(hashtextextended(<key>, 0))`; `false` → outcome *in progress*.
   - read the key row; found → outcome *existing* with the row.
   - insert the booking, then insert the key row with the fingerprint, status 201 and the booking DTO as body → outcome *created*.
5. The service maps the outcome: *created* → enqueue the job (D7) and answer `{ booking, replayed: false }`; *existing* → the same resolution as step 2; *in progress* → 409.

Why this shape:

- The lock is held exactly as long as the transaction, so a concurrent request with the same key sees "in progress" while the first is storing, and sees the committed row afterwards. The primary key on `key` remains the last line of defence.
- A crash rolls the transaction back and releases the lock. No `IN_PROGRESS` row exists, so nothing can stay stuck and nothing needs a sweeper.
- Validation and the room check run before the transaction, so a rejected request stores nothing.
- Step 2 makes a replay independent of the room service and makes "key outcome before room outcome" deterministic. It is a read-only optimisation; correctness rests on step 4.

Alternatives considered: (a) insert an `IN_PROGRESS` row in a first transaction and complete it in a second, rejected because it breaks "one transaction" and leaves stuck keys after a crash; (b) plain `INSERT … ON CONFLICT DO NOTHING` without a lock, rejected because the second request then blocks until the first commits and 409 could never be answered; (c) an in-memory or Redis lock, rejected because it is not atomic with the insert.

The repository returns a named outcome type (a `type` union of *created*, *existing*, *in progress*) and takes a named command class; the transaction uses `DataSource.transaction` inside the repository only.

### D5. Fingerprint

SHA-256 (hex, Node `crypto`) of `JSON.stringify([roomId, title, organizerEmail, startsAt, endsAt])`, computed in the `booking` service from the validated DTO. The values are taken as sent, without normalisation; an array fixes the field order. Alternative: normalise times and email case first; rejected as extra rules with no requirement behind them, and recorded in the spec as observable behaviour.

### D6. Times

`booking-time.util.ts` turns a contract time string into a `Date`: a date-time without a zone designator gets `Z` appended before parsing; a result that is not a valid date raises 400 `BAD_REQUEST.VALIDATION` (the contract's `IsISO8601` also accepts week and ordinal dates that `Date` cannot parse). `booking.mapper.ts` writes every time with `toISOString()`. Columns are `timestamptz`, so the service's own time zone never matters.

For an update, the service reads the booking (404), merges the changes over the stored values, validates the merged pair, then calls `BookingRepository.update`. The `CHECK` constraint backs this up.

### D7. Confirmation job and worker

Producer (`confirmation-queue.producer.ts`): `queue.add(<name>, { bookingId }, { jobId: confirmationJobId(id), attempts: CONFIRMATION_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS } })`, called by the service after the transaction committed. Completed jobs keep BullMQ's default retention, so the job id keeps deduplicating.

Worker, per job run, with `attempt = job.attemptsMade + 1`:

1. `BookingClient` reads the booking over `BookingPatternEnum.FIND_BY_ID`. `NOT_FOUND.BOOKING` → return (job completes, no retry). Any other error is thrown and BullMQ retries.
2. If `confirmationStatus` is not `PENDING` → return.
3. `SimulatedConfirmationSender.deliver(organizerEmail, attempt)` → boolean, a pure function of its two arguments.
4. Report over `BookingPatternEnum.RECORD_CONFIRMATION`: delivered → `SENT`; not delivered and `attempt >= CONFIRMATION_JOB_ATTEMPTS` → `FAILED`; otherwise `PENDING`; always with `attempts = attempt`.
5. Not delivered → throw, so BullMQ applies the backoff or marks the job failed.

`ConfirmationProcessor` only extracts `bookingId` and the attempt and delegates to `ConfirmationService`.

Booking side (`BookingRepository.recordConfirmation`): one statement, `UPDATE bookings SET confirmation_status, confirmation_attempts WHERE id = :id AND confirmation_status = 'PENDING' AND confirmation_attempts <= :attempts`. Zero affected rows is not an error. This single conditional update is what makes repeats, late reports and deleted bookings harmless; step 2 in the worker only saves a pointless send.

Alternative for the attempt number: `booking.confirmationAttempts + 1`. Rejected: a duplicate run of the same attempt would then advance the count, whereas `job.attemptsMade` gives the same answer for the same attempt.

### D8. Errors across services

`isErrorResponse` moves from `rpc-exception.filter.ts` to an exported `error-response.guard.ts` (the filter imports it; behaviour unchanged). `RoomLookupClient` uses it to re-raise `NOT_FOUND.ROOM` through `ExceptionHelper.notFound`; the worker's `BookingClient` uses it to recognise `NOT_FOUND.BOOKING`. `UNAVAILABLE.SERVICE` is already raised as an `RpcException` by `NatsRequestUtil` and passes through.

### D9. Web page

`views/bookings/`: `bookings-page.tsx` (state, loading, error, paging, filter), `bookings-table.tsx`, `booking-room-filter.tsx`, `booking-create-form.tsx`, `booking-edit-dialog.tsx`, `booking-delete-dialog.tsx`, `booking-time-format.ts`. `services/booking.service.ts` exports `listBookings`, `createBooking(booking, idempotencyKey)`, `updateBooking`, `deleteBooking`.

- Rooms for the filter and for room names come from the existing `listRooms(1, MAX_PAGE_SIZE)`; `room.service.ts` is not changed.
- `roomId` is left out of the request when "All rooms" is chosen (an empty value is a 400).
- Forms use `react-hook-form` with its built-in rules and no schema resolver, because the installed resolver package does not support the installed `react-hook-form`. Alternative: hand-written state; rejected as more code for the same result.
- Times: `datetime-local` inputs labelled UTC; `booking-time-format.ts` converts `YYYY-MM-DDTHH:mm` ↔ ISO UTC and renders `YYYY-MM-DD HH:mm`. Alternative: the browser's local zone; rejected because output would depend on the machine and the API speaks UTC.
- Idempotency key: the create form holds the key in a ref. Submit uses the held key or generates one with `uuid`'s `v4`; the key is dropped on success and whenever a field changes (a `watch` subscription). This is a superset of "reuse after a network error": the same contents always travel with the same key, so a retry after an unanswered request, a 409 or a 503 can never create a second booking, and a changed body can never hit 422.
- Errors: `e instanceof Error ? e.message : String(e)`, the same expression as the rooms page, shown in an `Alert` on the page (load, delete) or inside the form or dialog (create, update).

### D10. Tests

Unit tests sit next to each file and follow the existing styles: gateway controller over a real HTTP listener with a mocked NATS client (`room.controller.spec.ts`), services with mocked repositories, repositories with mocked TypeORM objects, web views with the service modules mocked. The concurrency guarantee cannot be shown with mocks; it is verified against the running stack in the last task group.

## Risks / Trade-offs

- [Redis is unreachable after the booking is committed, so no job is enqueued] → The create is not rolled back; the booking stays `PENDING`. The producer logs the failure and the service still answers 201. An outbox would close this gap and is a non-goal.
- [A NATS failure inside the worker consumes one of the three job attempts without a send] → The booking can end `PENDING` with fewer than 3 attempts if the `booking` service is down for the whole retry window (about 3 seconds). Accepted for a simulated sender.
- [Two different keys hash to the same 64-bit advisory lock] → One of two unrelated concurrent requests is answered 409 and succeeds on retry. Negligible probability, no data impact.
- [Concurrent updates of one booking each pass validation but combine into an invalid span] → The `CHECK` constraint rejects the second write; it surfaces as a 500. Accepted; a row lock would remove it if it ever matters.
- [`idempotency_keys` grows without bound] → Required ("keys do not expire").
- [No overlap check, so a room can be double-booked] → Stated assumption in the proposal; adding it later is a new requirement on `bookings-api`.
- [The page shows the status as of the last load] → Reloading the page shows the recorded outcome.
- [`uuid` under Jest's jsdom environment resolves to its browser build] → The first web task that uses it confirms it loads; if it does not, the key generator is isolated in the form and can be mocked in tests without changing behaviour.

## Migration Plan

1. `pnpm run migration:run` creates `bookings` and `idempotency_keys` (`stack:up` already runs it).
2. Start order is unchanged: `room`, `booking`, `worker`, `gateway`, `web`.
3. Rollback: `pnpm run migration:revert` drops both tables; the queue `booking-confirmation` can be left in Redis. No existing table or route changes, so reverting the code is sufficient.
