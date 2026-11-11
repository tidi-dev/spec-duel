# Data Model: No Overlapping Bookings for the Same Room

**Feature**: `specs/002-prevent-booking-overlap` | **Date**: 2026-11-10

This change adds a rule, not data. No table, column, constraint, index or migration is added or
changed (FR-022). Everything in `specs/001-room-bookings/data-model.md` still applies; this document
lists only what is new.

## Booking — table `bookings` (shape unchanged)

### New rule: no overlap within a room

Two bookings overlap when all of these hold (FR-001):

- same `room_id`;
- `starts_at` of each is earlier than `ends_at` of the other;
- they are different rows.

Spans are half-open, `[starts_at, ends_at)`: a booking that starts when another ends does not
overlap it. Only rows that exist count; `confirmation_status` plays no part (FR-004).

For a candidate span `[start, end)` in room `R`, a stored booking `b` is in the way when
`b.room_id = R AND b.starts_at < end AND b.ends_at > start`, and, on update, `b.id` is not the
booking being changed. The existing index `IDX_bookings_room_id_starts_at` serves this lookup.

### Added validation rules

| Rule | Enforced by | Answer |
|---|---|---|
| A new booking's span is free in its room (FR-005) | claim transaction in `IdempotentBookingRepository`, under the room lock; the service chooses the answer | 409 `CONFLICT.BOOKING_OVERLAP` |
| An updated booking's resulting span is free in its room, itself excluded (FR-009, FR-010) | update transaction in `BookingRepository`, under the room lock; the service chooses the answer | 409 `CONFLICT.BOOKING_OVERLAP` |

Both come after every existing rule in the 001 table (FR-008, FR-011).

### Room lock

| Property | Value |
|---|---|
| Kind | transaction-scoped advisory lock, waiting (`pg_advisory_xact_lock`) |
| Name | `room:<roomId>`, hashed with `hashtextextended(…, 0)` |
| Taken by | the create claim transaction and the update transaction, before the overlap check |
| Not taken by | list, read, delete, recording a confirmation outcome, a replay |
| Released | at commit or rollback |

Nothing is stored for the lock.

## Claim outcomes (create) — one added

Internal to the `booking` service; not a contract item.

| Outcome | Condition | Answer |
|---|---|---|
| `CREATED`, `REPLAYED`, `KEY_REUSED`, `IN_PROGRESS` | as in 001 | as in 001 |
| `OVERLAP` *(new)* | the key is free and unclaimed, and the span is taken in the room | 409 `CONFLICT.BOOKING_OVERLAP`; no booking, no idempotency row, no job |

Order inside the claim transaction:

```text
try-lock key+fingerprint ── not obtained ──▶ IN_PROGRESS
try-lock key ────────────── not obtained ──▶ KEY_REUSED
read stored key ─────────── found ─────────▶ REPLAYED / KEY_REUSED
lock room (waits)
overlap check ───────────── taken ─────────▶ OVERLAP        (nothing written)
insert booking + idempotency row ──────────▶ CREATED
```

## Update outcomes — new

Internal to the `booking` service. Class `UpdateBookingResultDto` with `UpdateBookingOutcomeEnum`
and the stored booking (or `null`).

| Outcome | Condition | Answer |
|---|---|---|
| `NOT_FOUND` | no booking with that id, before or after the wait for the lock | 404 `NOT_FOUND.BOOKING` |
| `INVALID_TIME_RANGE` | resulting `ends_at` not later than resulting `starts_at` | 400 `BAD_REQUEST.VALIDATION` |
| `OVERLAP` | the resulting span is taken by another booking of the room | 409 `CONFLICT.BOOKING_OVERLAP`; booking unchanged |
| `UPDATED` | none of the above | 200 with the stored booking |

The resulting span uses the stored value for a time that was not sent. An update with no fields is
answered by the service before any transaction, as today.

## Idempotency record — table `idempotency_keys` (unchanged)

A row is still written only together with a booking. An overlap rejection writes none, so its key
stays usable with any body (FR-007).

## Room — table `rooms` (read-only, unchanged)

The scope of the rule. Not read, locked or written by this change; the room lock is a name derived
from the room's id, not a lock on its row.

## Error code — `ErrorCodeEnum` (the one contract change)

| Member | Value | Status |
|---|---|---|
| `BOOKING_OVERLAP` | `CONFLICT.BOOKING_OVERLAP` | 409 |

## Migrations

None.
