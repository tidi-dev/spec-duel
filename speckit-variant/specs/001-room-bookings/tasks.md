---

description: "Task list for the Meeting-Room Bookings feature"
---

# Tasks: Meeting-Room Bookings

**Input**: Design documents from `/specs/001-room-bookings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (gateway-http-api.md, service-messages.md, bookings-page.md), quickstart.md

**Tests**: Included. FR-034 and Constitution Principle V (Test-First, non-negotiable) require them: every spec task is done first and MUST fail before the implementation task that follows it.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Every task names the exact file it creates or edits

## Path Conventions

Nx monorepo, paths from the repository root: `libs/backend-common/src/lib/…`, `apps/gateway/src/booking/…`, `apps/booking/src/booking/…`, `apps/worker/src/confirmation/…`, `apps/web/src/…`. A spec sits next to its source file as `*.spec.ts` / `*.spec.tsx`.

## Rules that apply to every task

- Routes, patterns, DTO classes, error codes, header names, the queue name and constants are imported from `@roombook/contract`; nothing is added to or changed in `libs/contract`, `apps/room`, `apps/web/src/views/rooms`, `apps/web/src/pages/rooms` or `apps/web/src/services/room.service.ts` (FR-033).
- Errors are raised with `ExceptionHelper` from `@roombook/backend-common` and an `ErrorCodeEnum` value.
- No `interface`, no `any`, no inline object type as a parameter, explicit return type on every repository method, named imports only, kebab-case file names, every file under 200 lines, no narrative comments.
- Transactions only in repositories. No dependency is added. `.env` files are never read. Git stays local.

## Assumptions made in this task list

1. Specs are written for services, repositories, controllers, the guard, the interceptor, the processor, clients, utils, hooks and components. Modules, entities, migrations, `claim-booking-result.dto.ts` and `pages/bookings/index.tsx` get no spec of their own, as `room.module.ts`, `room.entity.ts`, the room migrations and `pages/rooms/index.tsx` have none today.
2. To keep User Story 1 testable on its own, its create path already writes the booking and the idempotency row in one transaction (the `CREATED` outcome) and the gateway interceptor already unwraps the booking. User Story 2 adds the key guard, the two advisory locks and the other three outcomes to the same files. Until User Story 2 is done, a create without a valid key or with a reused key is not answered as specified.
3. Error `message` texts are not fixed by the contract; the texts given in the tasks are the ones to use.
4. The simulated sender compares the address domain case-insensitively.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the starting point; the project, tooling and dependencies already exist.

- [X] T001 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root and confirm all three pass before any change; stop and report if one fails

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage, the shared error guard and the two pure helpers every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write the failing spec `libs/backend-common/src/lib/errors/error-response.guard.spec.ts`: `isErrorResponse` is true for `{ statusCode: number, errorCode: string, message: string }` and false for `null`, a string, and an object missing or mistyping any of the three fields
- [X] T003 Create `libs/backend-common/src/lib/errors/error-response.guard.ts` exporting `isErrorResponse` (moved unchanged out of `rpc-exception.filter.ts`), import it in `libs/backend-common/src/lib/errors/rpc-exception.filter.ts`, and export it from `libs/backend-common/src/index.ts`; `rpc-exception.filter.spec.ts` must stay green
- [X] T004 [P] Create `BookingEntity` (table `bookings`) in `libs/backend-common/src/lib/entities/booking.entity.ts` with: `id` `uuid` primary key `PK_bookings_id`, default `gen_random_uuid()`; `room_id` `uuid` not null, no foreign key; `title` `character varying(120)` not null; `organizer_email` `character varying(320)` not null; `starts_at` and `ends_at` `timestamp with time zone` not null; `confirmation_status` `character varying(10)` not null, default `PENDING`, typed `ConfirmationStatusEnum`; `confirmation_attempts` `integer` not null, default 0; `created_at` and `updated_at` `timestamp with time zone` not null, default `now()`; checks `CK_bookings_time_range` (`ends_at > starts_at`) and `CK_bookings_confirmation_status` (limits it to `PENDING`, `SENT`, `FAILED`); indexes `IDX_bookings_starts_at` on (`starts_at`, `id`) and `IDX_bookings_room_id_starts_at` on (`room_id`, `starts_at`, `id`); properties in camelCase
- [X] T005 [P] Create `IdempotencyKeyEntity` (table `idempotency_keys`) in `libs/backend-common/src/lib/entities/idempotency-key.entity.ts` with: `key` `uuid` primary key `PK_idempotency_keys_key` (not generated); `request_fingerprint` `character(64)` not null; `response_status` `smallint` not null; `response_body` `jsonb` not null, typed `BookingDto`; `created_at` `timestamp with time zone` not null, default `now()`; no status column, no foreign key to `bookings`
- [X] T006 [P] Create migration class `CreateBookings1731200000002` in `libs/backend-common/src/lib/database/migrations/1731200000002-create-bookings.ts`: `up` creates table `bookings` with exactly the columns, defaults, `PK_bookings_id`, `CK_bookings_time_range`, `CK_bookings_confirmation_status`, `IDX_bookings_starts_at` and `IDX_bookings_room_id_starts_at` listed in T004; `down` drops the table; follow the style of `1731200000000-create-rooms.ts`
- [X] T007 [P] Create migration class `CreateIdempotencyKeys1731200000003` in `libs/backend-common/src/lib/database/migrations/1731200000003-create-idempotency-keys.ts`: `up` creates table `idempotency_keys` with exactly the columns and `PK_idempotency_keys_key` listed in T005; `down` drops the table
- [X] T008 Register the new storage: add both migrations in timestamp order to `libs/backend-common/src/lib/database/migrations/index.ts`, add `BookingEntity` and `IdempotencyKeyEntity` to `entities` in `libs/backend-common/src/lib/database/data-source.ts`, and export both entities from `libs/backend-common/src/index.ts` (after T003, same file)
- [X] T009 [P] Write the failing spec `apps/booking/src/booking/booking.mapper.spec.ts`: `toBookingDto(entity)` returns every `BookingDto` field in camelCase and answers `startsAt`, `endsAt`, `createdAt` and `updatedAt` with `toISOString()`
- [X] T010 Create `apps/booking/src/booking/booking.mapper.ts` exporting `toBookingDto(entity: BookingEntity): BookingDto` so T009 passes
- [X] T011 [P] Write the failing spec `apps/booking/src/booking/booking-time-range.util.spec.ts`: `parseBookingInstant` returns a `Date` for `2030-01-07T09:00:00.000Z` and `null` for a value that does not parse to an instant (for example the week date `2030-W02-1`); `isEndAfterStart` is true only when the end is strictly later, false when equal or earlier
- [X] T012 Create `apps/booking/src/booking/booking-time-range.util.ts` exporting `parseBookingInstant(value: string): Date | null` (uses `new Date(value)`) and `isEndAfterStart(startsAt: Date, endsAt: Date): boolean` so T011 passes

**Checkpoint**: `pnpm run build` and `pnpm run test` pass; user story work can begin.

---

## Phase 3: User Story 1 - Book a room and manage the booking (Priority: P1) 🎯 MVP

**Goal**: Five routes under `/api/bookings` on the gateway forward over NATS to the `booking` service, which validates, checks the room, stores, lists, reads, updates and deletes bookings.

**Independent Test**: Through the gateway alone, create a booking for an existing room with a UUID `Idempotency-Key`, list it, read it, change its end time, delete it, and confirm that reading it afterwards answers 404 `NOT_FOUND.BOOKING` (quickstart scenarios 1 and 2).

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T013 [P] [US1] Write the failing spec `apps/booking/src/booking/booking-fingerprint.util.spec.ts`: `bookingFingerprint` returns 64 lower-case hex characters, the same value for the same five field values whatever the property order, and a different value when any one of `roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt` differs (including `2030-01-01T10:00:00Z` vs `2030-01-01T10:00:00.000Z`)
- [X] T014 [P] [US1] Write the failing spec `apps/booking/src/booking/booking.repository.spec.ts` with the TypeORM repository mocked (pattern of `apps/room/src/room/room.repository.spec.ts`): `findPage` orders by `startsAt` ASC then `id` ASC with `skip = (page - 1) * limit` and `take = limit`, and applies `roomId` to rows and total only when given; `findById` returns the entity or `null`; `updateIfTimeRangeValid` applies only the sent fields, sets `updated_at`, and returns `null` when no row matched; `deleteById` returns the deleted entity or `null`
- [X] T015 [P] [US1] Write the failing spec `apps/booking/src/booking/idempotent-booking.repository.spec.ts` with the `DataSource` mocked: `claim(key, fingerprint, booking)` inserts the booking and the idempotency row (key, fingerprint, `response_status` 201, `response_body` the mapped `BookingDto`) inside one `dataSource.transaction` call and returns outcome `CREATED` with that `BookingDto`; an error on the second insert rejects so nothing is committed
- [X] T016 [P] [US1] Write the failing spec `apps/booking/src/booking/room.client.spec.ts` with the NATS `ClientProxy` mocked: `findRoomById` sends `RoomPatternEnum.FIND_BY_ID` with `{ id }` and returns the `RoomDto`; a plain `{ statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message }` rejection is re-raised as an `RpcException` carrying the same object; an `RpcException` for 503 `UNAVAILABLE.SERVICE` passes through unchanged
- [X] T017 [P] [US1] Write the failing spec `apps/booking/src/booking/booking.service.spec.ts` with `BookingRepository` mocked: `listBookings` returns `{ items, total, page, limit }` with mapped items; `findBookingById` returns the DTO or raises 404 `NOT_FOUND.BOOKING`; `updateBooking` with no fields returns the stored booking unchanged without calling the update (404 when missing), raises 400 `BAD_REQUEST.VALIDATION` for a time that does not parse, returns the updated DTO, and when the repository update returns `null` raises 404 `NOT_FOUND.BOOKING` if the booking is missing or 400 `BAD_REQUEST.VALIDATION` if it exists; `deleteBooking` returns the deleted DTO or raises 404 `NOT_FOUND.BOOKING`
- [X] T018 [P] [US1] Write the failing spec `apps/booking/src/booking/create-booking.service.spec.ts` with `RoomClient` and `IdempotentBookingRepository` mocked: a time that does not parse, or `endsAt` equal to or earlier than `startsAt`, raises 400 `BAD_REQUEST.VALIDATION` without asking the room service or claiming; a room error (404 `NOT_FOUND.ROOM`, 503 `UNAVAILABLE.SERVICE`) propagates and nothing is claimed; a valid request claims with the lower-cased key and the fingerprint and returns `{ booking, replayed: false }`
- [X] T019 [P] [US1] Write the failing spec `apps/booking/src/booking/booking.controller.spec.ts` with both services mocked: each of `BookingPatternEnum.CREATE`, `LIST`, `FIND_BY_ID`, `UPDATE` and `DELETE` delegates to one service method with the payload and returns its result
- [X] T020 [P] [US1] Write the failing spec `apps/gateway/src/booking/idempotency-replay.interceptor.spec.ts`: for a handler result `{ booking, replayed: false }` the body becomes `booking` and no header is set; for `replayed: true` the body is `booking` and the response header `IDEMPOTENCY_REPLAYED_HEADER` is set to `true`
- [X] T021 [P] [US1] Write the failing spec `apps/gateway/src/booking/booking.controller.spec.ts` (pattern of `apps/gateway/src/room/room.controller.spec.ts`, NATS client mocked): `POST` forwards `BookingPatternEnum.CREATE` with `{ idempotencyKey, booking }`; `GET` forwards `LIST` with the query; `GET :id` forwards `FIND_BY_ID` with `{ id }`; `PATCH :id` forwards `UPDATE` with `{ id, changes }`; `DELETE :id` forwards `DELETE` with `{ id }` and returns nothing

### Implementation for User Story 1

- [X] T022 [P] [US1] Create `apps/booking/src/booking/booking-fingerprint.util.ts` exporting `bookingFingerprint(booking: CreateBookingDto): string` — sha256 hex (`createHash` from `node:crypto`) of `JSON.stringify([roomId, title, organizerEmail, startsAt, endsAt])` (T013 passes)
- [X] T023 [P] [US1] Create `apps/booking/src/booking/claim-booking-result.dto.ts` exporting `enum ClaimBookingOutcomeEnum { CREATED, REPLAYED, KEY_REUSED, IN_PROGRESS }` (string values equal to the names) and `class ClaimBookingResultDto { outcome: ClaimBookingOutcomeEnum; booking: BookingDto | null }`
- [X] T024 [P] [US1] Create `apps/booking/src/booking/booking.repository.ts` with `findPage(query: ListBookingsQueryDto): Promise<[BookingEntity[], number]>`, `findById(id: string): Promise<BookingEntity | null>`, `updateIfTimeRangeValid(id: string, changes: UpdateBookingDto): Promise<BookingEntity | null>` (one conditional `UPDATE … RETURNING` that applies the sent fields and `updated_at = now()` only where the resulting `ends_at` is later than the resulting `starts_at`) and `deleteById(id: string): Promise<BookingEntity | null>` (one `DELETE … RETURNING`); no transaction (T014 passes)
- [X] T025 [US1] Create `apps/booking/src/booking/idempotent-booking.repository.ts` with `claim(key: string, fingerprint: string, booking: CreateBookingDto): Promise<ClaimBookingResultDto>`: in one `dataSource.transaction`, insert the booking, map it with `toBookingDto`, insert the `IdempotencyKeyEntity` row (`responseStatus` `HttpStatus.CREATED`, `responseBody` the DTO) and return outcome `CREATED` (T015 passes; depends on T010, T023)
- [X] T026 [P] [US1] Create `apps/booking/src/booking/room.client.ts`: injectable `RoomClient` with `findRoomById(id: string): Promise<RoomDto>` using `NatsRequestUtil.send` on `NATS_CLIENT` with `RoomPatternEnum.FIND_BY_ID` and `RoomIdMessageDto`; a rejection for which `isErrorResponse` is true is re-raised as `new RpcException(error)`, any other error is rethrown (T016 passes)
- [X] T027 [US1] Create `apps/booking/src/booking/booking.service.ts` with `listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto>`, `findBookingById(id: string): Promise<BookingDto>`, `updateBooking(message: UpdateBookingMessageDto): Promise<BookingDto>` and `deleteBooking(id: string): Promise<BookingDto>` as specified in T017; messages `Booking not found`, `startsAt and endsAt must be valid date-times`, `endsAt must be later than startsAt` (depends on T010, T012, T024)
- [X] T028 [US1] Create `apps/booking/src/booking/create-booking.service.ts` with `createBooking(message: CreateBookingMessageDto): Promise<CreateBookingResultDto>`: lower-case the key, compute the fingerprint, check both times parse and `endsAt` is later than `startsAt` (else 400 `BAD_REQUEST.VALIDATION`), call `RoomClient.findRoomById(booking.roomId)`, call `IdempotentBookingRepository.claim`, return `{ booking, replayed: false }` (T018 passes; depends on T012, T022, T025, T026)
- [X] T029 [US1] Create `apps/booking/src/booking/booking.controller.ts` with one `@MessagePattern` handler per pattern `BookingPatternEnum.CREATE` (`CreateBookingMessageDto` → `CreateBookingResultDto`), `LIST` (`ListBookingsQueryDto` → `PagedBookingsDto`), `FIND_BY_ID`, `UPDATE` (`UpdateBookingMessageDto`) and `DELETE` (`BookingIdMessageDto` → the deleted `BookingDto`), each a single delegating statement (T019 passes)
- [X] T030 [US1] Create `apps/booking/src/booking/booking.module.ts` (`TypeOrmModule.forFeature([BookingEntity, IdempotencyKeyEntity])`, controller `BookingController`, providers `BookingService`, `CreateBookingService`, `BookingRepository`, `IdempotentBookingRepository`, `RoomClient`) and edit `apps/booking/src/app/app.module.ts` to import `NatsClientModule` and `BookingModule`
- [X] T031 [P] [US1] Create `apps/gateway/src/booking/idempotency-replay.interceptor.ts`: `IdempotencyReplayInterceptor` maps the handler's `CreateBookingResultDto` to `result.booking` and sets the response header `IDEMPOTENCY_REPLAYED_HEADER` to `true` only when `result.replayed` is true (T020 passes)
- [X] T032 [US1] Create `apps/gateway/src/booking/booking.controller.ts` on `@Controller(ApiRouteEnum.BOOKINGS)`, each handler one `NatsRequestUtil.send` statement: `POST` (`@UseInterceptors(IdempotencyReplayInterceptor)`, `@Headers(IDEMPOTENCY_KEY_HEADER)` key and `@Body() CreateBookingDto`, answers 201); `GET` with `@Query() ListBookingsQueryDto`; `GET :id`, `PATCH :id` and `DELETE :id` with `@Param('id', ParseUUIDPipe)`; `PATCH` body `UpdateBookingDto` through a handler-level `new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })`; `DELETE` with `@HttpCode(204)` returning `Promise<void>` (T021 passes; depends on T031)
- [X] T033 [US1] Create `apps/gateway/src/booking/booking.module.ts` (controller `BookingController`, provider `IdempotencyReplayInterceptor`) and edit `apps/gateway/src/app/app.module.ts` to import `BookingModule`

**Checkpoint**: `pnpm run test` passes; quickstart scenarios 1 and 2 pass against the running stack. A booking stays `PENDING` with 0 attempts until User Story 3.

---

## Phase 4: User Story 2 - Retry a create safely (Priority: P2)

**Goal**: The `Idempotency-Key` is required and checked before the body; the same key and body replay the stored answer; a different body answers 422; a create in progress answers 409; two simultaneous creates never store two bookings.

**Independent Test**: Send the same create twice with one key and observe one booking and an identical second answer with `Idempotency-Replayed: true`; then vary the body, the key and the timing to observe 400, 422 and 409 (quickstart scenarios 3–6).

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T034 [P] [US2] Write the failing spec `apps/gateway/src/booking/idempotency-key.guard.spec.ts`: a request whose `idempotency-key` header is a UUID is allowed; a missing header and the value `abc` raise 400 `BAD_REQUEST.IDEMPOTENCY_KEY` (`ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID`)
- [X] T035 [US2] Extend `apps/gateway/src/booking/booking.controller.spec.ts`: the `POST` handler carries `IdempotencyKeyGuard` (guard metadata on the handler), so the key is checked before the body pipe
- [X] T036 [US2] Extend `apps/booking/src/booking/idempotent-booking.repository.spec.ts`: `findByKey` returns the row or `null`; inside the transaction `claim` first tries `pg_try_advisory_xact_lock(hashtextextended('<key>:<fingerprint>', 0))` and returns `IN_PROGRESS` when not obtained, then `pg_try_advisory_xact_lock(hashtextextended('<key>', 0))` and returns `KEY_REUSED` when not obtained, then reads the row: same fingerprint → `REPLAYED` with the stored `response_body`, other fingerprint → `KEY_REUSED`, no row → inserts and returns `CREATED`; nothing is inserted for the first three outcomes
- [X] T037 [US2] Extend `apps/booking/src/booking/create-booking.service.spec.ts`: a stored row with the same fingerprint is answered `{ booking: <stored body>, replayed: true }` without validating times, asking the room service or claiming; a stored row with another fingerprint raises 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`; claim outcomes map to `REPLAYED` → `replayed: true` with the stored booking, `KEY_REUSED` → 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`, `IN_PROGRESS` → 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS`; after a failed time check or room check the same key with a corrected body is created (nothing stored against the key)

### Implementation for User Story 2

- [X] T038 [P] [US2] Create `apps/gateway/src/booking/idempotency-key.guard.ts`: `IdempotencyKeyGuard` reads `request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]`, returns true when `isUUID` (from `class-validator`) accepts it, otherwise calls `ExceptionHelper.badRequest(ErrorCodeEnum.IDEMPOTENCY_KEY_INVALID, 'Idempotency-Key header must be a UUID')` (T034 passes)
- [X] T039 [US2] Add `@UseGuards(IdempotencyKeyGuard)` to the `POST` handler in `apps/gateway/src/booking/booking.controller.ts` and register the guard as a provider in `apps/gateway/src/booking/booking.module.ts` (T035 passes)
- [X] T040 [US2] Extend `apps/booking/src/booking/idempotent-booking.repository.ts`: add `findByKey(key: string): Promise<IdempotencyKeyEntity | null>` and, at the start of the `claim` transaction, the two try-locks and the row read in the order given in T036 (research R3); the repository returns outcomes only and holds no error codes (T036 passes)
- [X] T041 [US2] Extend `apps/booking/src/booking/create-booking.service.ts` to the order of research R4: plain `findByKey` read (same fingerprint → replay, other → 422 `Idempotency-Key was already used with a different request body`), then the time checks, the room check, the claim, and the mapping of the claim outcome (`IN_PROGRESS` → 409 `A request with this Idempotency-Key is still being processed`) (T037 passes)

**Checkpoint**: `pnpm run test` passes; quickstart scenarios 3, 4, 5 and 6 pass against the running stack.

---

## Phase 5: User Story 3 - Get a confirmation (Priority: P3)

**Goal**: Each created booking gets exactly one job on `booking-confirmation`; the worker runs the simulated sender and reports every attempt over NATS; the `booking` service records the outcome idempotently.

**Independent Test**: Create three bookings with organizer addresses in an ordinary domain, `@retry.example` and `@bounce.example`; after 10 seconds they read `SENT`/1, `SENT`/3 and `FAILED`/3 (quickstart scenarios 7–9).

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T042 [P] [US3] Write the failing spec `apps/booking/src/booking/confirmation-queue.producer.spec.ts` with the BullMQ `Queue` mocked: `enqueue(bookingId)` calls `queue.add(QueueEnum.BOOKING_CONFIRMATION, { bookingId }, { jobId: confirmationJobId(bookingId), attempts: CONFIRMATION_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS } })` with no `removeOnComplete` / `removeOnFail`; a rejected `add` and an `add` that does not settle within 2 seconds (fake timers) both resolve without throwing and log an error
- [X] T043 [US3] Extend `apps/booking/src/booking/create-booking.service.spec.ts`: outcome `CREATED` enqueues once with the booking id after the claim; a pre-read replay, and outcomes `REPLAYED`, `KEY_REUSED` and `IN_PROGRESS`, enqueue nothing
- [X] T044 [US3] Extend `apps/booking/src/booking/booking.repository.spec.ts`: `recordConfirmationResult` runs one conditional update of `confirmation_status`, `confirmation_attempts` and `updated_at` where `id` matches, the stored status is `PENDING` and the stored attempts are not greater than the reported attempts, then returns the row as stored, or `null` when the booking does not exist
- [X] T045 [US3] Extend `apps/booking/src/booking/booking.service.spec.ts`: `recordConfirmationResult` returns the mapped stored booking, returns `null` for a missing booking, and never raises
- [X] T046 [US3] Extend `apps/booking/src/booking/booking.controller.spec.ts`: `BookingPatternEnum.RECORD_CONFIRMATION` delegates to `BookingService.recordConfirmationResult` and answers its value, `null` included
- [X] T047 [P] [US3] Write the failing spec `apps/worker/src/confirmation/simulated-confirmation-sender.spec.ts`: an address ending in `@retry.example` fails on attempts 1 and 2 and succeeds on attempt 3; ending in `@bounce.example` fails on attempts 1, 2 and 3; any other address succeeds on attempt 1; the domain is matched case-insensitively
- [X] T048 [P] [US3] Write the failing spec `apps/worker/src/confirmation/booking.client.spec.ts` with the NATS `ClientProxy` mocked: `findBooking` sends `BookingPatternEnum.FIND_BY_ID` with `{ id }`, returns the `BookingDto`, returns `null` for a rejection whose `errorCode` is `NOT_FOUND.BOOKING`, and rethrows any other rejection; `recordResult` sends `BookingPatternEnum.RECORD_CONFIRMATION` with the `RecordConfirmationResultDto`
- [X] T049 [P] [US3] Write the failing spec `apps/worker/src/confirmation/confirmation.service.spec.ts` with `BookingClient` and the sender mocked, one case per row of the table "Processing of one attempt" in `contracts/service-messages.md`: booking not found → no report, resolves; booking already `SENT` or `FAILED` → no report, resolves; sender succeeds → reports `SENT` with the attempt, resolves; sender fails with retries left → reports `PENDING` with the attempt, then rejects; sender fails on attempt `CONFIRMATION_JOB_ATTEMPTS` → reports `FAILED` with the attempt, then rejects; `findBooking` rejecting → no report, rejects
- [X] T050 [P] [US3] Write the failing spec `apps/worker/src/confirmation/confirmation.processor.spec.ts`: `process(job)` calls `ConfirmationService.processAttempt(job.data.bookingId, job.attemptsMade + 1)` and propagates its rejection

### Implementation for User Story 3

- [X] T051 [P] [US3] Create `apps/booking/src/booking/confirmation-queue.producer.ts`: `ConfirmationQueueProducer` with `@InjectQueue(QueueEnum.BOOKING_CONFIRMATION)` and `enqueue(bookingId: string): Promise<void>` that makes the `queue.add` call of T042 bounded by the code constant `CONFIRMATION_ENQUEUE_TIMEOUT_MS = 2000`, logs a failure or timeout with the Nest `Logger` and never throws (T042 passes)
- [X] T052 [US3] Edit `apps/booking/src/booking/booking.module.ts`: import `BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION })` and add `ConfirmationQueueProducer` to the providers
- [X] T053 [US3] Extend `apps/booking/src/booking/create-booking.service.ts`: after a claim with outcome `CREATED`, await `ConfirmationQueueProducer.enqueue(booking.id)` and then answer 201; no enqueue on any other path (T043 passes)
- [X] T054 [US3] Add `recordConfirmationResult(report: RecordConfirmationResultDto): Promise<BookingEntity | null>` to `apps/booking/src/booking/booking.repository.ts` as specified in T044 (single conditional statement, no transaction) (T044 passes)
- [X] T055 [US3] Add `recordConfirmationResult(report: RecordConfirmationResultDto): Promise<BookingDto | null>` to `apps/booking/src/booking/booking.service.ts` (T045 passes)
- [X] T056 [US3] Add the `BookingPatternEnum.RECORD_CONFIRMATION` handler to `apps/booking/src/booking/booking.controller.ts`, answering `BookingDto | null` and never `undefined` (T046 passes)
- [X] T057 [P] [US3] Create `apps/worker/src/confirmation/simulated-confirmation-sender.ts`: injectable `SimulatedConfirmationSender` with `send(organizerEmail: string, attempt: number): boolean` using `RETRY_EMAIL_DOMAIN` (true from attempt `CONFIRMATION_JOB_ATTEMPTS`) and `BOUNCE_EMAIL_DOMAIN` (always false); every other address true; nothing is sent anywhere (T047 passes)
- [X] T058 [P] [US3] Create `apps/worker/src/confirmation/booking.client.ts`: injectable `BookingClient` on `NATS_CLIENT` with `findBooking(id: string): Promise<BookingDto | null>` and `recordResult(report: RecordConfirmationResultDto): Promise<BookingDto | null>` using `NatsRequestUtil.send` and `isErrorResponse` (T048 passes)
- [X] T059 [US3] Create `apps/worker/src/confirmation/confirmation.service.ts`: `ConfirmationService.processAttempt(bookingId: string, attempt: number): Promise<void>` implementing the six rows of T049; a failed attempt throws an `Error` after its report so BullMQ retries or fails the job (T049 passes; depends on T057, T058)
- [X] T060 [US3] Create `apps/worker/src/confirmation/confirmation.processor.ts`: `@Processor(QueueEnum.BOOKING_CONFIRMATION)` class extending `WorkerHost` whose `process(job: Job<ConfirmationJobDto>): Promise<void>` is one delegating statement (T050 passes)
- [X] T061 [US3] Create `apps/worker/src/confirmation/confirmation.module.ts` (`BullModule.registerQueue({ name: QueueEnum.BOOKING_CONFIRMATION })`, providers `ConfirmationProcessor`, `ConfirmationService`, `SimulatedConfirmationSender`, `BookingClient`) and edit `apps/worker/src/app/app.module.ts` to import `NatsClientModule` and `ConfirmationModule`; no database import is added to the worker

**Checkpoint**: `pnpm run test` passes; quickstart scenarios 7, 8 and 9 pass against the running stack.

---

## Phase 6: User Story 4 - Manage bookings from the web page (Priority: P4)

**Goal**: `/bookings` in `apps/web` with a table, a room filter, a create form, edit and delete dialogs, loading, empty and error states, and an idempotency key that survives only a network error.

**Independent Test**: With `booking.service` and `room.service` mocked, render the page and exercise table, filter, create, edit, delete and the three states (`pnpm run test`); by hand at `/bookings` against the running stack (quickstart scenario 10).

### Tests for User Story 4 (write first, must fail) ⚠️

- [X] T062 [P] [US4] Write the failing spec `apps/web/src/services/booking.service.spec.ts` with `apiClient` mocked (pattern of `room.service.spec.ts`): `listBookings` gets `/bookings` with `page`, `limit` and `roomId` only when set; `createBooking` posts the body to `/bookings` with the header `Idempotency-Key` set to the given key; `updateBooking` patches `/bookings/:id`; `deleteBooking` deletes `/bookings/:id` and resolves with nothing
- [X] T063 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-date.util.spec.ts`: `toUtcIso` turns a `datetime-local` value into the UTC ISO string of the same local instant; `toLocalInputValue` turns an ISO string into `YYYY-MM-DDTHH:mm` local time and round-trips with `toUtcIso`; `formatDateTime` returns `new Date(iso).toLocaleString()`
- [X] T064 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-form.schema.spec.ts`: the create schema rejects a missing room, an empty title, a title longer than `BOOKING_TITLE_MAX_LENGTH` (120) characters, an invalid email, a missing start or end, and an end equal to or earlier than the start, and accepts a valid form; the edit schema applies the same title and time rules to title, start and end only
- [X] T065 [P] [US4] Write the failing spec `apps/web/src/views/bookings/use-idempotency-key.spec.ts`: `getKey()` returns a UUID v4 and the same value on every call until `release()`; after `release()` the next `getKey()` returns a different UUID
- [X] T066 [P] [US4] Write the failing spec `apps/web/src/views/bookings/use-bookings.spec.ts` with `booking.service` mocked: it loads page 1 with `DEFAULT_PAGE_SIZE` on mount and exposes `loading` until the answer; `setRoomId` reloads with that `roomId` from page 1 and clearing it removes the filter; `setPage` reloads that page; `reload` fetches again; a rejection exposes the error's `message` and no bookings
- [X] T067 [P] [US4] Write the failing spec `apps/web/src/views/bookings/bookings-table.spec.tsx`: a `table` named "Bookings" with columns Title, Room, Organizer, Start, End, Confirmation, Actions; the Room cell shows the room's name, or the room id when the room is not in the list; each row has buttons "Edit <title>" and "Delete <title>" that call their handlers with the booking; pagination shows `DEFAULT_PAGE_SIZE` rows per page and reports page changes
- [X] T068 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-room-filter.spec.tsx`: a `combobox` named "Room" with "All rooms" plus one option per room; choosing a room calls `onChange` with its id and choosing "All rooms" calls it with no room
- [X] T069 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-create-form.spec.tsx` with `booking.service` mocked: a `form` named "New booking" with Room, Title, Organizer email, Start, End and a "Create booking" button; an invalid form (for example end before start) shows a field error and sends no request; a valid submit calls `createBooking` with times as UTC ISO and a UUID key, then clears the form and calls `onCreated`; after a rejection that is not an `ApiError` an unchanged resubmit uses the same key; after an `ApiError` the alert shows its `message` and the next submit uses a new key; after a success the next submit uses a new key; changing any field after a network error gives a new key
- [X] T070 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-edit-dialog.spec.tsx` with `booking.service` mocked: a `dialog` named "Edit booking" prefilled with the booking's Title, Start and End; "Save" calls `updateBooking(id, { title, startsAt, endsAt })` with UTC ISO times and then `onSaved`; an `ApiError` shows its `message` in the dialog and keeps it open; "Cancel" calls `onClose` without a request
- [X] T071 [P] [US4] Write the failing spec `apps/web/src/views/bookings/booking-delete-dialog.spec.tsx` with `booking.service` mocked: a `dialog` named "Delete booking" asking for confirmation; "Delete" calls `deleteBooking(id)` and then `onDeleted`; "Cancel" sends nothing; an `ApiError` shows its `message` in the dialog
- [X] T072 [P] [US4] Write the failing spec `apps/web/src/views/bookings/bookings-page.spec.tsx` with `booking.service` and `room.service` mocked (pattern of `views/rooms/rooms-page.spec.tsx`): heading "Bookings"; rooms come from `listRooms(1, MAX_PAGE_SIZE)`; a progress bar labelled "Loading bookings" while loading; "No bookings found." instead of the table when the list is empty; an error alert with the error's message and no table when the load fails; the filter reloads the list for the chosen room; after a create, an edit and a confirmed delete the list is reloaded and shows the change
- [X] T073 [P] [US4] Extend `apps/web/src/layouts/app-layout.spec.tsx`: the main navigation has a "Bookings" link to `/bookings` after "Rooms", and the "Rooms" link is unchanged

### Implementation for User Story 4

- [X] T074 [P] [US4] Create `apps/web/src/services/booking.service.ts` exporting `listBookings(query: ListBookingsQueryDto): Promise<PagedBookingsDto>`, `createBooking(booking: CreateBookingDto, idempotencyKey: string): Promise<BookingDto>`, `updateBooking(id: string, changes: UpdateBookingDto): Promise<BookingDto>` and `deleteBooking(id: string): Promise<void>` on `apiClient` with `ApiRouteEnum.BOOKINGS` and `IDEMPOTENCY_KEY_HEADER`; DTO classes imported with `import type` (T062 passes)
- [X] T075 [P] [US4] Create `apps/web/src/views/bookings/booking-date.util.ts` exporting `toUtcIso`, `toLocalInputValue` and `formatDateTime` (T063 passes)
- [X] T076 [P] [US4] Create `apps/web/src/views/bookings/booking-form.schema.ts` exporting the yup schemas `createBookingFormSchema` and `editBookingFormSchema` and the `type`s `CreateBookingFormValues` and `EditBookingFormValues`, with the rules of T064 and `BOOKING_TITLE_MAX_LENGTH` from the contract (T064 passes)
- [X] T077 [P] [US4] Create `apps/web/src/views/bookings/use-idempotency-key.ts`: hook keeping the key in a ref, returning `getKey(): string` (creates a `uuid` v4 when none is held) and `release(): void` (T065 passes)
- [X] T078 [US4] Create `apps/web/src/views/bookings/use-bookings.ts`: hook holding `bookings`, `loading`, `errorMessage`, `page`, `roomId`, `setPage`, `setRoomId` (resets to page 1) and `reload`, loading through `listBookings` with `limit` `DEFAULT_PAGE_SIZE` (T066 passes; depends on T074)
- [X] T079 [P] [US4] Create `apps/web/src/views/bookings/bookings-table.tsx` (MUI table with `aria-label` "Bookings", `TablePagination` at `DEFAULT_PAGE_SIZE`, times through `formatDateTime`, room name lookup with the room id as fallback, edit and delete icon buttons with the accessible names of T067) (T067 passes; depends on T075)
- [X] T080 [P] [US4] Create `apps/web/src/views/bookings/booking-room-filter.tsx` (MUI select labelled "Room" with "All rooms" and the given rooms) (T068 passes)
- [X] T081 [US4] Create `apps/web/src/views/bookings/booking-create-form.tsx` with `react-hook-form` and the yup resolver: fields Room, Title, Organizer email, Start and End (`datetime-local`), button "Create booking"; on submit take `getKey()`, call `createBooking` with `toUtcIso` times; on success `release()`, reset the form and call `onCreated`; on `ApiError` `release()` and show its `message` in an error alert; on any other error keep the key and show the error's message; call `release()` whenever a field value changes (T069 passes; depends on T074–T077)
- [X] T082 [P] [US4] Create `apps/web/src/views/bookings/booking-edit-dialog.tsx` (MUI dialog "Edit booking", `react-hook-form` with `editBookingFormSchema`, prefilled through `toLocalInputValue`, "Save" sends `title`, `startsAt`, `endsAt`, error alert with the API's message, "Cancel") (T070 passes; depends on T074–T076)
- [X] T083 [P] [US4] Create `apps/web/src/views/bookings/booking-delete-dialog.tsx` (MUI dialog "Delete booking" with the booking's title in the question, "Delete" and "Cancel", error alert with the API's message) (T071 passes; depends on T074)
- [X] T084 [US4] Create `apps/web/src/views/bookings/bookings-page.tsx` composing heading, `BookingRoomFilter`, `BookingCreateForm`, the loading bar (`aria-label` "Loading bookings"), "No bookings found.", the load-error alert, `BookingsTable` and the two dialogs; rooms from `listRooms(1, MAX_PAGE_SIZE)`; `reload` after each create, edit and delete; wrapped in `AppLayout` the way `views/rooms/rooms-page.tsx` is (T072 passes; depends on T078–T083)
- [X] T085 [P] [US4] Create `apps/web/src/pages/bookings/index.tsx` that default-exports `BookingsPage`, as `pages/rooms/index.tsx` does for `RoomsPage`
- [X] T086 [P] [US4] Edit `apps/web/src/layouts/app-layout.tsx`: add `{ href: '/bookings', label: 'Bookings' }` to `NAV_ITEMS` after Rooms (T073 passes)

**Checkpoint**: `pnpm run test` passes; quickstart scenario 10 passes against the running stack.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Gates and end-to-end proof across all stories.

- [X] T087 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root; all three must pass (FR-035) — fix the code, never weaken a test
- [X] T088 [P] Run the scope check from `specs/001-room-bookings/quickstart.md` ("Automated gates"): both `git status --porcelain` and `git diff --stat main` for `libs/contract`, `apps/room`, `apps/web/src/views/rooms`, `apps/web/src/pages/rooms` and `apps/web/src/services/room.service.ts` must print nothing (FR-033, SC-007)
- [X] T089 [P] Check every new or edited file under `libs/backend-common/src`, `apps/gateway/src/booking`, `apps/booking/src/booking`, `apps/worker/src/confirmation` and `apps/web/src` against the constitution: under 200 lines, kebab-case name, no `interface`, no `any`, no `import * as`, no inline object parameter type, explicit repository return types, no `$transaction`/`transaction(` outside the two repositories, no narrative comments; split or fix any file that fails
- [ ] T090 Run `specs/001-room-bookings/quickstart.md` scenarios 1–9 against the stack started with `pnpm run stack:reset`, compare every answer with the expected one, and record how `queue.add` behaved with Redis stopped (research R6, scenario 9)
- [ ] T091 Run `specs/001-room-bookings/quickstart.md` scenario 10 at `/bookings` in the browser, then `pnpm run stack:down`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks every story.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 — it extends `idempotent-booking.repository.ts`, `create-booking.service.ts` and the gateway controller created there.
- **US3 (Phase 5)**: after US1 (it extends the `booking` service files and needs created bookings). Independent of US2 in code, but both edit `create-booking.service.ts` and its spec, so do them one after the other (US2 first).
- **US4 (Phase 6)**: code and unit tests depend only on Foundational being merged (the page talks to mocked services); the manual check (T091) needs US1–US3 running.
- **Polish (Phase 7)**: after every story.

### User Story Dependencies

```text
Setup → Foundational → US1 → US2 → US3 → Polish
                    └──────── US4 ──────────┘   (US4 can run in parallel with US1–US3)
```

### Within Each User Story

- Spec task first; it must fail for the right reason before its implementation task starts.
- Utils and DTOs → repositories → clients → services → controllers → module wiring.
- A task marked "Extend" edits a file created earlier and is never parallel with another task on that file.

### Parallel Opportunities

- Foundational: T002, T004–T007, T009 and T011 together; T003 → T008 in order (both edit `libs/backend-common/src/index.ts`).
- US1: all spec tasks T013–T021 together; then T022, T023, T024, T026 and T031 together.
- US2: T034 with T036/T037; T038 alongside T040.
- US3: T042, T047–T050 together; T051, T057 and T058 together; the worker tasks (T057–T061) alongside the `booking` service tasks (T051–T056).
- US4: all spec tasks T062–T073 together; then T074–T077, T080, T085 and T086 together.
- US4 as a whole alongside US1–US3 when a second developer is available.

---

## Parallel Example: User Story 1

```bash
# All User Story 1 specs together (each must fail first):
Task: "Write the failing spec apps/booking/src/booking/booking-fingerprint.util.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/booking.repository.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/idempotent-booking.repository.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/room.client.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/booking.service.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/create-booking.service.spec.ts"
Task: "Write the failing spec apps/booking/src/booking/booking.controller.spec.ts"
Task: "Write the failing spec apps/gateway/src/booking/idempotency-replay.interceptor.spec.ts"
Task: "Write the failing spec apps/gateway/src/booking/booking.controller.spec.ts"

# Then the independent implementation files together:
Task: "Create apps/booking/src/booking/booking-fingerprint.util.ts"
Task: "Create apps/booking/src/booking/claim-booking-result.dto.ts"
Task: "Create apps/booking/src/booking/booking.repository.ts"
Task: "Create apps/booking/src/booking/room.client.ts"
Task: "Create apps/gateway/src/booking/idempotency-replay.interceptor.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Write the failing spec apps/gateway/src/booking/idempotency-key.guard.spec.ts"
Task: "Extend apps/booking/src/booking/idempotent-booking.repository.spec.ts with the four claim outcomes"
```

## Parallel Example: User Story 3

```bash
# booking service side and worker side touch different apps:
Task: "Write the failing spec apps/booking/src/booking/confirmation-queue.producer.spec.ts"
Task: "Write the failing spec apps/worker/src/confirmation/simulated-confirmation-sender.spec.ts"
Task: "Write the failing spec apps/worker/src/confirmation/booking.client.spec.ts"
Task: "Write the failing spec apps/worker/src/confirmation/confirmation.service.spec.ts"
Task: "Write the failing spec apps/worker/src/confirmation/confirmation.processor.spec.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Create apps/web/src/services/booking.service.ts"
Task: "Create apps/web/src/views/bookings/booking-date.util.ts"
Task: "Create apps/web/src/views/bookings/booking-form.schema.ts"
Task: "Create apps/web/src/views/bookings/use-idempotency-key.ts"
Task: "Create apps/web/src/views/bookings/booking-room-filter.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001).
2. Phase 2: Foundational (T002–T012).
3. Phase 3: User Story 1 (T013–T033).
4. **Stop and validate**: `pnpm run test`, then quickstart scenarios 1 and 2 with a UUID `Idempotency-Key`.

### Incremental Delivery

1. Setup + Foundational → storage and helpers ready.
2. US1 → bookings API works end to end (MVP).
3. US2 → create is safe to retry (quickstart 3–6).
4. US3 → confirmations run (quickstart 7–9).
5. US4 → the page (quickstart 10).
6. Polish → gates, scope check, full quickstart.

### Parallel Team Strategy

1. Everyone: Setup + Foundational.
2. Developer A: US1 → US2 → US3 (backend, same files in sequence).
3. Developer B: US4 (frontend, mocked service layer), then joins the quickstart run.

---

## Notes

- [P] = different file, no dependency on an incomplete task.
- Every spec task must be seen failing before its implementation task is started (Constitution V).
- Commit locally after each task or logical group; never push.
- Stop at any checkpoint to validate the story on its own.
- Out of scope, recorded in research.md: the `skip` calculation in `apps/room/src/room/room.repository.ts`; `apps/room` is frozen for this feature.
