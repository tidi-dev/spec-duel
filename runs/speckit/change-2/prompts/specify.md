/speckit-specify # Change: bookings for the same room may no longer overlap

Today two bookings can occupy the same room at the same time. That must stop.

## Required behaviour

- Creating a booking that overlaps an existing booking of the same room is rejected with 409 and the error code `CONFLICT.BOOKING_OVERLAP`.
- Updating a booking so that it would overlap another booking of the same room is rejected the same way.
- Time spans are half-open: a booking that starts exactly when another one ends does not overlap it.
- A booking never conflicts with itself: changing only its title, or shortening it within its own time span, succeeds.
- The same time span in a different room is allowed.
- Two overlapping creates for the same room that arrive at the same moment: exactly one succeeds and the other answers 409 `CONFLICT.BOOKING_OVERLAP`.
- Everything else about bookings stays as it is, including the idempotent create and the confirmation job. A rejected create is not a stored idempotent response: no booking exists and no confirmation job is enqueued for it.

## Contract

Add the error code `CONFLICT.BOOKING_OVERLAP` to `ErrorCodeEnum` in `libs/contract`. That is the only change to the contract.

## Frontend

On the `/bookings` page, when a create or an edit is rejected for overlap, show the API's message next to the form and keep what the user typed.

## Out of scope

- The `room` service and the `/rooms` page must not be changed.
- Existing data needs no migration or clean-up; the database is reset before this change is used.

## Done when

- The behaviour above holds end to end through the gateway.
- New and changed services have unit tests.
- `pnpm run build`, `pnpm run lint` and `pnpm run test` pass.
