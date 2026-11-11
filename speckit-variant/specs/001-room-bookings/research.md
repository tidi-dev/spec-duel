# Research: Meeting-Room Bookings

**Feature**: `specs/001-room-bookings` | **Date**: 2026-11-10

The Technical Context had no open `NEEDS CLARIFICATION` after reading the repository: the stack, the
contract and the test tooling are all fixed by the existing code. The decisions below settle the design
questions the specification leaves to the plan. Facts marked *(verified)* were checked in this
repository's source or in the installed packages under `node_modules`; everything else is a design
choice or a stated assumption.

## R1. Where the idempotency key is validated

- **Decision**: A gateway guard (`IdempotencyKeyGuard`) on `POST /api/bookings` checks the
  `Idempotency-Key` header with `isUUID` from `class-validator` and raises
  `ExceptionHelper.badRequest(ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID, …)`.
- **Rationale**: The spec requires the key to be checked before the body. Guards run before pipes
  *(verified: `router-execution-context.js` calls `fnCanActivate` before the handler's pipes)*. A header
  pipe would not give that order: parameter pipes are resolved with `Promise.all` *(verified, same
  file)*, so the first rejection is not deterministic. The existing `RpcExceptionFilter` already turns
  the raised `RpcException` into `{ statusCode, errorCode, message }`.
- **Alternatives considered**: a pipe on `@Headers()` (order not guaranteed); validating in the
  `booking` service (the gateway is the layer that validates input, and a body error would win).

## R2. How the replay header is set while the controller stays thin

- **Decision**: A gateway interceptor (`IdempotencyReplayInterceptor`) receives the
  `CreateBookingResultDto` from the handler, sets `Idempotency-Replayed: true` when `replayed` is true
  and returns `result.booking` as the body. The handler is a single forwarding statement.
- **Rationale**: The contract's NATS answer is `{ booking, replayed }` but the HTTP body is the booking
  alone. Mapping it in an interceptor keeps the controller within the five-statement rule and keeps
  header handling out of the service layer.
- **Alternatives considered**: `@Res({ passthrough: true })` in the handler (puts branching in the
  controller).

## R3. Idempotent create: one transaction, in-progress and reuse detection

- **Decision**: The `booking` repository runs the whole claim in one transaction:
  1. `pg_try_advisory_xact_lock(hashtextextended('<key>:<fingerprint>', 0))` — not obtained means the
     same key with the same body is being processed now → outcome `IN_PROGRESS` (409).
  2. `pg_try_advisory_xact_lock(hashtextextended('<key>', 0))` — not obtained means the key is being
     processed with a different body → outcome `KEY_REUSED` (422).
  3. Read the idempotency row for the key. Present with the same fingerprint → `REPLAYED` with the
     stored body; present with another fingerprint → `KEY_REUSED`.
  4. Otherwise insert the booking and the idempotency row (key, fingerprint, response status 201,
     response body) → `CREATED`.

  The service maps the outcome to the answer; the repository holds no error codes.
- **Rationale**:
  - FR-013 requires claiming the key and inserting the booking in one transaction. Both writes and the
    locks live in one transaction, so a failed or crashed request leaves no row and no lock: the key
    stays usable, with no clean-up job.
  - FR-016 needs a real "in progress" answer. A row inserted by an open transaction is invisible to
    other transactions, and a plain conflicting insert would wait instead of answering. A try-lock
    answers immediately.
  - The edge case "same key, different body, first request still in progress → 422" needs the body to
    be distinguishable without reading the uncommitted row. Two locks do that: the holder of the key
    lock always also holds the lock for its own fingerprint, so a request that obtained its own
    fingerprint lock but not the key lock necessarily has a different body.
  - FR-017: the key lock plus the primary key on the idempotency table make two bookings for one key
    impossible.
  - Transaction-scoped advisory locks are released at commit or rollback, so nothing is left to
    release by hand. `hashtextextended` exists from PostgreSQL 11; the stack runs PostgreSQL 15
    *(verified: `docker-compose.yml`)*.
- **Consequences to know**:
  - "In progress" is the open claim transaction, not a stored status. The idempotency table therefore
    has no status column; a row exists only for a completed request.
  - The room check happens before the transaction (R4). Two same-key requests that overlap only during
    their room checks are both answered correctly (one creates, the other replays or gets 409), which
    is what acceptance scenario US2-7 allows.
  - A 64-bit hash collision between two different keys could cause a spurious 409 or 422 for a request
    that would otherwise succeed; it can never cause a duplicate booking. Accepted.
- **Alternatives considered**:
  - A committed `IN_PROGRESS` row written before the booking: makes in-progress and body mismatch
    trivially visible, but breaks "one transaction" and leaves a stuck key forever after a crash,
    because keys never expire.
  - `INSERT … ON CONFLICT DO NOTHING` alone: the second request blocks until the first commits and
    then replays; 409 would never be answered.
  - `SET LOCAL lock_timeout` and catching the timeout error: works, but uses an error as control flow
    and cannot tell a same-body from a different-body request.

## R4. Order of checks on create

- **Decision**:
  1. Gateway guard: idempotency key → 400 `BAD_REQUEST.IDEMPOTENCY_KEY`.
  2. Gateway validation pipe: body → 400 `BAD_REQUEST.VALIDATION`.
  3. `booking` service: plain read of the idempotency row. Same fingerprint → replay; other
     fingerprint → 422.
  4. `booking` service: times form valid instants and `endsAt` is later than `startsAt` → else 400.
  5. `booking` service asks the `room` service → 404 `NOT_FOUND.ROOM` or 503 `UNAVAILABLE.SERVICE`.
  6. Repository claim transaction (R3).
  7. Enqueue the confirmation job (R6) — only for outcome `CREATED`.
- **Rationale**: Steps 4 and 5 store nothing, so FR-018 holds without any clean-up. Step 3 lets a
  replay be answered from the stored response even when the `room` service is down, and without a
  needless NATS call; step 6 repeats the same check under the lock, which is what makes it safe.
- **Alternatives considered**: doing the room check inside the transaction (a transaction would stay
  open across a NATS call of up to 5 seconds, and the transaction must stay inside the repository).

## R5. Request fingerprint and "same body"

- **Decision**: `sha256` (Node's built-in `crypto`) over
  `JSON.stringify([roomId, title, organizerEmail, startsAt, endsAt])`, stored as 64 hex characters.
  The key is lower-cased before it is used for locks and storage.
- **Rationale**: A fixed field order makes JSON field order and whitespace irrelevant, as the spec
  assumes. Unknown fields are already removed by the gateway's `whitelist: true`.
- **Assumption**: values are compared as the strings the client sent. `2030-01-01T10:00:00Z` and
  `2030-01-01T10:00:00.000Z` are the same instant but different bodies (422). A retry resends the same
  bytes, so this does not affect the intended use.
- **Alternatives considered**: normalising times to instants before hashing (more rules to explain,
  no benefit for a retry).

## R6. Enqueueing the confirmation job

- **Decision**: After the claim transaction commits with outcome `CREATED`, a
  `ConfirmationQueueProducer` calls `queue.add(QueueEnum.BOOKING_CONFIRMATION, { bookingId }, { jobId:
  confirmationJobId(bookingId), attempts: CONFIRMATION_JOB_ATTEMPTS, backoff: { type: 'exponential',
  delay: CONFIRMATION_BACKOFF_MS } })`. The call is bounded by a 2-second timeout; a failure or a
  timeout is logged and the create still answers 201.
- **Rationale**:
  - The contract has no job-name constant and BullMQ needs one, so the queue name is reused rather than
    inventing a name.
  - Exponential backoff with a 1-second base retries after about 1 s and 2 s, so the third attempt ends
    about 3 seconds after creation — inside SC-004's 10 seconds.
  - BullMQ ignores an `add` whose job id already exists, which is what FR-021 relies on. Completed and
    failed jobs are therefore kept (no `removeOnComplete` / `removeOnFail`).
  - Without a bound, an `add` against an unreachable Redis can wait longer than the gateway's 5-second
    NATS timeout *(verified: `NATS_REQUEST_TIMEOUT_MS = 5000`)*, which would turn a stored booking into
    a 503. The spec requires 201.
- **To verify during implementation**: how `queue.add` behaves with Redis stopped (quickstart scenario
  9). The timeout makes the answer correct in either case.
- **Alternatives considered**: enqueueing inside the transaction (Redis is not transactional with
  Postgres); an outbox table with a relay (recovery is explicitly outside this feature).

## R7. Confirmation processing in the worker

- **Decision**: A BullMQ processor on `booking-confirmation` delegates to a `ConfirmationService`:
  1. Ask the `booking` service for the booking (`booking:findBookingById`). `NOT_FOUND.BOOKING` → end
     the job normally, without retries. Any other failure is thrown, so BullMQ retries.
  2. Booking already `SENT` or `FAILED` → end the job, report nothing.
  3. `attempt = job.attemptsMade + 1` *(verified: BullMQ increments `attemptsMade` when an attempt
     fails)*.
  4. `SimulatedConfirmationSender` decides from the address domain and the attempt number (FR-024).
  5. Success → report `SENT` with `attempt`. Failure on the last attempt → report `FAILED` with
     `attempt`. Failure with retries left → report `PENDING` with `attempt`, then throw so BullMQ
     schedules the retry.
- **Rationale**: The job payload is only `{ bookingId }` and the worker has no database, so it must ask
  for the address. Deriving the attempt number from the job keeps the worker stateless.
- **Alternatives considered**: putting the address in the job payload (the contract fixes the payload);
  keeping the attempt count in the worker (lost on restart).

## R8. Recording the confirmation outcome idempotently

- **Decision**: One conditional statement in the booking repository: update `confirmation_status` and
  `confirmation_attempts` where `id` matches, the current status is `PENDING` and the current attempts
  are not greater than the reported attempts. The handler then answers the booking as stored, or
  `null` when the booking no longer exists.
- **Rationale**: A single statement needs no transaction and gives FR-025 directly: a final booking is
  never changed, attempts never go down, a repeated report is a no-op, and a report for a deleted
  booking changes nothing.
- **Why the handler must answer a value**: a Nest request/response handler that returns `undefined`
  makes the caller's observable complete without a value *(verified: `client-proxy.js`
  `createObserver`)*, which `lastValueFrom` rejects. The same applies to `booking:deleteBooking`, which
  answers the deleted `BookingDto`.
- **Alternatives considered**: read–check–write in the service (needs a lock to be safe against a
  repeated report).

## R9. Update rule for the stored pair of times

- **Decision**: An update with no fields returns the stored booking unchanged. Otherwise the repository
  runs one conditional `UPDATE … RETURNING` that applies the sent fields only when the resulting
  `ends_at` is later than the resulting `starts_at`. When no row is returned, the service reads the
  booking to choose between 404 `NOT_FOUND.BOOKING` and 400 `BAD_REQUEST.VALIDATION`. The table also
  carries a `CHECK (ends_at > starts_at)` constraint as a last line of defence.
- **Rationale**: Two concurrent updates, each changing one time, cannot together store an invalid pair,
  and no transaction is needed.
- **Alternatives considered**: read, check in the service, then write (open to that race).

## R10. Rejecting `roomId` and `organizerEmail` on update

- **Decision**: The `PATCH` body uses a handler-level `ValidationPipe({ transform: true, whitelist:
  true, forbidNonWhitelisted: true })`.
- **Rationale**: The gateway's global pipe only strips unknown fields *(verified:
  `configure-gateway-app.ts`)*, which would answer 200. Changing the global pipe would change
  `GET /api/rooms`, whose spec expects unknown query fields to be dropped.
- **Assumption**: any unknown field on `PATCH` answers 400, not only those two. On `POST`, unknown
  fields are still dropped silently.

## R11. Times: parsing, storage and output

- **Decision**: Times are stored as `timestamp with time zone` and answered with `toISOString()`. The
  `booking` service turns each time into an instant with `new Date(value)`; a value that passes
  `IsISO8601({ strict: true })` but does not parse (for example a week date) is answered 400
  `BAD_REQUEST.VALIDATION`.
- **Assumption**: clients send an offset or `Z` (the web page always does). A date-time without one is
  read by JavaScript's rules in the service's time zone; the contract DTO cannot be tightened inside
  this feature.

## R12. Errors forwarded from the `room` service

- **Decision**: The `booking` service's `RoomClient` re-raises an `{ statusCode, errorCode, message }`
  rejection as an `RpcException`. The type guard `isErrorResponse` moves from
  `rpc-exception.filter.ts` into its own exported file in `libs/backend-common` so the booking service
  and the worker can reuse it.
- **Rationale**: A NATS error reaches the caller as a plain object, and a Nest microservice answers
  anything that is not an `RpcException` as a generic internal error; the 404 `NOT_FOUND.ROOM` would be
  lost on its way to the gateway.

## R13. Where entities and migrations live

- **Decision**: `BookingEntity` and `IdempotencyKeyEntity` go in `libs/backend-common/src/lib/entities`,
  with two new migrations next to the existing ones; both are added to `data-source.ts` and exported.
- **Rationale**: That is where `RoomEntity` and its migrations are, and `pnpm run migration:run` reads
  that data source. Only `libs/contract`, `apps/room` and the `/rooms` page are frozen.
- **No foreign key** from `bookings.room_id` to `rooms`: rooms belong to another service and the room
  check is made over NATS, as FR-010 requires.

## R14. Web page

- **Decision**:
  - Form state and validation with `react-hook-form`, `yup` and `@hookform/resolvers`; the key from
    `uuid` (`v4`). All four are already dependencies.
  - `useIdempotencyKey` keeps the key in a ref: created on the first submit, kept when the request
    fails without an answer, dropped when the request was answered or any form field changes.
  - "Answered" is told apart by type: the existing API client throws `ApiError` only when the API
    answered and rethrows the raw error otherwise *(verified: `api-client.ts`)*.
  - Start and end use `datetime-local` inputs; values go to the API through `toISOString()` and are
    shown with `toLocaleString()`.
  - The room filter and the room names come from `listRooms(1, MAX_PAGE_SIZE)`, the existing service
    function, unchanged. The table pages at `DEFAULT_PAGE_SIZE`.
- **CORS**: the gateway's `enableCors({ origin })` already allows the `Idempotency-Key` request header
  and the `PATCH` and `DELETE` methods through the default preflight handling. `Idempotency-Replayed`
  is not exposed to browser code; the page does not need it.

## Observation outside this feature

`apps/room/src/room/room.repository.ts` computes `skip` as `(page - 1) * DEFAULT_PAGE_SIZE` instead of
`(page - 1) * limit`, so `GET /api/rooms?page=2&limit=5` returns rooms 11–12 instead of 6–10. The
bookings page only requests page 1, so it is not affected, and the `room` service is frozen for this
feature (FR-033). It is recorded here so it can be handled as a separate change.
