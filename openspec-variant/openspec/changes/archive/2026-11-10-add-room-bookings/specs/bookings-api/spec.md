# Spec Delta

## Purpose

Defines the HTTP contract for meeting-room bookings on the gateway: creating, listing, reading, updating and deleting a booking, with the validation rules and error answers clients rely on.

## ADDED Requirements

### Requirement: Booking resource shape
The system SHALL represent a booking in every API answer with exactly these fields: `id`, `roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt`, `confirmationStatus` (`PENDING`, `SENT` or `FAILED`), `confirmationAttempts`, `createdAt` and `updatedAt`. Every time field SHALL be an ISO 8601 string in UTC.

#### Scenario: Times are answered in UTC
- **WHEN** a booking is created with `startsAt` `2030-01-01T10:00:00+02:00`
- **THEN** the answered booking has `startsAt` `2030-01-01T08:00:00.000Z`

#### Scenario: A time without a zone is read as UTC
- **WHEN** a booking is created with `startsAt` `2030-01-01T10:00:00`
- **THEN** the answered booking has `startsAt` `2030-01-01T10:00:00.000Z`

### Requirement: Error answer shape
The system SHALL answer every bookings API error with a JSON body `{ statusCode, errorCode, message }`, where `statusCode` equals the HTTP status and `errorCode` is one of the shared contract's error codes.

#### Scenario: Error body for an unknown booking
- **WHEN** a client reads a booking id that does not exist
- **THEN** the answer is 404 with a body whose `statusCode` is 404, `errorCode` is `NOT_FOUND.BOOKING` and `message` is a non-empty string

### Requirement: Create a booking
The system SHALL create a booking on `POST /api/bookings` from `roomId`, `title`, `organizerEmail`, `startsAt` and `endsAt`, and answer 201 with the booking. A new booking SHALL have `confirmationStatus` `PENDING` and `confirmationAttempts` 0.

#### Scenario: Booking created
- **WHEN** a client posts a valid body for an existing room with a valid `Idempotency-Key` header
- **THEN** the answer is 201 with the booking, a generated `id`, `confirmationStatus` `PENDING` and `confirmationAttempts` 0

#### Scenario: Created booking can be read
- **WHEN** a client reads the `id` answered by a successful create
- **THEN** the answer is 200 with the same `roomId`, `title`, `organizerEmail`, `startsAt` and `endsAt`

#### Scenario: Overlapping bookings are accepted
- **WHEN** a client creates a second booking for the same room and the same time span with a different `Idempotency-Key`
- **THEN** the answer is 201 with a second booking

### Requirement: Booking body validation
The system SHALL answer 400 with `BAD_REQUEST.VALIDATION` when a create or update body breaks the shared contract's field rules, or when a time value cannot be resolved to an instant. Fields that are not part of the contract SHALL be ignored.

#### Scenario: Missing field on create
- **WHEN** a client posts a body without `title`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION` and no booking is created

#### Scenario: Malformed email
- **WHEN** a client posts a body whose `organizerEmail` is `not-an-email`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

#### Scenario: Title too long
- **WHEN** a client posts a body whose `title` has 121 characters
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

#### Scenario: Unknown field is ignored
- **WHEN** a client updates a booking with `{ "title": "New", "organizerEmail": "x@example.com" }`
- **THEN** the answer is 200, `title` is `New` and `organizerEmail` is unchanged

### Requirement: Booking time order
The system SHALL require `endsAt` to be later than `startsAt`. A create whose `endsAt` is equal to or earlier than `startsAt` SHALL answer 400 with `BAD_REQUEST.VALIDATION`. An update SHALL be checked against the resulting booking, combining the stored values with the changed ones.

#### Scenario: Equal start and end on create
- **WHEN** a client posts a body whose `endsAt` equals `startsAt`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION` and no booking is created

#### Scenario: End before start on create
- **WHEN** a client posts a body whose `endsAt` is earlier than `startsAt`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

#### Scenario: Update moves the start past the stored end
- **WHEN** a client updates only `startsAt` to a time later than the booking's stored `endsAt`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION` and the booking is unchanged

### Requirement: Room must exist
The system SHALL create a booking only for a room known to the `room` service. A create for an unknown room SHALL answer 404 with `NOT_FOUND.ROOM`. When the `room` service does not answer, the create SHALL answer 503 with `UNAVAILABLE.SERVICE`.

#### Scenario: Unknown room
- **WHEN** a client posts a valid body whose `roomId` is a UUID of no existing room
- **THEN** the answer is 404 with `NOT_FOUND.ROOM` and no booking is created

#### Scenario: Room service unavailable
- **WHEN** a client posts a valid body with an unused key while the `room` service is not running
- **THEN** the answer is 503 with `UNAVAILABLE.SERVICE` and no booking is created

### Requirement: List bookings
The system SHALL answer `GET /api/bookings` with `{ items, total, page, limit }`, ordered by `startsAt` ascending, where `total` counts every booking matching the filter. `page` SHALL default to 1 and `limit` to 10; `limit` SHALL be at most 100. An optional `roomId` SHALL restrict the list to that room.

#### Scenario: Default page
- **WHEN** a client requests `GET /api/bookings` while 12 bookings exist
- **THEN** the answer is 200 with the 10 earliest bookings by `startsAt`, `total` 12, `page` 1 and `limit` 10

#### Scenario: Second page with a custom limit
- **WHEN** a client requests `GET /api/bookings?page=2&limit=5` while 12 bookings exist
- **THEN** `items` holds the 6th to 10th bookings by `startsAt`

#### Scenario: Filter by room
- **WHEN** a client requests `GET /api/bookings?roomId=<id>` for a room with 2 bookings among others
- **THEN** `items` holds only those 2 bookings and `total` is 2

#### Scenario: No bookings
- **WHEN** a client requests `GET /api/bookings` while no booking matches
- **THEN** the answer is 200 with `items` empty and `total` 0

#### Scenario: Invalid query
- **WHEN** a client requests the list with `page=0`, `limit=101`, `roomId=abc` or an empty `roomId=`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

### Requirement: Read a booking
The system SHALL answer `GET /api/bookings/:id` with 200 and the booking, or 404 with `NOT_FOUND.BOOKING` when no booking has that id. An `id` that is not a UUID SHALL answer 400 with `BAD_REQUEST.VALIDATION`; this holds for update and delete as well.

#### Scenario: Existing booking
- **WHEN** a client reads the id of an existing booking
- **THEN** the answer is 200 with that booking

#### Scenario: Unknown booking
- **WHEN** a client reads a UUID of no existing booking
- **THEN** the answer is 404 with `NOT_FOUND.BOOKING`

#### Scenario: Malformed id
- **WHEN** a client reads `GET /api/bookings/not-a-uuid`
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`

### Requirement: Update a booking
The system SHALL change `title`, `startsAt` and/or `endsAt` on `PATCH /api/bookings/:id` and answer 200 with the updated booking, or 404 with `NOT_FOUND.BOOKING`. Fields left out SHALL keep their values. An update SHALL NOT change `confirmationStatus` or `confirmationAttempts`, and SHALL NOT enqueue a confirmation.

#### Scenario: Title changed
- **WHEN** a client patches an existing booking with `{ "title": "Retro" }`
- **THEN** the answer is 200 with `title` `Retro` and unchanged `startsAt` and `endsAt`

#### Scenario: Times changed
- **WHEN** a client patches `startsAt` and `endsAt` to a valid later span
- **THEN** the answer is 200 with both new values, and a later read answers the same

#### Scenario: Unknown booking
- **WHEN** a client patches a UUID of no existing booking
- **THEN** the answer is 404 with `NOT_FOUND.BOOKING`

#### Scenario: Empty body
- **WHEN** a client patches an existing booking with `{}`
- **THEN** the answer is 200 with the booking's stored values

### Requirement: Delete a booking
The system SHALL remove the booking on `DELETE /api/bookings/:id` and answer 204 with no body, or 404 with `NOT_FOUND.BOOKING`. A deleted booking SHALL no longer be readable or listed.

#### Scenario: Booking deleted
- **WHEN** a client deletes an existing booking
- **THEN** the answer is 204 with no body

#### Scenario: Deleted booking is gone
- **WHEN** a client reads or deletes a booking that was already deleted
- **THEN** the answer is 404 with `NOT_FOUND.BOOKING`

#### Scenario: Deleted booking leaves the list
- **WHEN** a client lists bookings after deleting one
- **THEN** the deleted booking is not in `items` and `total` is one lower
