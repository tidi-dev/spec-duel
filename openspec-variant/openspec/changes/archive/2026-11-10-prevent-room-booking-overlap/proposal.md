# Proposal

## Why

Two bookings can occupy the same room at the same time today: the `booking` service stores any valid span, and the `bookings-api` spec even asserts that an overlapping create is accepted. A room that is booked twice for the same hour is the one thing a room-booking system must not allow.

## What Changes

- **BREAKING** `POST /api/bookings` answers 409 with `CONFLICT.BOOKING_OVERLAP` when the new span overlaps an existing booking of the same room. Until now it answered 201.
- **BREAKING** `PATCH /api/bookings/:id` answers 409 with `CONFLICT.BOOKING_OVERLAP` when the resulting span would overlap another booking of the same room. Until now it answered 200.
- Spans are half-open (`[startsAt, endsAt)`): a booking that starts exactly when another ends does not overlap it.
- A booking never conflicts with itself, so a title-only update or a shortening inside its own span still succeeds.
- The same span in a different room is still accepted.
- Two overlapping creates for one room that arrive at the same moment: exactly one is answered 201, the other 409 `CONFLICT.BOOKING_OVERLAP`.
- A create rejected for overlap stores nothing: no booking, no idempotency key (the key stays usable), no confirmation job.
- `ErrorCodeEnum` in `libs/contract` gains `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'`. Nothing else in the contract changes.
- The `/bookings` page shows the API's overlap message next to the create form and inside the edit form, and keeps what the person typed.

Not part of this change: the `room` service, the `/rooms` page, any migration or clean-up of existing data (the database is reset before this change is used), and every other booking behaviour (idempotent replay, key reuse, in-progress answer, confirmation job, list, read, delete).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bookings-api`: creating and updating a booking gain the no-overlap rule and its 409 answer; the scenario that accepts an overlapping create is removed (the requirement "Create a booking" is replaced by "Booking creation" with the same text, because a modified requirement cannot drop a scenario).
- `booking-idempotency`: a create rejected for overlap does not claim its key; the scenario that posts the same body twice with two keys now ends in an overlap rejection for the second request.
- `bookings-page`: the create form and the edit form show the overlap message from the API and keep the entered values.

`booking-confirmation` is not modified: its scenario "No job for a rejected create" already covers every 409 answer.

## Impact

- `libs/contract`: one new member in `ErrorCodeEnum`.
- `apps/booking`: `BookingService`, `BookingRepository`, `IdempotentBookingRepository`, their outcome types and specs; one new query helper for the overlap check.
- `apps/gateway`: no code change; it already forwards the status and `errorCode` of an error answered by the `booking` service.
- `apps/web`: the two forms already render the API message and keep their values on any failure, so the change there is test coverage for the overlap answer.
- Database: no schema change and no migration.
- No new dependency.
