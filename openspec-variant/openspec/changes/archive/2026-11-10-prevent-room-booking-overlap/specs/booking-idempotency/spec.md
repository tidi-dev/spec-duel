# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
