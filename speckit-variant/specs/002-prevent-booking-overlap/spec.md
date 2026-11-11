# Feature Specification: No Overlapping Bookings for the Same Room

**Feature Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/002-prevent-booking-overlap`)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Change: bookings for the same room may no longer overlap. Today two bookings can occupy the same room at the same time. That must stop." The description has a list of required behaviour (create and update rejected with 409 `CONFLICT.BOOKING_OVERLAP`, half-open time spans, no self-conflict, other rooms unaffected, simultaneous creates, everything else unchanged), one contract change (the new error code), one frontend rule (show the API's message next to the form and keep the input), a scope limit (the `room` service and the `/rooms` page are not changed; no data migration) and a definition of done. Every rule it states is carried into this specification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A room cannot be double-booked on create (Priority: P1)

A person who tries to book a room for a time span that is already taken, fully or partly, by another booking of that room is told so, and no booking is made. A span that only touches an existing booking, or the same span in another room, is still accepted.

**Why this priority**: This is the change. A room that two groups both hold for the same time is the failure the feature exists to stop, and create is where almost every booking comes from.

**Independent Test**: Through the gateway alone, create a booking for a room, then send further creates for the same room that overlap it, touch it, and sit in another room, and compare each answer with the scenarios below.

**Acceptance Scenarios**:

1. **Given** a booking of room R from 10:00 to 11:00, **When** a create for room R from 10:30 to 11:30 is sent, **Then** the answer is 409 with `CONFLICT.BOOKING_OVERLAP` and no booking is stored.
2. **Given** a booking of room R from 10:00 to 11:00, **When** a create for room R with exactly the same span, a span inside it (10:15 to 10:45) or a span that contains it (09:00 to 12:00) is sent, **Then** each is answered 409 with `CONFLICT.BOOKING_OVERLAP`.
3. **Given** a booking of room R from 10:00 to 11:00, **When** a create for room R from 11:00 to 12:00 is sent, **Then** the answer is 201: a booking that starts exactly when another ends does not overlap it.
4. **Given** a booking of room R from 10:00 to 11:00, **When** a create for room R from 09:00 to 10:00 is sent, **Then** the answer is 201: a booking that ends exactly when another starts does not overlap it.
5. **Given** a booking of room R from 10:00 to 11:00, **When** a create for a different room S from 10:00 to 11:00 is sent, **Then** the answer is 201.
6. **Given** a booking of room R that has since been deleted, **When** a create for room R with the same span is sent, **Then** the answer is 201: a deleted booking blocks nothing.
7. **Given** a create that was rejected for overlap, **When** the system is inspected, **Then** no booking exists for that request, no confirmation job was enqueued for it, and nothing is stored against its `Idempotency-Key`.
8. **Given** a create that was rejected for overlap, **When** the same `Idempotency-Key` is sent again with a body whose span is free, **Then** it is treated as a first request and the answer is 201.
9. **Given** a create that was rejected for overlap, **When** the same `Idempotency-Key` and the same body are sent again while the conflicting booking still exists, **Then** the answer is again 409 with `CONFLICT.BOOKING_OVERLAP` and is not marked as replayed.
10. **Given** a create that succeeded, **When** the same `Idempotency-Key` and body are sent again, **Then** the stored answer is replayed unchanged, exactly as before this change.

---

### User Story 2 - A room cannot be double-booked by moving a booking (Priority: P2)

A person who changes the times of a booking so that it would run into another booking of the same room is told so, and the booking stays as it was. Changes that stay clear of other bookings, including changes inside the booking's own span, still succeed.

**Why this priority**: Without it, the rule of User Story 1 can be bypassed by creating a booking in a free span and then moving it.

**Independent Test**: Through the gateway alone, create two bookings of one room that do not overlap, then update one of them with times that overlap the other, touch the other, and stay within its own span, and compare each answer with the scenarios below.

**Acceptance Scenarios**:

1. **Given** bookings A (10:00 to 11:00) and B (11:00 to 12:00) of room R, **When** A's end is changed to 11:30, **Then** the answer is 409 with `CONFLICT.BOOKING_OVERLAP` and A is unchanged.
2. **Given** bookings A (10:00 to 11:00) and B (12:00 to 13:00) of room R, **When** only B's start is changed to 10:30, **Then** the answer is 409 with `CONFLICT.BOOKING_OVERLAP` and B is unchanged: the rule applies to the resulting stored pair of times, including when only one of them was sent.
3. **Given** bookings A (10:00 to 11:00) and B (12:00 to 13:00) of room R, **When** A's end is changed to 12:00, **Then** the answer is 200: A now ends exactly when B starts.
4. **Given** a booking A, **When** only its title is changed, **Then** the answer is 200.
5. **Given** a booking A (10:00 to 11:00), **When** its times are changed to 10:15 to 10:45, **Then** the answer is 200: a booking never conflicts with itself.
6. **Given** a booking A (10:00 to 11:00) with no neighbours in room R, **When** its times are changed to 10:30 to 11:30, **Then** the answer is 200: overlapping its own previous span is not a conflict.
7. **Given** booking A of room R and booking C of room S with the same span, **When** A's times are changed to any span that is free in room R, **Then** the answer is 200 regardless of C.

---

### User Story 3 - Two people cannot take the same room at the same moment (Priority: P3)

When two overlapping create requests for the same room arrive at the same moment, one person gets the room and the other is told it is taken. The room never ends up with both bookings.

**Why this priority**: The rule of User Story 1 is only trustworthy if it also holds when requests race; it builds on that story and matters under load rather than in everyday single use.

**Independent Test**: Send two overlapping creates for the same room at the same moment, each with its own `Idempotency-Key`, many times over; after every round count the answers and the stored bookings.

**Acceptance Scenarios**:

1. **Given** a free span in room R, **When** two overlapping creates for room R with different `Idempotency-Key` values arrive at the same moment, **Then** exactly one is answered 201 and the other is answered 409 with `CONFLICT.BOOKING_OVERLAP`.
2. **Given** the race of scenario 1 has finished, **When** the system is inspected, **Then** exactly one booking exists for that span, exactly one confirmation job was enqueued, and only the successful request's key holds a stored response.
3. **Given** two creates for different rooms with the same span arriving at the same moment, **When** both are processed, **Then** both are answered 201.
4. **Given** two creates for the same room whose spans only touch arriving at the same moment, **When** both are processed, **Then** both are answered 201.

---

### User Story 4 - See the conflict on the Bookings page without losing the input (Priority: P4)

A person who submits the create form or saves an edit on the `/bookings` page and is rejected for overlap sees the API's message next to the form they were filling in, with everything they typed still there, so they can pick another time and try again.

**Why this priority**: It is the human-facing surface of stories 1 and 2 and needs them to exist first.

**Independent Test**: With the service layer mocked to answer an overlap rejection, render the page, submit the create form and save an edit, and check the message and the kept values. Against a running system, do the same by hand at `/bookings`.

**Acceptance Scenarios**:

1. **Given** the create form filled in, **When** it is submitted and the API rejects it for overlap, **Then** the API's `message` is shown next to the create form and the room, title, organizer email, start and end still hold what the person typed.
2. **Given** a row being edited, **When** the edit is saved and the API rejects it for overlap, **Then** the API's `message` is shown next to the edit form, the edit form stays open and its title, start and end still hold what the person typed.
3. **Given** an overlap message is shown next to a form, **When** the person changes the times to a free span and submits again, **Then** the request succeeds, the message disappears and the table shows the new or updated booking.
4. **Given** a create that was rejected for overlap, **When** the form is submitted again, **Then** that is a new submission with a new `Idempotency-Key`, as for any request the API answered.
5. **Given** an edit that was rejected for overlap, **When** the table is looked at, **Then** the row still shows the booking's stored values.

---

### Edge Cases

- **Overlap of a single instant**: spans are half-open, so 10:00–11:00 and 11:00–12:00 do not overlap; 10:00–11:00 and 10:59:59.999–12:00 do.
- **More than one existing booking is overlapped**: the answer is one 409 with `CONFLICT.BOOKING_OVERLAP`; the conflicting bookings are not listed.
- **The overlapped booking's confirmation state**: irrelevant; a booking blocks its span whether it is `PENDING`, `SENT` or `FAILED`.
- **Bookings in the past**: they are still accepted and are subject to the same rule.
- **Create that is invalid and would also overlap**: the earlier checks win in their existing order — `BAD_REQUEST.IDEMPOTENCY_KEY`, then `BAD_REQUEST.VALIDATION`, then `NOT_FOUND.ROOM` — and overlap is checked last.
- **Update of a booking that does not exist, or with invalid times, that would also overlap**: answered 404 `NOT_FOUND.BOOKING` or 400 `BAD_REQUEST.VALIDATION` as today; overlap is checked last.
- **Update with an empty body**: still answered 200 with the booking unchanged.
- **Same key reused with a different body after an overlap rejection**: the rejected request stored nothing, so the new body is a first request; no 422.
- **Same key arrives again while the first request with it is still being processed**: answered as today (422 on a different body, otherwise 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS`), whether or not the first request ends in an overlap rejection.
- **Two identical creates with the same key at the same moment**: unchanged; exactly one booking, and the other request gets the replay or `CONFLICT.IDEMPOTENCY_IN_PROGRESS`, never `CONFLICT.BOOKING_OVERLAP` caused by its own twin.
- **A replay after the booking was deleted and its span taken by another booking**: the originally stored 201 is still replayed unchanged; a replay creates nothing, so no overlap check applies.
- **An update racing with a create or another update for the same room**: at most one of two changes that would overlap each other succeeds; the other is answered 409 with `CONFLICT.BOOKING_OVERLAP`.
- **A delete racing with a create for the same span**: the create is answered 201 or 409 depending on which is processed first; both outcomes are correct.
- **Other failures on the page (validation, unknown room, network error)**: shown as they are today; this change adds no new behaviour for them.

## Requirements *(mandatory)*

### Functional Requirements

**Overlap rule**

- **FR-001**: Two bookings overlap when they are for the same room and each one starts before the other ends. Spans are half-open: a booking that starts exactly when another ends, or ends exactly when another starts, does not overlap it.
- **FR-002**: The system MUST never hold two overlapping bookings of the same room as a result of any create or update accepted after this change.
- **FR-003**: Bookings of different rooms MUST never conflict with each other, whatever their spans.
- **FR-004**: Only bookings that currently exist count. A deleted booking MUST NOT block anything, and a booking's confirmation state MUST NOT affect the rule.

**Create**

- **FR-005**: `POST /api/bookings` for a span that overlaps an existing booking of the same room MUST be answered with 409 and `{ statusCode, errorCode, message }` where `errorCode` is `CONFLICT.BOOKING_OVERLAP`.
- **FR-006**: A create rejected for overlap MUST store no booking and MUST NOT enqueue a confirmation job.
- **FR-007**: A create rejected for overlap MUST NOT be stored against its `Idempotency-Key`: the key MUST remain usable, a later request with it MUST be treated as a first request, and the rejection MUST never be answered as a replay.
- **FR-008**: The overlap check MUST come after the existing create checks, so that an invalid key, an invalid body or an unknown room is answered exactly as before.

**Update**

- **FR-009**: `PATCH /api/bookings/:id` MUST be answered with 409 and `CONFLICT.BOOKING_OVERLAP` when the resulting stored span of the booking would overlap another booking of the same room, including when only one of the two times was sent. The booking MUST then be unchanged.
- **FR-010**: A booking MUST never conflict with itself. Changing only its title, shortening it within its own span, or moving it to a span that overlaps only its own previous span MUST succeed.
- **FR-011**: The overlap check MUST come after the existing update checks, so that an unknown booking or an invalid pair of times is answered exactly as before.

**Simultaneous requests**

- **FR-012**: When two overlapping creates for the same room arrive at the same moment, exactly one MUST be answered 201 and the other MUST be answered 409 with `CONFLICT.BOOKING_OVERLAP`. The loser MUST leave no booking, no confirmation job and no stored idempotent response.
- **FR-013**: The guarantee of FR-002 MUST also hold when an update races with a create or with another update for the same room.
- **FR-014**: Simultaneous requests for different rooms, or for spans of the same room that do not overlap, MUST NOT be rejected because of each other.

**Contract**

- **FR-015**: The error code `CONFLICT.BOOKING_OVERLAP` MUST be added to `ErrorCodeEnum` in the shared contract (`libs/contract`). This MUST be the only change to the contract.
- **FR-016**: The overlap rejection MUST carry a human-readable `message` that says the room is already booked for that time.

**Bookings page (`apps/web`)**

- **FR-017**: When a create on the `/bookings` page is rejected for overlap, the page MUST show the API's `message` next to the create form and MUST keep every value the person typed.
- **FR-018**: When an edit on the `/bookings` page is rejected for overlap, the page MUST show the API's `message` next to the edit form, keep the edit form open and keep every value the person typed.
- **FR-019**: The message MUST disappear once the form is submitted again successfully.

**Unchanged behaviour and scope**

- **FR-020**: Everything else about bookings MUST stay as specified in `specs/001-room-bookings`: listing, reading, deleting, validation, the idempotent create (replay, 422 on a reused key, 409 while in progress, keys that never expire) and the confirmation job.
- **FR-021**: The `room` service and the `/rooms` page MUST NOT be changed.
- **FR-022**: No migration or clean-up of existing data MUST be part of this change.

**Completion**

- **FR-023**: The behaviour above MUST hold end to end through the gateway.
- **FR-024**: New and changed services MUST have unit tests.
- **FR-025**: `pnpm run build`, `pnpm run lint` and `pnpm run test` MUST pass.

### Key Entities

- **Booking**: one reservation of one room for a half-open time span, from its start up to but not including its end. Unchanged in shape; it gains the rule that no other booking of the same room may share any part of its span.
- **Room**: the scope of the overlap rule. Bookings are compared only with bookings of the same room. Read-only for this change.
- **Overlap rejection**: the error answer given when a create or update would break the rule: status 409, the new error code `CONFLICT.BOOKING_OVERLAP` and a message for the person.
- **Idempotency record**: unchanged. It is written only for creates that succeed, so an overlap rejection never has one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any sequence of creates and updates, the number of pairs of overlapping bookings in the same room is 0.
- **SC-002**: 100% of creates and updates that would overlap another booking of the same room are answered with the overlap rejection, and 100% of those that only touch another booking, stay within their own span, or concern another room are accepted.
- **SC-003**: In 100 rounds of two overlapping creates for the same room sent at the same moment, every round ends with exactly 1 success, exactly 1 overlap rejection, exactly 1 stored booking and exactly 1 confirmation job.
- **SC-004**: After any rejected create, 0 bookings, 0 confirmation jobs and 0 stored idempotent responses exist for that request.
- **SC-005**: On the Bookings page, a person whose create or edit was rejected for overlap can correct the time and submit again without retyping any other field, in 100% of cases.
- **SC-006**: Every behaviour of bookings that this specification does not change gives the same answers as before the change.
- **SC-007**: The repository's build, lint and test commands all pass; the `room` service and the `/rooms` page show no changes; the shared contract shows exactly one change, the added error code.

## Assumptions

- **Relation to `specs/001-room-bookings`**: this change replaces that specification's "no overlap rule" assumption and its edge case "both are accepted", and lifts its ban on changing the shared contract for the one added error code. Everything else there still applies. That specification's files are not edited.
- **Rooms cannot be changed on update**: an update can change only `title`, `startsAt` and `endsAt`, so an update is only ever checked against the booking's own room.
- **Order of checks**: the description does not rank the overlap error against the existing errors. The simplest reading is used: the existing checks keep their order and overlap is checked last, on both create and update.
- **Update is checked on its resulting span**: every update is checked with the times the booking would have afterwards, against all other bookings of the room. A title-only update therefore always succeeds on data that respects the rule.
- **Races that involve an update**: the description names only two simultaneous creates. "That must stop" is read as covering updates as well, so the same guarantee is required for an update racing with a create or another update.
- **A rejected create and its key**: "not a stored idempotent response" is read as the existing rule for failed validation: nothing is stored against the key and the key can be used again with any body.
- **Replays are not re-checked**: a replay of a completed create returns the stored answer and creates nothing, so the overlap rule does not apply to it.
- **Message wording**: the exact text of the message is not prescribed; it only has to tell the person that the room is already booked for that time. The page shows whatever the API sends.
- **Conflicting bookings are not disclosed**: the rejection does not say which booking is in the way.
- **"Next to the form"**: the message appears inside or directly beside the form that was submitted (the create form, or the edit form of the row), not only in a page-level error area.
- **Page tests**: the page behaviour is covered by tests with the service layer mocked, in the same way as the existing page tests.
- **Existing data**: the database is reset before this change is used, so no stored bookings overlap when it starts and none need repair.
- **Past bookings and sign-in**: unchanged; bookings in the past are accepted and there is no authentication.
- **Dependencies**: the existing gateway, `booking`, `room` and `worker` services, their database, message bus and queue, and the shared contract are used as they are; no new dependency is added.
- **Technical terms in this specification**: routes, status codes, error codes, the header name, the contract location and the three commands come verbatim from the feature description's stated external behaviour and are kept so that the specification stays testable.
