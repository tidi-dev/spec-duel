# Feature Specification: Meeting-Room Bookings

**Feature Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/001-room-bookings`)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Add bookings to roombook: people book a meeting room for a time span, and get a confirmation." The description has four parts — a bookings API on the gateway, idempotent create, a confirmation job, and a `/bookings` page — plus a scope limit (the shared contract, the `room` service and the `/rooms` page are not changed) and a definition of done. Every rule it states is carried into this specification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Book a room and manage the booking (Priority: P1)

A person books a meeting room for a time span by giving the room, a title, the organizer's email, a start and an end. They can list bookings (all, or for one room), read one, change its title or times, and delete it.

**Why this priority**: Bookings are the feature. Every other story depends on a booking existing.

**Independent Test**: Through the gateway alone, create a booking for an existing room, list it, read it, change its end time, delete it, and confirm that reading it afterwards answers "not found".

**Acceptance Scenarios**:

1. **Given** an existing room, **When** a valid booking is created with a valid `Idempotency-Key`, **Then** the answer is 201 with the booking, whose `confirmationStatus` is `PENDING` and `confirmationAttempts` is 0.
2. **Given** bookings in several rooms, **When** the list is requested without `roomId`, **Then** the answer is `{ items, total, page, limit }` with all bookings ordered by `startsAt` ascending, 10 per page by default.
3. **Given** bookings in several rooms, **When** the list is requested with a `roomId`, **Then** only that room's bookings are counted and returned.
4. **Given** an existing booking, **When** it is read by id, **Then** the answer is 200 with the booking.
5. **Given** no booking with that id, **When** it is read, updated or deleted, **Then** the answer is 404 with `NOT_FOUND.BOOKING`.
6. **Given** an existing booking, **When** its `title`, `startsAt` and/or `endsAt` are changed, **Then** the answer is 200 with the updated booking and a later `updatedAt`.
7. **Given** an existing booking, **When** it is deleted, **Then** the answer is 204 and reading it afterwards answers 404 with `NOT_FOUND.BOOKING`.
8. **Given** a body with a missing or malformed field, **When** a create or update is requested, **Then** the answer is 400 and nothing is stored.
9. **Given** `endsAt` equal to or earlier than `startsAt`, **When** a booking is created, **Then** the answer is 400 with `BAD_REQUEST.VALIDATION`.
10. **Given** an existing booking, **When** an update changes only one of the two times so that the stored pair would no longer have `endsAt` later than `startsAt`, **Then** the answer is 400 with `BAD_REQUEST.VALIDATION` and the booking is unchanged.
11. **Given** a `roomId` that matches no room, **When** a booking is created, **Then** the answer is 404 with `NOT_FOUND.ROOM` and nothing is stored.

---

### User Story 2 - Retry a create safely (Priority: P2)

A client that is unsure whether its create request arrived can send it again with the same `Idempotency-Key` and never ends up with two bookings.

**Why this priority**: Without it, a network error during create leaves the client a choice between a possible duplicate and a possible lost booking.

**Independent Test**: Send the same create request twice with one key and observe one booking and an identical second answer marked as replayed; then vary the body, the key and the timing to observe each documented error.

**Acceptance Scenarios**:

1. **Given** a create request without an `Idempotency-Key` header, or with a value that is not a UUID, **When** it is sent, **Then** the answer is 400 with `BAD_REQUEST.IDEMPOTENCY_KEY` and nothing is stored.
2. **Given** a key that has not been used, **When** a valid create is sent, **Then** the booking is created and the key, a fingerprint of the request body and the response are stored together with it, all or nothing.
3. **Given** a completed create, **When** the same key is sent with the same body, **Then** the stored status and body are answered unchanged with the response header `Idempotency-Replayed: true`, no second booking exists and no second confirmation job is enqueued.
4. **Given** a completed create, **When** the booking is later updated or deleted and the same key and body are sent again, **Then** the originally stored answer is still returned unchanged.
5. **Given** a completed create, **When** the same key is sent with a different body, **Then** the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.
6. **Given** a create that is still being processed, **When** the same key arrives again, **Then** the answer is 409 with `CONFLICT.IDEMPOTENCY_IN_PROGRESS`.
7. **Given** two identical create requests with the same key arriving at the same moment, **When** both are processed, **Then** exactly one booking exists; the other request is answered with either the replay or the 409.
8. **Given** a create that failed validation (invalid body, `endsAt` not later than `startsAt`, or unknown room), **When** the same key is sent again with a corrected body, **Then** it is treated as a first request and the booking is created.
9. **Given** a key used long ago, **When** it is sent again, **Then** it behaves exactly as above: keys do not expire.

---

### User Story 3 - Get a confirmation (Priority: P3)

After a booking is created, the organizer is "sent" a confirmation in the background, and the booking shows whether that succeeded and how many attempts it took.

**Why this priority**: It completes the promise "and get a confirmation", but a booking is already usable without it.

**Independent Test**: Create three bookings whose organizer addresses are an ordinary one, one at `@retry.example` and one at `@bounce.example`; after the retries have run, read each booking and compare its status and attempts with the fixed rules.

**Acceptance Scenarios**:

1. **Given** a newly created booking, **When** creation completes, **Then** exactly one confirmation job for that booking is on the `booking-confirmation` queue, with payload `{ bookingId }`, the job id `confirmationJobId(bookingId)`, 3 attempts and exponential backoff starting at 1 second.
2. **Given** an organizer address in any ordinary domain, **When** the job runs, **Then** the booking ends as `SENT` with 1 attempt.
3. **Given** an organizer address ending in `@retry.example`, **When** the job runs, **Then** the first two attempts fail, the third succeeds, and the booking ends as `SENT` with 3 attempts.
4. **Given** an organizer address ending in `@bounce.example`, **When** the job runs, **Then** every attempt fails and after the third the booking ends as `FAILED` with 3 attempts.
5. **Given** a booking whose confirmation already ended as `SENT` or `FAILED`, **When** the processor runs again for the same booking, **Then** the booking's status and attempts are unchanged.
6. **Given** the same attempt outcome is reported twice, **When** the second report arrives, **Then** the booking is in the same state as after the first.
7. **Given** a replayed create (User Story 2), **When** it is answered, **Then** the booking still has exactly one confirmation job.

---

### User Story 4 - Manage bookings from the web page (Priority: P4)

A person opens the Bookings page from the navigation, sees the bookings in a table, filters them by room, creates a booking with a form, and edits or deletes a row.

**Why this priority**: It is the human-facing surface of stories 1–3 and needs them to exist first.

**Independent Test**: With the service layer mocked, render the page and exercise the table, the filter, the create form, edit, delete, and the loading, empty and error states. Against a running system, do the same by hand at `/bookings`.

**Acceptance Scenarios**:

1. **Given** any page of the app, **When** the navigation is shown, **Then** it has a "Bookings" link that opens `/bookings`.
2. **Given** bookings exist, **When** the page loads, **Then** a table shows for each booking its title, room name, organizer, start, end and confirmation status.
3. **Given** the room list, **When** a room is chosen in the filter above the table, **Then** the table shows only that room's bookings; clearing the filter shows all of them again.
4. **Given** the create form filled with room, title, organizer email, start and end, **When** it is submitted successfully, **Then** the new booking appears in the table.
5. **Given** a submission that ended in a network error (no answer from the API), **When** the person retries the same submission, **Then** the request carries the same `Idempotency-Key` as the first try.
6. **Given** a submission that the API answered, successfully or with an error, **When** the form is submitted again, **Then** that is a new submission with a new `Idempotency-Key`.
7. **Given** a row, **When** its title, start or end is edited and saved, **Then** the row shows the updated values.
8. **Given** a row, **When** it is deleted and the deletion is confirmed, **Then** the row disappears from the table.
9. **Given** bookings are being fetched, **When** the page is shown, **Then** a loading state is visible.
10. **Given** there are no bookings (or none for the chosen room), **When** the page loads, **Then** an empty state is shown instead of an empty table.
11. **Given** the API answers an error to a load, create, edit or delete, **When** the page shows the failure, **Then** it shows the `message` from the API's error answer.

---

### Edge Cases

- **Header and body both invalid on create**: the idempotency key is checked first, so the answer is 400 with `BAD_REQUEST.IDEMPOTENCY_KEY`.
- **Same key, different body, first request still in progress**: the body mismatch wins, so the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.
- **Update with an empty body**: answered 200 with the booking unchanged.
- **Update that tries to change `roomId` or `organizerEmail`**: answered 400; only `title`, `startsAt` and `endsAt` can be changed.
- **An id in the path that is not a UUID**: answered 400 with `BAD_REQUEST.VALIDATION`.
- **`page` below 1, `limit` below 1 or above 100, or a `roomId` filter that is not a UUID**: answered 400 with `BAD_REQUEST.VALIDATION`.
- **A `roomId` filter for a room that does not exist**: answered 200 with an empty list; the filter does not check the room.
- **Two bookings for the same room at overlapping times**: both are accepted; this feature has no overlap rule.
- **A booking in the past**: accepted.
- **Booking deleted before its confirmation job runs or finishes**: the job ends quietly without further retries, and a late outcome report for the missing booking changes nothing.
- **The `room` service does not answer during create**: answered with `UNAVAILABLE.SERVICE`; nothing is stored and the key can be used again.
- **The queue is unreachable right after the booking is stored**: the create still answers 201 and the booking stays `PENDING`; recovering such a booking is outside this feature.
- **The form is edited after a network error**: the edited form is a new submission and gets a new `Idempotency-Key`.
- **More than one page of bookings on the web page**: the table offers paging at 10 per page.

## Requirements *(mandatory)*

### Functional Requirements

**Bookings (gateway, under `/api`)**

- **FR-001**: The system MUST expose a booking as `id`, `roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt`, `confirmationStatus` (`PENDING`, `SENT` or `FAILED`), `confirmationAttempts`, `createdAt` and `updatedAt`, with every time in ISO 8601 UTC.
- **FR-002**: `POST /api/bookings` MUST create a booking and answer 201 with it; a new booking MUST start with `confirmationStatus` `PENDING` and `confirmationAttempts` 0.
- **FR-003**: `GET /api/bookings` MUST answer `{ items, total, page, limit }` ordered by `startsAt` ascending, with `page` defaulting to 1, `limit` defaulting to 10 (maximum 100), and an optional `roomId` that restricts both `items` and `total` to that room.
- **FR-004**: `GET /api/bookings/:id` MUST answer 200 with the booking, or 404 with `NOT_FOUND.BOOKING`.
- **FR-005**: `PATCH /api/bookings/:id` MUST change only `title`, `startsAt` and/or `endsAt` and answer 200 with the updated booking, or 404 with `NOT_FOUND.BOOKING`.
- **FR-006**: `DELETE /api/bookings/:id` MUST answer 204, or 404 with `NOT_FOUND.BOOKING`; a deleted booking MUST be gone, so that reading it afterwards answers 404.
- **FR-007**: Every error MUST be answered as `{ statusCode, errorCode, message }` with `errorCode` taken from the shared contract.
- **FR-008**: An invalid body MUST be answered with 400 and store nothing. A title is 1 to 120 characters, `organizerEmail` is an email address, `roomId` is a UUID, and both times are strict ISO 8601.
- **FR-009**: `endsAt` MUST be later than `startsAt`; equal or earlier MUST be answered with 400 and `BAD_REQUEST.VALIDATION`. After an update, the rule MUST hold for the resulting stored pair of times, including when only one of them was sent.
- **FR-010**: The room of a new booking MUST exist. The `booking` service MUST ask the `room` service, and an unknown room MUST be answered with 404 and `NOT_FOUND.ROOM`.
- **FR-011**: The `booking` service MUST own bookings and their storage. The gateway MUST only validate and forward; it holds no booking rules and no storage.

**Idempotent create**

- **FR-012**: `POST /api/bookings` MUST require the `Idempotency-Key` request header with a UUID value; a missing or non-UUID value MUST be answered with 400 and `BAD_REQUEST.IDEMPOTENCY_KEY`.
- **FR-013**: On the first request with a key, the system MUST store the key, a fingerprint of the request body, and the response. Claiming the key and inserting the booking MUST happen in one database transaction.
- **FR-014**: The same key with the same body, after the first request completed, MUST be answered with the stored status and body, unchanged, plus the response header `Idempotency-Replayed: true`; it MUST NOT create a second booking or enqueue a second confirmation job.
- **FR-015**: The same key with a different body MUST be answered with 422 and `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.
- **FR-016**: The same key while the first request is still being processed MUST be answered with 409 and `CONFLICT.IDEMPOTENCY_IN_PROGRESS`.
- **FR-017**: Two identical requests arriving at the same moment MUST never create two bookings.
- **FR-018**: A request that fails validation (FR-008, FR-009, FR-010) MUST NOT be stored against its key; the key MUST remain usable.
- **FR-019**: Idempotency keys MUST NOT expire.

**Confirmation job**

- **FR-020**: When a booking is created, the `booking` service MUST enqueue exactly one confirmation job on the queue `booking-confirmation` with payload `{ bookingId }`.
- **FR-021**: The job id MUST be `confirmationJobId(bookingId)`, so that a booking can never have two confirmation jobs.
- **FR-022**: The job MUST be given 3 attempts with exponential backoff starting at 1 second.
- **FR-023**: The `worker` service MUST process the job: it "sends" the confirmation and reports the outcome to the `booking` service over the message bus, and the `booking` service MUST update the booking's `confirmationStatus` and `confirmationAttempts`. The worker MUST NOT have database access.
- **FR-024**: Nothing MUST really be sent. The simulated sender MUST decide by the booking's `organizerEmail`:
  - ending in `@retry.example`: fail on attempts 1 and 2, succeed on attempt 3 — the booking ends as `SENT` with 3 attempts;
  - ending in `@bounce.example`: fail on every attempt — after the third the booking ends as `FAILED` with 3 attempts;
  - any other address: succeed on attempt 1 — `SENT` with 1 attempt.
- **FR-025**: The processor MUST be safe to run twice for the same booking: a repeated run or a repeated outcome report MUST NOT change a booking that already ended as `SENT` or `FAILED`, and MUST NOT lower `confirmationAttempts`.

**Bookings page (`apps/web`)**

- **FR-026**: The web app MUST have a `/bookings` page and a "Bookings" link in the navigation.
- **FR-027**: The page MUST show a table of bookings with title, room name, organizer, start, end and confirmation status.
- **FR-028**: The page MUST have a room filter above the table, filled from the room list.
- **FR-029**: The page MUST have a form to create a booking with room, title, organizer email, start and end.
- **FR-030**: Each form submission MUST generate one `Idempotency-Key`; a retry of the same submission after a network error MUST reuse that key.
- **FR-031**: Each row MUST offer edit (title, start, end) and delete.
- **FR-032**: The page MUST have loading, empty and error states; an error MUST show the `message` from the API.

**Scope and completion**

- **FR-033**: The shared contract (`libs/contract`), the `room` service and the `/rooms` page MUST NOT be changed. Every route name, message pattern, DTO class, error code, header name, queue name and constant MUST come from the shared contract as it is.
- **FR-034**: New and changed services MUST have unit tests, and the page MUST have tests with the service layer mocked.
- **FR-035**: `pnpm run build`, `pnpm run lint` and `pnpm run test` MUST pass.

### Key Entities

- **Booking**: one reservation of one room for a time span. Holds the room it is for, a title, the organizer's email, start and end, the state of its confirmation (status and number of attempts), and when it was created and last updated. Belongs to exactly one room; owned by the `booking` service.
- **Room**: an existing meeting room with a name and a capacity. Read-only for this feature; owned by the `room` service.
- **Idempotency record**: one per `Idempotency-Key`. Holds the key, the fingerprint of the request body it was first used with, whether that request is still in progress or completed, and the stored response (status and body). Never expires.
- **Confirmation job**: one background task per booking, identified by the booking, that drives the simulated sending with up to 3 attempts.
- **Confirmation outcome**: the report the worker gives the `booking` service after an attempt: the booking, the resulting status, and the attempt count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can create, find, change and delete a booking, and 100% of the documented answers (success and error) match this specification when exercised end to end through the gateway.
- **SC-002**: Sending the same create request with the same key any number of times, one after another or at the same moment, results in exactly 1 booking and exactly 1 confirmation job, in 100% of trials.
- **SC-003**: Every replayed answer is identical in status and body to the original answer and is marked as replayed.
- **SC-004**: With the default retry timing, every booking reaches its final confirmation state within 10 seconds of creation: ordinary address `SENT` with 1 attempt, `@retry.example` `SENT` with 3 attempts, `@bounce.example` `FAILED` with 3 attempts.
- **SC-005**: Running the confirmation processor a second time for any booking leaves its status and attempts unchanged in 100% of trials.
- **SC-006**: On the Bookings page a person can create a booking in under 1 minute and can filter, edit and delete without leaving the page; every failure shows the API's own message.
- **SC-007**: The repository's build, lint and test commands all pass, and the `room` service, the `/rooms` page and the shared contract show no changes.

## Assumptions

- **No sign-in**: roombook has no authentication, so anyone who can reach the gateway or the page can create, change and delete any booking.
- **No overlap rule**: the description does not forbid two bookings of one room at the same time and the contract has no error code for it, so overlapping bookings are accepted.
- **Past bookings**: start and end may be in the past.
- **Invalid body error code**: "an invalid body answers 400" is answered with `BAD_REQUEST.VALIDATION`, the only general validation code in the contract. The same code is used for an invalid list query or a path id that is not a UUID.
- **"Fails validation" includes the room check**: the unknown-room answer is listed under validation in the description, so a 404 `NOT_FOUND.ROOM` create is not stored against its key either.
- **"Same body"**: two bodies are the same when the five create fields (`roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt`) have the same values; field order and whitespace in the JSON do not matter.
- **Mismatch before in-progress**: when a key is reused with a different body, the 422 applies whether or not the first request has completed.
- **Replay is a snapshot**: a replay returns the response as first stored, even if the booking was changed or deleted since.
- **Intermediate attempts**: the worker reports after every attempt, so a booking whose attempt failed but has retries left shows `PENDING` with the number of attempts made so far.
- **How the worker learns the organizer address**: the job carries only the booking id and the worker has no database, so the worker asks the `booking` service for the booking; a booking that no longer exists ends the job without retries.
- **Updates and deletes do not notify**: changing or deleting a booking sends no new confirmation and does not cancel a pending one.
- **Queue failure after storing**: if the confirmation job cannot be enqueued, the booking is kept, the create answers 201, and the booking stays `PENDING`. No recovery mechanism is part of this feature.
- **Empty update**: an update with no fields is valid and changes nothing.
- **Web page times**: start and end are entered and shown in the browser's local time zone and sent to the API in UTC.
- **Web page paging**: the table shows 10 bookings per page with paging controls; the room filter and room names come from the first 100 rooms of the room list.
- **Delete confirmation**: the page asks the person to confirm before deleting a row.
- **New key rule on the page**: only a network error (no answer from the API) keeps the key for the next try; any answered request, or any change to the form, starts a new submission with a new key.
- **Dependencies**: the existing gateway, `booking`, `room` and `worker` services, their database, message bus and queue infrastructure, and the shared contract are used as they are; no new dependency is added.
- **Technical terms in this specification**: routes, status codes, error codes, header names and the queue name are part of the feature description's stated external behaviour and are kept verbatim so that the specification stays testable against the shared contract.
