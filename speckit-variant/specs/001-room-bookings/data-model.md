# Data Model: Meeting-Room Bookings

**Feature**: `specs/001-room-bookings` | **Date**: 2026-11-10

Wire shapes are the classes in `libs/contract` and are not repeated here. This document covers what is
stored, the rules on it and the state changes.

## Booking — table `bookings`

Entity `BookingEntity` in `libs/backend-common/src/lib/entities/booking.entity.ts`. Owned by the
`booking` service.

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key `PK_bookings_id`, default `gen_random_uuid()` |
| `room_id` | `uuid` | not null; no foreign key (see research R13) |
| `title` | `character varying(120)` | not null; 1–120 characters |
| `organizer_email` | `character varying(320)` | not null |
| `starts_at` | `timestamp with time zone` | not null |
| `ends_at` | `timestamp with time zone` | not null |
| `confirmation_status` | `character varying(10)` | not null, default `PENDING`; `CK_bookings_confirmation_status` limits it to `PENDING`, `SENT`, `FAILED` |
| `confirmation_attempts` | `integer` | not null, default 0 |
| `created_at` | `timestamp with time zone` | not null, default `now()` |
| `updated_at` | `timestamp with time zone` | not null, default `now()`; set on every change to the row |

Constraints and indexes:

- `CK_bookings_time_range`: `ends_at > starts_at`.
- `IDX_bookings_starts_at` on (`starts_at`, `id`) — the unfiltered list.
- `IDX_bookings_room_id_starts_at` on (`room_id`, `starts_at`, `id`) — the list filtered by room.

Mapping to `BookingDto`: column names become camelCase; the four times are answered with
`toISOString()`.

### Validation rules

| Rule | Enforced by | Answer |
|---|---|---|
| Field shapes (FR-008) | gateway validation pipe with `CreateBookingDto` / `UpdateBookingDto` | 400 `BAD_REQUEST.VALIDATION` |
| Unknown field on update | handler-level pipe on `PATCH` | 400 `BAD_REQUEST.VALIDATION` |
| A time that does not parse to an instant | `booking` service | 400 `BAD_REQUEST.VALIDATION` |
| `endsAt` later than `startsAt` on create (FR-009) | `booking` service; `CK_bookings_time_range` behind it | 400 `BAD_REQUEST.VALIDATION` |
| Resulting pair valid on update (FR-009) | conditional update in the repository; the service chooses the answer | 400 `BAD_REQUEST.VALIDATION` |
| Room exists on create (FR-010) | `booking` service asks `room:findRoomById` | 404 `NOT_FOUND.ROOM` |
| Booking exists on read, update, delete | `booking` service | 404 `NOT_FOUND.BOOKING` |

### List

Ordered by `starts_at` ascending, then `id` ascending so pages are stable. `skip = (page - 1) * limit`,
`take = limit`. An optional `roomId` restricts both the rows and the total.

### Confirmation state

```text
                 report SENT (attempts n)
   PENDING ───────────────────────────────▶ SENT      (final)
     │  ▲
     │  └── report PENDING (attempts n)     attempts rises, status stays
     │
     └──────────────────────────────────▶ FAILED    (final)
                 report FAILED (attempts 3)
```

A report is applied only when the stored status is `PENDING` and the stored attempts are not greater
than the reported attempts. Consequences:

- `SENT` and `FAILED` never change.
- `confirmation_attempts` never goes down.
- The same report applied twice leaves the same state.
- A report for a booking that no longer exists changes nothing.

Updating or deleting a booking does not touch its confirmation state and does not create or cancel a
job.

## Idempotency record — table `idempotency_keys`

Entity `IdempotencyKeyEntity` in `libs/backend-common/src/lib/entities/idempotency-key.entity.ts`.
Owned by the `booking` service.

| Column | Type | Rules |
|---|---|---|
| `key` | `uuid` | primary key `PK_idempotency_keys_key`; the `Idempotency-Key` value |
| `request_fingerprint` | `character(64)` | not null; sha256 hex of the five create fields in a fixed order |
| `response_status` | `smallint` | not null; the stored HTTP status (201) |
| `response_body` | `jsonb` | not null; the `BookingDto` answered by the first request |
| `created_at` | `timestamp with time zone` | not null, default `now()` |

Rules:

- A row is written only in the same transaction that inserts the booking, so a row always means a
  completed create. There is no status column: "in progress" is the open claim transaction, held as
  two transaction-scoped advisory locks (research R3).
- No foreign key to `bookings`: the stored answer must survive the booking being updated or deleted
  (replay is a snapshot).
- Rows are never deleted or expired (FR-019).
- Failed validation, an unknown room and an unavailable `room` service store nothing (FR-018).

### Claim outcomes

The repository's claim returns one outcome; the service maps it to the answer.

| Outcome | Condition | Answer |
|---|---|---|
| `CREATED` | no row for the key; booking and row inserted | 201 with the booking; job enqueued |
| `REPLAYED` | row with the same fingerprint | stored status and body, `Idempotency-Replayed: true`; nothing enqueued |
| `KEY_REUSED` | row with another fingerprint, or the key is being claimed with another body | 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` |
| `IN_PROGRESS` | the same key and body are being claimed now | 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` |

## Room — table `rooms` (read-only)

Existing `RoomEntity`, owned by the `room` service. Not changed. The `booking` service reads a room
only through `room:findRoomById`; the web page reads rooms only through `GET /api/rooms`.

## Confirmation job — queue `booking-confirmation` (Redis, not Postgres)

| Property | Value |
|---|---|
| Job name | `QueueEnum.BOOKING_CONFIRMATION` (the contract defines no job name) |
| Job id | `confirmationJobId(bookingId)` |
| Payload | `ConfirmationJobDto` — `{ bookingId }` |
| Attempts | `CONFIRMATION_JOB_ATTEMPTS` (3) |
| Backoff | exponential, `CONFIRMATION_BACKOFF_MS` (1000 ms) |
| Retention | kept after completion or failure, so a second `add` with the same id is ignored |

## Confirmation outcome — message, not stored

`RecordConfirmationResultDto` — `{ bookingId, status, attempts }`, sent by the worker on
`booking:recordConfirmationResult` after every attempt.

| Organizer address | Attempt 1 | Attempt 2 | Attempt 3 | Final booking |
|---|---|---|---|---|
| ends in `@retry.example` | `PENDING`, 1 | `PENDING`, 2 | `SENT`, 3 | `SENT`, 3 |
| ends in `@bounce.example` | `PENDING`, 1 | `PENDING`, 2 | `FAILED`, 3 | `FAILED`, 3 |
| any other | `SENT`, 1 | — | — | `SENT`, 1 |

## Migrations

Added in `libs/backend-common/src/lib/database/migrations/` and registered in `index.ts`:

- `1731200000002-create-bookings.ts`
- `1731200000003-create-idempotency-keys.ts`

Both entities are added to `data-source.ts` and exported from `libs/backend-common/src/index.ts`.
