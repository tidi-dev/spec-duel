# Contract: Bookings HTTP API (gateway) — changes for the overlap rule

This is a delta to `specs/001-room-bookings/contracts/gateway-http-api.md`. Routes, request shapes,
success answers and every existing error stay as described there. Only what is listed here changes.

## Shared contract (`libs/contract`)

One addition, and nothing else (FR-015):

```text
ErrorCodeEnum.BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'
```

## Overlap rejection

`ErrorResponseDto`, the same on both routes:

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT.BOOKING_OVERLAP",
  "message": "The room is already booked for that time"
}
```

The body does not name the booking or bookings in the way. Clients must rely on `statusCode` and
`errorCode`; the `message` is for people and its wording may change.

## POST `/api/bookings`

Added row:

| Status | `errorCode` | When |
|---|---|---|
| 409 | `CONFLICT.BOOKING_OVERLAP` | the span overlaps an existing booking of the same room |

- Checked last: an invalid key, an invalid body, a reused key, an unknown room and an in-progress
  key are answered as before, even when the span is also taken.
- Nothing is stored against the `Idempotency-Key`. The 001 sentence "Only a 201 is stored against
  the key. After any error answer the key can be used again." covers it unchanged.
- Sending the same key and body again while the conflict remains answers 409 again, without
  `Idempotency-Replayed`.
- A replay of an earlier 201 is answered from the stored response and is never checked for overlap.
- Two 409 codes now exist on this route. `CONFLICT.IDEMPOTENCY_IN_PROGRESS` means "the same request
  is still running, try again"; `CONFLICT.BOOKING_OVERLAP` means "choose another time".

## PATCH `/api/bookings/:id`

Added row:

| Status | `errorCode` | When |
|---|---|---|
| 409 | `CONFLICT.BOOKING_OVERLAP` | the booking's resulting span (sent times, stored values for the rest) overlaps another booking of the same room |

- Checked last: 400 and 404 are answered as before.
- A booking never conflicts with itself.
- A rejected update leaves the booking unchanged, as for every other rejection.

## Simultaneous requests

- Two overlapping creates for one room: exactly one 201 and one 409 `CONFLICT.BOOKING_OVERLAP`.
- An update racing with a create or another update for one room: at most one of two changes that
  would overlap each other succeeds; the other gets the 409.
- Requests for different rooms, or for spans of one room that do not overlap, do not reject each
  other.

## Service messages (NATS)

Delta to `specs/001-room-bookings/contracts/service-messages.md`. Patterns and payloads are
unchanged.

| Pattern | Change |
|---|---|
| `booking:createBooking` | may reject with the overlap rejection above |
| `booking:updateBooking` | may reject with the overlap rejection above |

The gateway forwards the rejection as it forwards every other `{ statusCode, errorCode, message }`.

## Unchanged

`GET /api/bookings`, `GET /api/bookings/:id`, `DELETE /api/bookings/:id`, `GET /api/rooms`,
`GET /api/health/<service>`, the `Idempotency-Key` and `Idempotency-Replayed` headers, the
confirmation queue and its job.
