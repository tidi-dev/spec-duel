# Contract: Bookings HTTP API (gateway)

Base path: `/api/bookings` (`GATEWAY_GLOBAL_PREFIX` + `ApiRouteEnum.BOOKINGS`). Every name below is
exported by `@roombook/contract`; this document describes how the gateway uses them and adds nothing.

Every error body is `ErrorResponseDto`: `{ statusCode, errorCode, message }`.

## POST `/api/bookings`

| | |
|---|---|
| Request header | `Idempotency-Key` (`IDEMPOTENCY_KEY_HEADER`): a UUID, required |
| Request body | `CreateBookingDto` — unknown fields are dropped |
| Forwards | `BookingPatternEnum.CREATE` with `CreateBookingMessageDto` |
| Success | 201, body `BookingDto` |
| Replay | 201 (the stored status), the stored `BookingDto`, response header `Idempotency-Replayed: true` (`IDEMPOTENCY_REPLAYED_HEADER`) |

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BAD_REQUEST.IDEMPOTENCY_KEY` | header missing or not a UUID; checked before the body |
| 400 | `BAD_REQUEST.VALIDATION` | invalid body, a time that is not an instant, or `endsAt` not later than `startsAt` |
| 404 | `NOT_FOUND.ROOM` | `roomId` matches no room |
| 409 | `CONFLICT.IDEMPOTENCY_IN_PROGRESS` | the same key and body are being processed |
| 422 | `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` | the key was used, or is being used, with a different body |
| 503 | `UNAVAILABLE.SERVICE` | the `booking` or `room` service did not answer |

Only a 201 is stored against the key. After any error answer the key can be used again.

The `Idempotency-Replayed` header is absent on a first answer.

## GET `/api/bookings`

| | |
|---|---|
| Query | `ListBookingsQueryDto`: `page` (default 1, min 1), `limit` (default 10, min 1, max 100), optional `roomId` (UUID) |
| Forwards | `BookingPatternEnum.LIST` with `ListBookingsQueryDto` |
| Success | 200, body `PagedBookingsDto` — `{ items, total, page, limit }`, ordered by `startsAt` ascending |

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BAD_REQUEST.VALIDATION` | `page` or `limit` out of range, or `roomId` not a UUID |
| 503 | `UNAVAILABLE.SERVICE` | the `booking` service did not answer |

A `roomId` that matches no room answers 200 with an empty list.

## GET `/api/bookings/:id`

| | |
|---|---|
| Forwards | `BookingPatternEnum.FIND_BY_ID` with `BookingIdMessageDto` |
| Success | 200, body `BookingDto` |

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BAD_REQUEST.VALIDATION` | `id` is not a UUID |
| 404 | `NOT_FOUND.BOOKING` | no booking with that id |
| 503 | `UNAVAILABLE.SERVICE` | the `booking` service did not answer |

## PATCH `/api/bookings/:id`

| | |
|---|---|
| Request body | `UpdateBookingDto`: any of `title`, `startsAt`, `endsAt`; an empty body is valid |
| Forwards | `BookingPatternEnum.UPDATE` with `UpdateBookingMessageDto` |
| Success | 200, body `BookingDto`; `updatedAt` is later unless the body was empty |

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BAD_REQUEST.VALIDATION` | `id` not a UUID; a malformed field; any other field (including `roomId`, `organizerEmail`); or the resulting `endsAt` not later than the resulting `startsAt` |
| 404 | `NOT_FOUND.BOOKING` | no booking with that id |
| 503 | `UNAVAILABLE.SERVICE` | the `booking` service did not answer |

A rejected update leaves the booking unchanged.

## DELETE `/api/bookings/:id`

| | |
|---|---|
| Forwards | `BookingPatternEnum.DELETE` with `BookingIdMessageDto` |
| Success | 204, no body |

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BAD_REQUEST.VALIDATION` | `id` is not a UUID |
| 404 | `NOT_FOUND.BOOKING` | no booking with that id |
| 503 | `UNAVAILABLE.SERVICE` | the `booking` service did not answer |

## Unchanged

`GET /api/rooms` and `GET /api/health/<service>` keep their behaviour.
