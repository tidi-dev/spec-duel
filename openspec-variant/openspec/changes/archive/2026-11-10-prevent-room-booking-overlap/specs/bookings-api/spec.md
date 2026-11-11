# Spec Delta

## ADDED Requirements

### Requirement: Booking creation
The system SHALL create a booking on `POST /api/bookings` from `roomId`, `title`, `organizerEmail`, `startsAt` and `endsAt`, and answer 201 with the booking. A new booking SHALL have `confirmationStatus` `PENDING` and `confirmationAttempts` 0.

#### Scenario: Booking created
- **WHEN** a client posts a valid body for an existing room with a valid `Idempotency-Key` header
- **THEN** the answer is 201 with the booking, a generated `id`, `confirmationStatus` `PENDING` and `confirmationAttempts` 0

#### Scenario: Created booking can be read
- **WHEN** a client reads the `id` answered by a successful create
- **THEN** the answer is 200 with the same `roomId`, `title`, `organizerEmail`, `startsAt` and `endsAt`

### Requirement: Bookings of one room do not overlap
The system SHALL never hold two bookings of the same room whose time spans overlap. A span is half-open: it includes `startsAt` and excludes `endsAt`, so two spans overlap only when each starts before the other ends. Bookings of different rooms SHALL never conflict with each other.

#### Scenario: Identical span in the same room
- **WHEN** a room has a booking from 10:00 to 11:00 and a client creates a booking for that room from 10:00 to 11:00 with another `Idempotency-Key`
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP` and the room still has one booking

#### Scenario: Partial overlap at either end
- **WHEN** a room has a booking from 10:00 to 11:00 and a client creates a booking for that room from 09:30 to 10:30, or from 10:30 to 11:30
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP`

#### Scenario: One span inside the other
- **WHEN** a room has a booking from 10:00 to 11:00 and a client creates a booking for that room from 10:15 to 10:45, or from 09:00 to 12:00
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP`

#### Scenario: Starts when the other ends
- **WHEN** a room has a booking from 10:00 to 11:00 and a client creates a booking for that room from 11:00 to 12:00
- **THEN** the answer is 201 with the new booking

#### Scenario: Ends when the other starts
- **WHEN** a room has a booking from 10:00 to 11:00 and a client creates a booking for that room from 09:00 to 10:00
- **THEN** the answer is 201 with the new booking

#### Scenario: Same span in a different room
- **WHEN** one room has a booking from 10:00 to 11:00 and a client creates a booking from 10:00 to 11:00 for another room
- **THEN** the answer is 201 with the new booking

#### Scenario: Span freed by a delete
- **WHEN** a booking from 10:00 to 11:00 is deleted and a client then creates a booking for that room from 10:00 to 11:00
- **THEN** the answer is 201 with the new booking

### Requirement: Overlapping create is rejected
The system SHALL answer `POST /api/bookings` with 409 and `CONFLICT.BOOKING_OVERLAP` when the new span overlaps an existing booking of the same room, and SHALL store nothing for that request. Body and time-order validation, the idempotency key answers and the unknown-room answer SHALL keep precedence over the overlap answer.

#### Scenario: Error body
- **WHEN** a create is rejected for overlap
- **THEN** the answer is 409 with a body whose `statusCode` is 409, `errorCode` is `CONFLICT.BOOKING_OVERLAP` and `message` is a non-empty string

#### Scenario: Nothing is stored
- **WHEN** a create is rejected for overlap
- **THEN** listing the room's bookings answers the same items and `total` as before the request

#### Scenario: Unknown room wins over overlap
- **WHEN** a client creates a booking for a room that does not exist
- **THEN** the answer is 404 with `NOT_FOUND.ROOM`

### Requirement: Overlapping update is rejected
The system SHALL answer `PATCH /api/bookings/:id` with 409 and `CONFLICT.BOOKING_OVERLAP` when the resulting span, combining the stored values with the changed ones, overlaps another booking of the same room, and SHALL leave the booking unchanged. A booking SHALL never conflict with itself. The unknown-booking and time-order answers SHALL keep precedence over the overlap answer.

#### Scenario: Update moved onto another booking
- **WHEN** a room has bookings from 10:00 to 11:00 and from 12:00 to 13:00 and a client patches the second one to start at 10:30
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP`, and reading the second booking still answers 12:00 to 13:00

#### Scenario: Update extended into another booking
- **WHEN** a room has bookings from 10:00 to 11:00 and from 11:00 to 12:00 and a client patches only `endsAt` of the first one to 11:30
- **THEN** the answer is 409 with `CONFLICT.BOOKING_OVERLAP`

#### Scenario: Update up to the edge of another booking
- **WHEN** a room has bookings from 10:00 to 11:00 and from 12:00 to 13:00 and a client patches only `endsAt` of the first one to 12:00
- **THEN** the answer is 200 with `endsAt` 12:00

#### Scenario: Title-only update
- **WHEN** a client patches a booking with `{ "title": "Retro" }` and no other booking of the room overlaps it
- **THEN** the answer is 200 with `title` `Retro`

#### Scenario: Shortened inside its own span
- **WHEN** a client patches a booking from 10:00 to 11:00 to run from 10:15 to 10:45
- **THEN** the answer is 200 with the new span

#### Scenario: Moved to a span that overlaps only its own old span
- **WHEN** a client patches a booking from 10:00 to 11:00 to run from 10:30 to 11:30 and the room has no other booking in that span
- **THEN** the answer is 200 with the new span

#### Scenario: Unknown booking wins over overlap
- **WHEN** a client patches a UUID of no existing booking with a span that overlaps a stored booking
- **THEN** the answer is 404 with `NOT_FOUND.BOOKING`

### Requirement: Overlap rule holds under concurrency
The system SHALL keep the no-overlap rule when requests for the same room arrive at the same moment. Of several creates and updates that would overlap each other, those that would break the rule SHALL be answered 409 with `CONFLICT.BOOKING_OVERLAP`, and the stored bookings of the room SHALL never overlap.

#### Scenario: Two overlapping creates at the same moment
- **WHEN** two creates for the same room with overlapping spans and different `Idempotency-Key` values are sent at the same moment
- **THEN** exactly one answer is 201, the other is 409 with `CONFLICT.BOOKING_OVERLAP`, and the room has exactly one booking in that span

#### Scenario: Many overlapping creates at the same moment
- **WHEN** ten creates for the same room and the same span, each with its own `Idempotency-Key`, are sent at the same moment
- **THEN** exactly one answer is 201, the nine others are 409 with `CONFLICT.BOOKING_OVERLAP`, and exactly one confirmation job is enqueued

#### Scenario: Concurrent creates for different rooms
- **WHEN** two creates with the same span for two different rooms are sent at the same moment
- **THEN** both answers are 201

#### Scenario: Create and update racing for the same span
- **WHEN** a create for a free span and an update that moves another booking of the same room onto that span are sent at the same moment
- **THEN** exactly one of them succeeds, the other is answered 409 with `CONFLICT.BOOKING_OVERLAP`, and the room's bookings do not overlap

## REMOVED Requirements

### Requirement: Create a booking
**Reason**: Its scenario "Overlapping bookings are accepted" states the opposite of the new no-overlap rule, and a MODIFIED block cannot drop a scenario. It is replaced by "Booking creation", which keeps the same text and the two other scenarios.
**Migration**: Clients that relied on booking a room twice for the same time must handle 409 `CONFLICT.BOOKING_OVERLAP` and choose a free span or another room.
