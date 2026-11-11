# bookings

## BKG-001: Create a booking
The system SHALL create a booking on `POST /api/bookings` and answer 201 with the booking, times as UTC ISO 8601 with millisecond precision.
- Scenario: created. WHEN B1 is posted with K1 THEN 201 with a new `id`, B1's fields, `confirmationStatus` `PENDING`, `confirmationAttempts` 0, `createdAt` and `updatedAt`
- Scenario: offset normalised. WHEN `startsAt` is `2030-01-07T16:00:00+07:00` THEN the answer carries `startsAt` `2030-01-07T09:00:00.000Z`

## BKG-002: Reject an invalid body
The system SHALL answer 400 `BAD_REQUEST.VALIDATION` at the gateway for a body that fails `CreateBookingDto` or `UpdateBookingDto`, without sending a NATS message.
- Scenario: empty title. WHEN B1 has `title` `""` or 121 characters THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: bad email or missing field. WHEN `organizerEmail` is `not-an-email`, or `roomId` is absent THEN 400 `BAD_REQUEST.VALIDATION`

## BKG-003: One strict grammar for instants
The system SHALL accept `startsAt` and `endsAt` only as `YYYY-MM-DDTHH:mm:ss[.f{1,3}](Z|±HH:MM)` and answer 400 `BAD_REQUEST.VALIDATION` for any other form, on create and on update.
- Scenario: no offset. WHEN `startsAt` is `2030-01-07T09:00` or `2030-01-07T09:00:00` THEN 400 `BAD_REQUEST.VALIDATION`, under `TZ=UTC` and under `TZ=Asia/Ho_Chi_Minh`
- Scenario: other ISO forms. WHEN `startsAt` is `2030-01-07`, `2030-W02-1T09:00:00Z`, `2030-007T09:00:00Z`, `2030-01-07T09:00:00.123456Z`, `2030-01-07t09:00:00z` or `2030-02-30T09:00:00Z` THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: offset form. WHEN `startsAt` is `2030-01-07T16:00:00+07:00` THEN it is read as the instant `2030-01-07T09:00:00.000Z` under any server time zone

## BKG-004: End later than start
The system SHALL require `endsAt` to be a later instant than `startsAt`, on create and on the merged result of an update, and answer 400 `BAD_REQUEST.VALIDATION` otherwise.
- Scenario: equal or earlier. WHEN `endsAt` equals `startsAt`, or is `2030-01-07T08:59:59.999Z` against B1's start THEN 400 `BAD_REQUEST.VALIDATION` and nothing is stored
- Scenario: compared as instants. WHEN `startsAt` is `2030-01-07T09:30:00Z` and `endsAt` is `2030-01-07T10:00:00+01:00` THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: update of one side. WHEN a booking 09:00–10:00 is patched with only `startsAt` `2030-01-07T10:00:00Z` THEN 400 `BAD_REQUEST.VALIDATION` and the booking is unchanged

## BKG-005: The room must exist
The system SHALL have the `booking` service ask the `room` service (`RoomPatternEnum.FIND_BY_ID`) before creating, and store nothing when the room is unknown or the room service does not answer.
- Scenario: unknown room. WHEN B1 names a `roomId` that is a UUID of no room THEN 404 `NOT_FOUND.ROOM` and no booking exists
- Scenario: room service down. WHEN the room service does not answer THEN 503 `UNAVAILABLE.SERVICE` and no booking exists

## BKG-006: List bookings
The system SHALL answer `GET /api/bookings` with `{ items, total, page, limit }` ordered by `startsAt` ascending then `id` ascending, filtered by `roomId` when given, with `page` default 1 and `limit` default 10.
- Scenario: order and page. WHEN three bookings start at 11:00, 09:00 and 10:00 and `?page=2&limit=2` is requested THEN `items` holds only the 11:00 booking, `total` 3, `page` 2, `limit` 2
- Scenario: room filter. WHEN `?roomId=R1` is requested THEN only R1's bookings are in `items` and `total` counts only them
- Scenario: bounds. WHEN `limit=101`, `page=0`, `roomId=abc` or an empty `roomId=` is sent THEN 400 `BAD_REQUEST.VALIDATION`; WHEN `page` is past the end THEN 200 with `items` `[]` and the real `total`

## BKG-007: Read one booking
The system SHALL answer `GET /api/bookings/:id` with 200 and the booking.
- Scenario: unknown. WHEN `:id` is a UUID of no booking THEN 404 `NOT_FOUND.BOOKING`
- Scenario: malformed id. WHEN `:id` is `abc` on GET, PATCH or DELETE THEN 400 `BAD_REQUEST.VALIDATION`

## BKG-008: Update a booking
The system SHALL change only the supplied `title`, `startsAt` and `endsAt` on `PATCH /api/bookings/:id` and answer 200 with the updated booking.
- Scenario: one field. WHEN `{ "title": "Retro" }` is patched THEN 200, `title` is `Retro`, every other field keeps its value and `updatedAt` moves forward
- Scenario: unknown. WHEN `:id` is a UUID of no booking THEN 404 `NOT_FOUND.BOOKING`
- Scenario: explicit null. WHEN `title`, `startsAt` or `endsAt` is `null` THEN 400 `BAD_REQUEST.VALIDATION` and the booking is unchanged
- Scenario: nothing to change. WHEN `{}` or `{ "roomId": "…", "organizerEmail": "x@example.com" }` is patched THEN 200 with the booking unchanged

## BKG-009: Updates of one booking are serialised
The system SHALL read, merge, check (BKG-004) and write an update inside one transaction that holds the booking's row lock, writing only the changed columns.
- Scenario: two partial updates. WHEN `{ "title": "Retro" }` and `{ "endsAt": "2030-01-07T11:00:00Z" }` are patched at the same moment THEN the booking ends with `title` `Retro` and `endsAt` `2030-01-07T11:00:00.000Z`
- Scenario: update against a confirmation result. WHEN a title patch and a `SENT` result (CNF-006) arrive at the same moment THEN both the new title and `SENT` are stored

## BKG-010: Delete a booking
The system SHALL remove the booking on `DELETE /api/bookings/:id` and answer 204 with an empty body.
- Scenario: gone. WHEN a booking is deleted and then read or deleted again THEN the first answer is 204 and the later ones are 404 `NOT_FOUND.BOOKING`

## BKG-011: The database refuses an invalid span
The system SHALL back BKG-004 with a check constraint `ends_at > starts_at` on `bookings`, and map its violation to 400 `BAD_REQUEST.VALIDATION`.
- Scenario: direct write. WHEN a row with `ends_at` equal to `starts_at` is inserted directly THEN Postgres rejects it with the constraint `CHK_bookings_span`

## BKG-012: Overlap rule
The system SHALL treat two bookings as overlapping only when they have the same `roomId` and each starts before the other ends (half-open spans, compared as instants).
- Scenario: inside or across. WHEN a span of R1 is 09:30–10:30, 08:00–09:00:00.001, 09:15–09:45 or 08:00–11:00 THEN it overlaps A
- Scenario: touching. WHEN a span of R1 is 10:00–11:00 or 08:00–09:00 THEN it does not overlap A
- Scenario: other room. WHEN a span of R2 is 09:00–10:00 THEN it does not overlap A

## BKG-013: Create rejects an overlap
The system SHALL answer 409 `CONFLICT.BOOKING_OVERLAP` on `POST /api/bookings` when the new span overlaps (BKG-012) a stored booking, storing no booking and enqueueing no confirmation job.
- Scenario: rejected. WHEN R1 09:30–10:30 is posted with K1 THEN 409 `CONFLICT.BOOKING_OVERLAP`, only A exists in R1 and the queue got no job
- Scenario: allowed. WHEN R1 10:00–11:00 is posted, or R2 09:00–10:00 THEN 201
- Scenario: replay is not a conflict. WHEN the request that created A is posted again with its key THEN the IDM-003 replay answers 201, not 409

## BKG-014: Update rejects an overlap
The system SHALL answer 409 `CONFLICT.BOOKING_OVERLAP` on `PATCH /api/bookings/:id` when the merged span overlaps (BKG-012) another booking, leaving the booking unchanged; a booking never conflicts with itself.
- Scenario: rejected. WHEN B of R1 10:00–11:00 is patched with `{ "startsAt": "2030-01-07T09:59:59.999Z" }` THEN 409 `CONFLICT.BOOKING_OVERLAP` and B still starts at 10:00
- Scenario: itself. WHEN A is patched with `{ "title": "Retro" }`, or with `{ "endsAt": "2030-01-07T09:30:00Z" }` THEN 200
- Scenario: touching. WHEN B is patched with `{ "endsAt": "2030-01-07T12:00:00Z" }`, or A with `{ "startsAt": "2030-01-07T08:00:00Z" }` THEN 200

## BKG-015: Span writes of one room are serialised
The system SHALL run the overlap check and the write of a create or a span-changing update inside one transaction that holds a lock on the room, so that concurrent writes cannot both pass the check.
- Scenario: simultaneous creates. WHEN R2 09:00–10:00 and R2 09:30–10:30 are posted at the same moment with different keys against the real database THEN exactly one answers 201, the other 409 `CONFLICT.BOOKING_OVERLAP`, and one booking exists in R2
- Scenario: simultaneous updates. WHEN A (09:00–10:00) is patched with `endsAt` 10:45 and C of R1 (11:00–12:00) with `startsAt` 10:15 at the same moment THEN exactly one answers 200 and the other 409 `CONFLICT.BOOKING_OVERLAP`

## BKG-016: The database refuses an overlap
The system SHALL back BKG-012 with an exclusion constraint `EXCL_bookings_room_span` on `bookings` and map its violation to 409 `CONFLICT.BOOKING_OVERLAP`.
- Scenario: direct write. WHEN a row of R1 09:30–10:30 is inserted directly next to A THEN Postgres rejects it with `EXCL_bookings_room_span`; WHEN the row is R1 10:00–11:00 THEN it is stored
