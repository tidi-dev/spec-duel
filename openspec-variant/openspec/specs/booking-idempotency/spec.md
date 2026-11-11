# booking-idempotency Specification

## Purpose

Makes booking creation safe to retry: a client that repeats `POST /api/bookings` with the same `Idempotency-Key` never creates a second booking and receives a predictable answer.

## Requirements

### Requirement: Idempotency key is required
The system SHALL require the `Idempotency-Key` request header on `POST /api/bookings`, and its value SHALL be a UUID. A missing header or a value that is not a UUID SHALL answer 400 with `BAD_REQUEST.IDEMPOTENCY_KEY`, whatever the body holds, and nothing is stored.

#### Scenario: Header missing
- **WHEN** a client posts a valid body without the `Idempotency-Key` header
- **THEN** the answer is 400 with `BAD_REQUEST.IDEMPOTENCY_KEY` and no booking is created

#### Scenario: Header is not a UUID
- **WHEN** a client posts a valid body with `Idempotency-Key: abc`
- **THEN** the answer is 400 with `BAD_REQUEST.IDEMPOTENCY_KEY`

#### Scenario: Header and body both invalid
- **WHEN** a client posts an invalid body without the header
- **THEN** the answer is 400 with `BAD_REQUEST.IDEMPOTENCY_KEY`

### Requirement: First request claims the key
The system SHALL, on the first valid request with a key, create the booking and store the key with a fingerprint of the request body and the answered status and body. Claiming the key and storing the booking SHALL succeed or fail together: there is never a stored key without its booking, nor a booking created through the API without its key.

#### Scenario: First request
- **WHEN** a client posts a valid body with a key that was never used
- **THEN** the answer is 201 with the booking and without the `Idempotency-Replayed` header

#### Scenario: Different keys create different bookings
- **WHEN** a client posts two valid bodies that differ only in `roomId` with two different keys
- **THEN** both answers are 201 and their booking ids differ

#### Scenario: Same body under a different key is a new request
- **WHEN** a client posts the same valid body twice with two different keys
- **THEN** the first answer is 201 and the second is 409 with `CONFLICT.BOOKING_OVERLAP` without the `Idempotency-Replayed` header

### Requirement: Completed request is replayed
The system SHALL answer a request that repeats a completed key with the same body by returning the stored status and body unchanged, with the response header `Idempotency-Replayed: true`. A replay SHALL NOT create a booking and SHALL NOT enqueue a confirmation job. The replayed body is the one first answered, even when the booking was changed or deleted since.

#### Scenario: Replay
- **WHEN** a client repeats a completed request with the same key and the same body
- **THEN** the answer is 201 with the same booking body as the first answer and the header `Idempotency-Replayed: true`

#### Scenario: Replay creates nothing
- **WHEN** a request has been replayed
- **THEN** the list holds one booking for it and one confirmation job was enqueued in total

#### Scenario: Replay after the booking changed
- **WHEN** the booking's confirmation became `SENT` and the client repeats the original request
- **THEN** the answered body still has `confirmationStatus` `PENDING` and `confirmationAttempts` 0

#### Scenario: Replay does not need the room service
- **WHEN** a client repeats a completed request while the `room` service is not running
- **THEN** the answer is the stored 201 with `Idempotency-Replayed: true`

### Requirement: Key reuse with a different body
The system SHALL answer 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` when a completed key is sent with a different body. Two bodies are the same only when `roomId`, `title`, `organizerEmail`, `startsAt` and `endsAt` are all equal as sent, character for character.

#### Scenario: Different title
- **WHEN** a client reuses a completed key with a valid body whose `title` differs
- **THEN** the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` and no booking is created

#### Scenario: Same instant written differently
- **WHEN** a client reuses a completed key with `startsAt` `2030-01-01T10:00:00Z` where the first request sent `2030-01-01T10:00:00.000Z`
- **THEN** the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`

#### Scenario: Different body for an unknown room
- **WHEN** a client reuses a completed key with a valid body naming a room that does not exist
- **THEN** the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`

### Requirement: Key in progress
The system SHALL answer 409 with `CONFLICT.IDEMPOTENCY_IN_PROGRESS` when a key is sent while an earlier request with that key is still being stored. Identical requests arriving at the same moment SHALL create exactly one booking: one request is answered 201 as the creator, and each other one is answered either 409 or the replay.

#### Scenario: Concurrent identical requests
- **WHEN** ten identical requests with the same key are sent at the same moment
- **THEN** exactly one booking exists, exactly one answer is 201 without `Idempotency-Replayed`, and every other answer is 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` or 201 with `Idempotency-Replayed: true`

#### Scenario: Retry after an in-progress answer
- **WHEN** a client that received 409 repeats the request after the first one completed
- **THEN** the answer is the replay: 201 with `Idempotency-Replayed: true`

### Requirement: Failed validation does not claim the key
The system SHALL NOT store a key for a request that is answered with a validation, room or overlap error. The key SHALL remain usable for a later request. Body and time-order validation SHALL be answered before the key is consulted.

#### Scenario: Key reused after an invalid body
- **WHEN** a client posts `endsAt` earlier than `startsAt` with a key, receives 400, then posts a valid body with the same key
- **THEN** the second answer is 201 without `Idempotency-Replayed`

#### Scenario: Key reused after an unknown room
- **WHEN** a client posts an unknown `roomId` with a key, receives 404 `NOT_FOUND.ROOM`, then posts a valid body with the same key
- **THEN** the second answer is 201 without `Idempotency-Replayed`

#### Scenario: Key reused after an overlap rejection
- **WHEN** a client posts an overlapping span with a key, receives 409 `CONFLICT.BOOKING_OVERLAP`, then posts a valid body for a free span with the same key
- **THEN** the second answer is 201 without `Idempotency-Replayed`

#### Scenario: Invalid body on a completed key
- **WHEN** a client reuses a completed key with a body whose `endsAt` equals `startsAt`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

### Requirement: Keys do not expire
The system SHALL keep every stored key without a time limit. A stored key SHALL keep answering replays and reuse errors after its booking was deleted.

#### Scenario: Replay after the booking was deleted
- **WHEN** a client deletes a booking and then repeats the request that created it
- **THEN** the answer is 201 with the original body and `Idempotency-Replayed: true`, and reading the booking id still answers 404

### Requirement: Overlap rejection is not a stored answer
The system SHALL NOT store a key, a booking or a response for a create answered 409 with `CONFLICT.BOOKING_OVERLAP`, and SHALL NOT enqueue a confirmation job for it. Repeating that request SHALL be evaluated again against the bookings stored at that time, never replayed. A completed key SHALL keep answering its replay before any overlap check.

#### Scenario: Rejected create leaves nothing behind
- **WHEN** a client posts a body that overlaps a stored booking of the same room with a key that was never used
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP` without the `Idempotency-Replayed` header, no booking is created and no confirmation job is enqueued

#### Scenario: Rejected create repeated while the overlap remains
- **WHEN** a client repeats a create that was rejected for overlap with the same key and body while the other booking still exists
- **THEN** the answer is again 409 with `CONFLICT.BOOKING_OVERLAP` without the `Idempotency-Replayed` header

#### Scenario: Rejected create repeated after the span is free
- **WHEN** a create was rejected for overlap, the other booking is then deleted, and the client repeats the request with the same key and body
- **THEN** the answer is 201 without `Idempotency-Replayed`, and one confirmation job is enqueued for the new booking

#### Scenario: Replay is not an overlap with its own booking
- **WHEN** a client repeats a completed create with the same key and body while the booking it created still exists
- **THEN** the answer is 201 with the stored body and `Idempotency-Replayed: true`, not 409

#### Scenario: Reused key with an overlapping body
- **WHEN** a client reuses a completed key with a different valid body whose span overlaps a stored booking
- **THEN** the answer is 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`
