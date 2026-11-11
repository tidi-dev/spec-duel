# add-meeting-room-bookings: Meeting-room bookings with idempotent create, confirmation job and bookings page

Tier: feature
Why this tier: bookings, idempotent create, the confirmation job and the `/bookings` page do not exist in `cr/specs` or in the code.

## Why
roombook lists rooms but nobody can book one. This change adds booking CRUD through the gateway, a create that is safe to retry (`Idempotency-Key`), a simulated confirmation processed by the worker, and a page to manage bookings.
Sample values below: room R1 = `3f0c1a52-8f0b-4c59-9a6e-1d2b7c9e4a10`, key K1 = `11111111-1111-4111-8111-111111111111`, body B1 = `{ roomId: R1, title: "Sprint planning", organizerEmail: "ann@example.com", startsAt: "2030-01-07T09:00:00.000Z", endsAt: "2030-01-07T10:00:00.000Z" }`. Every error body is `{ statusCode, errorCode, message }`.

## Requirements
### ADDED bookings
#### BKG-001: Create a booking
The system SHALL create a booking on `POST /api/bookings` and answer 201 with the booking, times as UTC ISO 8601 with millisecond precision.
- Scenario: created. WHEN B1 is posted with K1 THEN 201 with a new `id`, B1's fields, `confirmationStatus` `PENDING`, `confirmationAttempts` 0, `createdAt` and `updatedAt`
- Scenario: offset normalised. WHEN `startsAt` is `2030-01-07T16:00:00+07:00` THEN the answer carries `startsAt` `2030-01-07T09:00:00.000Z`
#### BKG-002: Reject an invalid body
The system SHALL answer 400 `BAD_REQUEST.VALIDATION` at the gateway for a body that fails `CreateBookingDto` or `UpdateBookingDto`, without sending a NATS message.
- Scenario: empty title. WHEN B1 has `title` `""` or 121 characters THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: bad email or missing field. WHEN `organizerEmail` is `not-an-email`, or `roomId` is absent THEN 400 `BAD_REQUEST.VALIDATION`
#### BKG-003: One strict grammar for instants
The system SHALL accept `startsAt` and `endsAt` only as `YYYY-MM-DDTHH:mm:ss[.f{1,3}](Z|±HH:MM)` and answer 400 `BAD_REQUEST.VALIDATION` for any other form, on create and on update.
- Scenario: no offset. WHEN `startsAt` is `2030-01-07T09:00` or `2030-01-07T09:00:00` THEN 400 `BAD_REQUEST.VALIDATION`, under `TZ=UTC` and under `TZ=Asia/Ho_Chi_Minh`
- Scenario: other ISO forms. WHEN `startsAt` is `2030-01-07`, `2030-W02-1T09:00:00Z`, `2030-007T09:00:00Z`, `2030-01-07T09:00:00.123456Z`, `2030-01-07t09:00:00z` or `2030-02-30T09:00:00Z` THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: offset form. WHEN `startsAt` is `2030-01-07T16:00:00+07:00` THEN it is read as the instant `2030-01-07T09:00:00.000Z` under any server time zone
#### BKG-004: End later than start
The system SHALL require `endsAt` to be a later instant than `startsAt`, on create and on the merged result of an update, and answer 400 `BAD_REQUEST.VALIDATION` otherwise.
- Scenario: equal or earlier. WHEN `endsAt` equals `startsAt`, or is `2030-01-07T08:59:59.999Z` against B1's start THEN 400 `BAD_REQUEST.VALIDATION` and nothing is stored
- Scenario: compared as instants. WHEN `startsAt` is `2030-01-07T09:30:00Z` and `endsAt` is `2030-01-07T10:00:00+01:00` THEN 400 `BAD_REQUEST.VALIDATION`
- Scenario: update of one side. WHEN a booking 09:00–10:00 is patched with only `startsAt` `2030-01-07T10:00:00Z` THEN 400 `BAD_REQUEST.VALIDATION` and the booking is unchanged
#### BKG-005: The room must exist
The system SHALL have the `booking` service ask the `room` service (`RoomPatternEnum.FIND_BY_ID`) before creating, and store nothing when the room is unknown or the room service does not answer.
- Scenario: unknown room. WHEN B1 names a `roomId` that is a UUID of no room THEN 404 `NOT_FOUND.ROOM` and no booking exists
- Scenario: room service down. WHEN the room service does not answer THEN 503 `UNAVAILABLE.SERVICE` and no booking exists
#### BKG-006: List bookings
The system SHALL answer `GET /api/bookings` with `{ items, total, page, limit }` ordered by `startsAt` ascending then `id` ascending, filtered by `roomId` when given, with `page` default 1 and `limit` default 10.
- Scenario: order and page. WHEN three bookings start at 11:00, 09:00 and 10:00 and `?page=2&limit=2` is requested THEN `items` holds only the 11:00 booking, `total` 3, `page` 2, `limit` 2
- Scenario: room filter. WHEN `?roomId=R1` is requested THEN only R1's bookings are in `items` and `total` counts only them
- Scenario: bounds. WHEN `limit=101`, `page=0`, `roomId=abc` or an empty `roomId=` is sent THEN 400 `BAD_REQUEST.VALIDATION`; WHEN `page` is past the end THEN 200 with `items` `[]` and the real `total`
#### BKG-007: Read one booking
The system SHALL answer `GET /api/bookings/:id` with 200 and the booking.
- Scenario: unknown. WHEN `:id` is a UUID of no booking THEN 404 `NOT_FOUND.BOOKING`
- Scenario: malformed id. WHEN `:id` is `abc` on GET, PATCH or DELETE THEN 400 `BAD_REQUEST.VALIDATION`
#### BKG-008: Update a booking
The system SHALL change only the supplied `title`, `startsAt` and `endsAt` on `PATCH /api/bookings/:id` and answer 200 with the updated booking.
- Scenario: one field. WHEN `{ "title": "Retro" }` is patched THEN 200, `title` is `Retro`, every other field keeps its value and `updatedAt` moves forward
- Scenario: unknown. WHEN `:id` is a UUID of no booking THEN 404 `NOT_FOUND.BOOKING`
- Scenario: explicit null. WHEN `title`, `startsAt` or `endsAt` is `null` THEN 400 `BAD_REQUEST.VALIDATION` and the booking is unchanged
- Scenario: nothing to change. WHEN `{}` or `{ "roomId": "…", "organizerEmail": "x@example.com" }` is patched THEN 200 with the booking unchanged
#### BKG-009: Updates of one booking are serialised
The system SHALL read, merge, check (BKG-004) and write an update inside one transaction that holds the booking's row lock, writing only the changed columns.
- Scenario: two partial updates. WHEN `{ "title": "Retro" }` and `{ "endsAt": "2030-01-07T11:00:00Z" }` are patched at the same moment THEN the booking ends with `title` `Retro` and `endsAt` `2030-01-07T11:00:00.000Z`
- Scenario: update against a confirmation result. WHEN a title patch and a `SENT` result (CNF-006) arrive at the same moment THEN both the new title and `SENT` are stored
#### BKG-010: Delete a booking
The system SHALL remove the booking on `DELETE /api/bookings/:id` and answer 204 with an empty body.
- Scenario: gone. WHEN a booking is deleted and then read or deleted again THEN the first answer is 204 and the later ones are 404 `NOT_FOUND.BOOKING`
#### BKG-011: The database refuses an invalid span
The system SHALL back BKG-004 with a check constraint `ends_at > starts_at` on `bookings`, and map its violation to 400 `BAD_REQUEST.VALIDATION`.
- Scenario: direct write. WHEN a row with `ends_at` equal to `starts_at` is inserted directly THEN Postgres rejects it with the constraint `CHK_bookings_span`
### ADDED booking-idempotency
#### IDM-001: Idempotency-Key header is required
The system SHALL answer 400 `BAD_REQUEST.IDEMPOTENCY_KEY` at the gateway when `POST /api/bookings` has no `Idempotency-Key` header or its value is not a UUID, checked before the body.
- Scenario: missing or malformed. WHEN the header is absent, empty or `abc` THEN 400 `BAD_REQUEST.IDEMPOTENCY_KEY` and no NATS message is sent, even if the body is also invalid
#### IDM-002: Key and booking are stored atomically
The system SHALL store the key, the request fingerprint and the response body in the same database transaction that inserts the booking.
- Scenario: both or neither. WHEN the booking insert fails inside the transaction THEN no row for K1 exists; WHEN it succeeds THEN exactly one key row and one booking exist
#### IDM-003: Replay a completed request
The system SHALL answer a request whose key and fingerprint match a completed one with 201, the stored body unchanged and the response header `Idempotency-Replayed: true`, creating no booking.
- Scenario: replay. WHEN B1 with K1 is posted twice in a row THEN both answer 201 with the same `id`, only the second has `Idempotency-Replayed: true`, and one booking exists
- Scenario: stored body, not current state. WHEN the booking has since become `SENT` or been deleted and B1 with K1 is posted again THEN 201 with the original body (`PENDING`, 0 attempts)
#### IDM-004: Fingerprint of the normalised body
The system SHALL compute the fingerprint from the parsed body (instants as epoch milliseconds, `roomId` lower-cased, fixed field order) and compare keys case-insensitively.
- Scenario: same request, other spelling. WHEN B1 is replayed with reordered properties, `startsAt` `2030-01-07T16:00:00+07:00`, `endsAt` `2030-01-07T10:00:00Z`, `roomId` and K1 in upper case THEN it is a replay (IDM-003)
- Scenario: real difference. WHEN `title` is `sprint planning` instead of `Sprint planning` THEN it is a different body (IDM-005)
#### IDM-005: A key cannot be reused for another body
The system SHALL answer 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` when a stored key arrives with a different fingerprint.
- Scenario: reuse. WHEN K1 completed for B1 and K1 is posted with `title` `Retro` THEN 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`, no booking is created and the first one is unchanged
#### IDM-006: One winner for concurrent requests
The system SHALL answer 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` to a request whose key is being processed by another transaction, without waiting for it.
- Scenario: in progress. WHEN K1's transaction is open and B1 with K1 arrives THEN 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` at once
- Scenario: simultaneous. WHEN ten B1 requests with K1 run at the same moment against the real database THEN exactly one booking exists and every answer is 201 (first or replay) or 409
#### IDM-007: Failed requests do not consume the key
The system SHALL store nothing against a key whose request is answered 400, 404 or 503 before the transaction commits.
- Scenario: key reusable. WHEN K1 is posted with `endsAt` equal to `startsAt` (400), then with an unknown room (404), then with B1 THEN the third answers 201 without `Idempotency-Replayed`
### ADDED booking-confirmation
#### CNF-001: Enqueue one confirmation job
The system SHALL have the `booking` service add one job to `QueueEnum.BOOKING_CONFIRMATION` after the create transaction commits.
- Scenario: job options. WHEN booking `b1` is created THEN `add` receives payload `{ bookingId: "b1" }`, `jobId` `confirmation-b1`, `attempts` 3, `backoff` `{ type: "exponential", delay: 1000 }`, `removeOnComplete` false and `removeOnFail` false
#### CNF-002: A replay adds no second job
The system SHALL enqueue with the same job id on a replay (IDM-003), so the queue ignores it when the job exists and repairs it when it was lost.
- Scenario: replay. WHEN B1 with K1 is posted twice THEN the queue holds one job `confirmation-<id>`, whatever its state
#### CNF-003: Enqueue failure is reported and recoverable
The system SHALL bound the enqueue with a 2000 ms timeout and answer 503 `UNAVAILABLE.SERVICE` when it fails or times out, keeping the committed booking and key.
- Scenario: Redis down or hanging. WHEN `add` rejects, or does not settle within 2000 ms THEN 503 `UNAVAILABLE.SERVICE`, the error is logged, and the booking and key row exist
- Scenario: recovery. WHEN the same request is then retried with K1 and Redis is back THEN 201 with `Idempotency-Replayed: true` and the job `confirmation-<id>` exists
#### CNF-004: Simulated sender
The system SHALL decide the outcome of a send from the domain of `organizerEmail`, compared case-insensitively, and the attempt number (first attempt is 1).
- Scenario: retry domain. WHEN the address is `ann@retry.example` or `ann@RETRY.EXAMPLE` THEN attempts 1 and 2 fail and attempt 3 succeeds
- Scenario: bounce domain. WHEN the address is `ann@bounce.example` THEN attempts 1, 2 and 3 fail
- Scenario: any other. WHEN the address is `ann@example.com`, `ann@notretry.example` or `retry.example@example.com` THEN attempt 1 succeeds
#### CNF-005: The worker reports every attempt
The system SHALL have the worker read the booking (`BookingPatternEnum.FIND_BY_ID`), send, and report over `BookingPatternEnum.RECORD_CONFIRMATION`: `SENT` on success, `PENDING` on a failure with attempts left (the job then fails so the queue retries), `FAILED` on the last failure, each with the attempt number.
- Scenario: plain address. WHEN the job runs for `ann@example.com` THEN one report `{ status: SENT, attempts: 1 }` and the booking reads `SENT`, 1
- Scenario: retry address. WHEN the job runs for `ann@retry.example` THEN reports `PENDING` 1, `PENDING` 2, `SENT` 3 and the booking ends `SENT`, 3
- Scenario: bounce address. WHEN the job runs for `ann@bounce.example` THEN reports `PENDING` 1, `PENDING` 2, `FAILED` 3 and the booking ends `FAILED`, 3
#### CNF-006: Recording a result never moves backwards
The system SHALL apply a result in one conditional UPDATE: only when the stored status is not `SENT` and the stored attempts are not higher than the reported ones; an unknown booking answers 404 `NOT_FOUND.BOOKING`.
- Scenario: late or repeated result. WHEN the booking is `SENT`, 1 and `{ PENDING, 1 }` or `{ SENT, 1 }` arrives THEN it stays `SENT`, 1; WHEN it is `PENDING`, 2 and `{ PENDING, 1 }` arrives THEN it stays `PENDING`, 2
- Scenario: unknown booking. WHEN the booking was deleted THEN 404 `NOT_FOUND.BOOKING`
#### CNF-007: The processor is safe to run twice
The system SHALL complete the job without sending or reporting when the booking is already `SENT` or no longer exists, and fail the job for a retry on any other error.
- Scenario: second run. WHEN the job runs again for a booking that reads `SENT` THEN nothing is sent, nothing is reported and the job completes
- Scenario: deleted booking. WHEN the read or the report answers 404 `NOT_FOUND.BOOKING` THEN the job completes and is not retried
- Scenario: booking service down. WHEN the read or the report answers 503 `UNAVAILABLE.SERVICE` THEN the job fails and the queue retries it
### ADDED bookings-page
#### BPG-001: Bookings route and navigation
The system SHALL serve the bookings page at `/bookings` and show a "Bookings" link in the main navigation.
- Scenario: link. WHEN the layout renders THEN the navigation has a link "Bookings" with href `/bookings` next to "Rooms"
#### BPG-002: Bookings table
The system SHALL show a paginated table (10 rows per page) with title, room name, organizer, start, end and confirmation status, times as `YYYY-MM-DD HH:mm UTC`.
- Scenario: row. WHEN B1 is listed and R1 is named "Atlas" THEN its row shows `Sprint planning`, `Atlas`, `ann@example.com`, `2030-01-07 09:00 UTC`, `2030-01-07 10:00 UTC`, `PENDING`
- Scenario: next page. WHEN `total` is 12 and "next page" is clicked THEN `listBookings` is called with page 2, limit 10
#### BPG-003: Room filter with every room
The system SHALL fill the room filter and the form's room select with all rooms, and request the list with the chosen `roomId` from page 1.
- Scenario: more rooms than one page. WHEN 12 rooms exist THEN the filter offers "All rooms" and 12 rooms
- Scenario: filter. WHEN "Atlas" is chosen on page 2 THEN `listBookings` is called with `roomId` R1 and page 1; WHEN "All rooms" is chosen THEN no `roomId` is sent
#### BPG-004: Loading, empty and error states
The system SHALL show a progress bar while a list request runs, "No bookings yet" for an empty result, and the API's message in an alert when a request fails.
- Scenario: error. WHEN `listBookings` rejects with `ApiError` 503 "Booking service is unavailable" THEN an alert shows that message and no table is shown
- Scenario: empty. WHEN `items` is `[]` THEN "No bookings yet" is shown
#### BPG-005: Create form
The system SHALL offer a form with room, title, organizer email, start and end (entered as UTC), validate it before sending, and refetch the list after a 201.
- Scenario: submit. WHEN the form holds R1, "Sprint planning", `ann@example.com`, `2030-01-07T09:00`, `2030-01-07T10:00` and is submitted THEN `createBooking` receives B1 and a UUID key, the form resets and the list is fetched again
- Scenario: client validation. WHEN the title is empty, the email is `x`, or end is not later than start THEN the field shows an error and `createBooking` is not called
- Scenario: API error. WHEN `createBooking` rejects with 404 `NOT_FOUND.ROOM` "Room … was not found" THEN an alert shows that message and the entered values stay
#### BPG-006: One Idempotency-Key per submission
The system SHALL keep the key of a submission until it gets a final answer or the user changes a field: a network error, a 5xx or 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` keeps it; a 2xx or any other 4xx drops it.
- Scenario: retry. WHEN a submit fails with a network error or 503 and the unchanged form is submitted again THEN both calls carry the same key
- Scenario: edited payload. WHEN the title is changed after a 503 and the form is submitted THEN the call carries a new key
- Scenario: next booking. WHEN a submit answers 201 and the same values are submitted again THEN the call carries a new key
#### BPG-007: Edit a row
The system SHALL let the user edit title, start and end of a row and send only the fields whose value changed.
- Scenario: title only. WHEN a booking starting `2030-01-07T09:00:30.123Z` has its title changed to "Retro" and is saved THEN `updateBooking` receives exactly `{ title: "Retro" }` and the list is fetched again
- Scenario: no change. WHEN the dialog is saved untouched THEN `updateBooking` is not called
- Scenario: invalid. WHEN end is not later than start THEN the field shows the BPG-005 error; WHEN the API answers 400 THEN its message is shown in the dialog
#### BPG-008: Delete a row
The system SHALL delete the row's booking, refetch, and step back to the previous page when the current one became empty.
- Scenario: last row of the last page. WHEN the only row of page 2 is deleted THEN page 1 is requested and shown
- Scenario: failure. WHEN `deleteBooking` rejects with 404 `NOT_FOUND.BOOKING` THEN an alert shows the API's message and the list is fetched again

## Design
- Tables `bookings` and `idempotency_keys` (entities and one migration in `libs/backend-common`); `idempotency_keys` is `key uuid PK`, `fingerprint char(64)` (SHA-256), `response_body jsonb`, `created_at`. The `uuid` column type gives the case-insensitive key comparison.
- Assumption: no response-status column. Only successful creates are stored (IDM-007) and `CreateBookingResultDto` carries no status, so the replayed status is always 201; a stored status would have no reader.
- Concurrency of create: inside the transaction, `pg_try_advisory_xact_lock(hashtextextended(key, 0))`; not obtained → IDM-006; obtained → read the key row → replay, IDM-005, or insert booking and key. The primary key on `key` is the database backstop. A hash collision can only cause a spurious, retriable 409.
- Order of create in the service: parse and check (BKG-003, BKG-004) → room lookup (BKG-005) → transaction → enqueue. A replay therefore also needs the room service; a 503 there is retried with the same key.
- Side effect after commit: the enqueue is not in the transaction. Recovery path is the replay (CNF-002, CNF-003): the client retries with the same key (BPG-006). A caller that never retries leaves the booking `PENDING` without a job; accepted, no sweep or outbox.
- Retention: confirmation jobs are kept (`removeOnComplete` and `removeOnFail` false) because the job id is what prevents a second job; at most one job per booking. Idempotency keys never expire (brief) and outlive a deleted booking. Bookings are hard-deleted.
- No foreign key from `bookings.room_id` to `rooms`: the room service owns rooms and has no delete path.
- Assumption: overlapping bookings of one room are allowed; the brief does not ask for a conflict rule.
- Assumption: an empty `roomId=` answers 400 as `ListBookingsQueryDto` dictates; the web app omits the parameter.
- `UpdateBookingDto` lets `null` through (`@IsOptional`) and `IsISO8601` accepts offset-less, date-only, week and ordinal forms; the contract is frozen, so the booking service rejects them (BKG-003, BKG-008).
- The worker has no database access: it reads and reports over NATS only. If the last report fails, the job stays in the failed set and the booking stays `PENDING`; logged, manual retry.
- The page shows and takes times in UTC (`datetime-local` value plus `:00.000Z`), so tests do not depend on the browser time zone. No polling: status refreshes on refetch. Delete has no confirm dialog.
- The room service pages with a fixed offset of 10 (`room.repository.ts`), so the web app fetches all rooms with `limit` `DEFAULT_PAGE_SIZE` page by page until `total` is reached.
- Home of each rule: instant grammar → `apps/booking/src/booking/booking-instant.ts`; span and null rule for create and update → `booking-input.ts`; fingerprint → `booking-fingerprint.ts`; key claim and replay decision → `idempotent-booking.repository.ts`; row-locked update and conditional confirmation UPDATE → `booking.repository.ts`; job options and timeout → `confirmation.producer.ts`; header check → gateway `idempotency-key.pipe.ts`; sender rules → worker `simulated-confirmation-sender.ts`; web form rules → `booking-form-schema.ts`; key lifecycle → `use-idempotency-key.ts`; UTC conversion → `utc-date-time.ts`.

## Risks
| Risk | Applies | Note | Task |
|---|---|---|---|
| R-01 | yes | `UpdateBookingDto` accepts null for title, startsAt, endsAt | T03 |
| R-02 | yes | PATCH merges with stored values; BKG-009 | T09 |
| R-03 | yes | enqueue after commit; CNF-003 and the replay path | T10 |
| R-04 | yes | offset-less instants pass `IsISO8601`; BKG-003 | T02 |
| R-05 | yes | validator accepts week, ordinal, date-only forms that `Date` reads differently | T02 |
| R-06 | yes | fingerprint and key comparison; IDM-004 | T04 |
| R-07 | yes | jobs and keys are kept by decision (Design); the spec asserts the job retention options | T10 |
| R-08 | yes | span check constraint and primary key on the idempotency key | T01 |
| R-09 | yes | advisory lock, row lock, conditional UPDATE, rollback | T09 |
| R-10 | yes | the processor completes on 404 and on an already SENT booking; assertions name CNF-007 | T16 |
| R-11 | yes | span rule on create and update (be) and in both web forms (fe) | T03 |
| R-12 | yes | raw SQL only for the advisory lock; no column list | T07 |
| R-13 | no | every new column has a reader; no status column (Design) | - |
| R-14 | yes | create form retry; BPG-006 | T23 |
| R-15 | yes | delete of the last row of a page; BPG-008 | T25 |
| R-16 | yes | room filter and select beyond one page; BPG-003 | T20 |
| R-17 | yes | edit shows minutes, stored values carry milliseconds; BPG-007 | T24 |

## Tasks
- [x] T01 @be [BKG-011, R-08] Booking and idempotency-key entities, migration with `CHK_bookings_span` and the key primary key, exports; integration spec inserts a violating span and a duplicate key directly and expects Postgres to refuse | libs/backend-common/src/lib/entities/booking.entity.ts, libs/backend-common/src/lib/entities/idempotency-key.entity.ts, libs/backend-common/src/lib/database/migrations/1731300000000-create-bookings.ts, libs/backend-common/src/lib/database/migrations/index.ts, libs/backend-common/src/lib/database/data-source.ts, libs/backend-common/src/index.ts, libs/backend-common/src/lib/database/booking-schema.int.spec.ts
- [x] T02 @be [BKG-003, R-04, R-05] Strict instant parser; spec covers every BKG-003 form and the same input under two `TZ` values | apps/booking/src/booking/booking-instant.ts, apps/booking/src/booking/booking-instant.spec.ts
- [x] T03 @be [BKG-004, BKG-008, R-01, R-11] Normalise a create body and merge an update onto a stored booking with one span rule and null rejection; spec drives the rule through both paths and sends null for each optional field | apps/booking/src/booking/booking-input.ts, apps/booking/src/booking/booking-input.spec.ts
- [x] T04 @be [IDM-004, R-06] Fingerprint of the normalised body; spec with two spellings equal and a title change different | apps/booking/src/booking/booking-fingerprint.ts, apps/booking/src/booking/booking-fingerprint.spec.ts
- [x] T05 @be [BKG-006, BKG-007, BKG-010] Repository: page with order, filter and `(page - 1) * limit` offset, find by id, delete; unit spec | apps/booking/src/booking/booking.repository.ts, apps/booking/src/booking/booking.repository.spec.ts
- [x] T06 @be [BKG-008, BKG-009, BKG-011, CNF-006] Repository: row-locked update writing only changed columns, constraint error mapped to 400, conditional confirmation UPDATE; unit spec | apps/booking/src/booking/booking.repository.ts, apps/booking/src/booking/booking.repository.spec.ts
- [x] T07 @be [IDM-002, IDM-003, IDM-005, IDM-006, R-12] Idempotent create in one transaction with the advisory lock; unit spec for created, replay, reuse and in-progress | apps/booking/src/booking/idempotent-booking.repository.ts, apps/booking/src/booking/idempotent-booking.repository.spec.ts
- [x] T08 @be [BKG-001, BKG-005, IDM-007, CNF-002] Booking service create flow in the Design order; spec asserts nothing is stored on 400, 404 and 503 and that a replay still enqueues with the same job id | apps/booking/src/booking/booking.service.ts, apps/booking/src/booking/booking.service.spec.ts
- [x] T09 @be [BKG-009, IDM-002, IDM-006, CNF-006, R-02, R-09] Integration spec on the real database: ten concurrent creates with one key, rollback leaves no key, two partial updates both survive, update against a confirmation result, results never move backwards | apps/booking/src/booking/booking-repositories.int.spec.ts
- [x] T10 @be [CNF-001, CNF-003, R-03, R-07] Confirmation producer with job options, retention and timeout; spec makes `add` reject and hang and asserts 503, the log and the retention options | apps/booking/src/booking/confirmation.producer.ts, apps/booking/src/booking/confirmation.producer.spec.ts
- [x] T11 @be [BKG-006, BKG-007, BKG-008, BKG-010, CNF-006] Booking service list, read, update, delete and record-confirmation with 404 mapping; spec | apps/booking/src/booking/booking.service.ts, apps/booking/src/booking/booking.service.spec.ts
- [x] T12 @be [BKG-001, CNF-006] NATS controller for the six `BookingPatternEnum` patterns, module with queue and NATS client registration; controller spec | apps/booking/src/booking/booking.controller.ts, apps/booking/src/booking/booking.controller.spec.ts, apps/booking/src/booking/booking.module.ts, apps/booking/src/app/app.module.ts
- [x] T13 @be [IDM-001] Gateway pipe for the `Idempotency-Key` header; spec for absent, empty, malformed and valid values | apps/gateway/src/booking/idempotency-key.pipe.ts, apps/gateway/src/booking/idempotency-key.pipe.spec.ts
- [x] T14 @be [BKG-001, BKG-002, BKG-006, BKG-007, BKG-008, BKG-010, IDM-003] Gateway bookings controller, forwarding service and module: 201, 200, 204, UUID param pipe, `Idempotency-Replayed` header only on a replay; specs for forwarding, statuses, header and DTO rejection | apps/gateway/src/booking/booking.controller.ts, apps/gateway/src/booking/booking.controller.spec.ts, apps/gateway/src/booking/booking.service.ts, apps/gateway/src/booking/booking.service.spec.ts, apps/gateway/src/booking/booking.module.ts, apps/gateway/src/app/app.module.ts
- [x] T15 @be [CNF-004] Simulated sender; spec for the three domain rules, case and look-alike addresses | apps/worker/src/confirmation/simulated-confirmation-sender.ts, apps/worker/src/confirmation/simulated-confirmation-sender.spec.ts
- [x] T16 @be [CNF-005, CNF-007, R-10] Confirmation processor and module wiring (queue, NATS client); spec for the three report sequences, the second run, the deleted booking and the 503 retry, each "completes without reporting" assertion naming CNF-007 | apps/worker/src/confirmation/confirmation.processor.ts, apps/worker/src/confirmation/confirmation.processor.spec.ts, apps/worker/src/confirmation/confirmation.module.ts, apps/worker/src/app/app.module.ts
- [x] T17 @fe [BPG-002, BPG-005, BPG-007, BPG-008] Booking service layer: list, create with the key header, update, delete; spec | apps/web/src/services/booking.service.ts, apps/web/src/services/booking.service.spec.ts
- [x] T18 @fe [BPG-002, BPG-005] UTC helpers: display format and `datetime-local` to ISO and back; spec independent of `TZ` | apps/web/src/views/bookings/utc-date-time.ts, apps/web/src/views/bookings/utc-date-time.spec.ts
- [x] T19 @fe [BPG-005, BPG-007, R-11] One yup schema for the create and edit forms (required, email, title length, end later than start); spec runs the span rule through both shapes | apps/web/src/views/bookings/booking-form-schema.ts, apps/web/src/views/bookings/booking-form-schema.spec.ts
- [x] T20 @fe [BPG-003, R-16] Hook that loads every room page by page; spec with 12 rooms over two pages | apps/web/src/views/bookings/use-all-rooms.ts, apps/web/src/views/bookings/use-all-rooms.spec.tsx
- [x] T21 @fe [BPG-002, BPG-003, BPG-004] Bookings page with table, pagination, room filter and the loading, empty and error states; spec with the service layer mocked | apps/web/src/views/bookings/bookings-page.tsx, apps/web/src/views/bookings/bookings-page.spec.tsx, apps/web/src/views/bookings/bookings-table.tsx, apps/web/src/views/bookings/bookings-table.spec.tsx, apps/web/src/views/bookings/room-filter.tsx
- [x] T22 @fe [BPG-005] Create form wired into the page; spec for submit, client validation and API error | apps/web/src/views/bookings/create-booking-form.tsx, apps/web/src/views/bookings/create-booking-form.spec.tsx, apps/web/src/views/bookings/bookings-page.tsx
- [x] T23 @fe [BPG-006, R-14] Idempotency-key hook used by the create form; spec: 503 then retry sends the same key, an edit then submit sends a new one, a 201 drops it, a 409 in-progress keeps it | apps/web/src/views/bookings/use-idempotency-key.ts, apps/web/src/views/bookings/use-idempotency-key.spec.tsx, apps/web/src/views/bookings/create-booking-form.tsx, apps/web/src/views/bookings/create-booking-form.spec.tsx
- [x] T24 @fe [BPG-007, R-17] Edit dialog sending only changed fields; spec edits the title of a booking with seconds and milliseconds and expects exactly `{ title }` | apps/web/src/views/bookings/edit-booking-dialog.tsx, apps/web/src/views/bookings/edit-booking-dialog.spec.tsx, apps/web/src/views/bookings/bookings-page.tsx
- [x] T25 @fe [BPG-008, R-15] Delete with refetch and step back; spec deletes the only row of page 2 and expects page 1 | apps/web/src/views/bookings/bookings-page.tsx, apps/web/src/views/bookings/bookings-page.spec.tsx, apps/web/src/views/bookings/bookings-table.tsx
- [x] T26 @fe [BPG-001] `/bookings` route and the "Bookings" navigation link; layout spec | apps/web/src/pages/bookings/index.tsx, apps/web/src/layouts/app-layout.tsx, apps/web/src/layouts/app-layout.spec.tsx
- [x] T27 @main [verify] Integration specs of `backend-common` and `booking` against the stack (cr/rules.md → Commands)
- [x] T28 @main [verify] `pnpm run build`, `pnpm run lint`, `pnpm run test`
