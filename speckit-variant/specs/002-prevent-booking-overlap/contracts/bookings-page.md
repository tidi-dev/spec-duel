# Contract: Bookings Page (`apps/web`) — behaviour on an overlap rejection

This is a delta to `specs/001-room-bookings/contracts/bookings-page.md`. Regions, accessible names,
the service layer and the idempotency key rule stay as described there.

The page does not look at the error code. It shows the `message` of whatever `ApiError` the service
layer rejects with; an overlap rejection is `ApiError` with `statusCode` 409, `errorCode`
`CONFLICT.BOOKING_OVERLAP` and the API's message.

## Create form — `form` "New booking"

When `createBooking` rejects with the overlap `ApiError`:

| What | Expected |
|---|---|
| Message | an `alert` inside the form with the API's `message` |
| Fields | Room, Title, Organizer email, Start and End still hold what was typed |
| List | not reloaded |
| Next submit | a new `Idempotency-Key` (the API answered) |

When the next submit succeeds: the alert is gone, the form is cleared and the list is reloaded.

## Edit dialog — `dialog` "Edit booking"

When `updateBooking` rejects with the overlap `ApiError`:

| What | Expected |
|---|---|
| Message | an `alert` inside the dialog's form with the API's `message` |
| Dialog | stays open |
| Fields | Title, Start and End still hold what was typed |
| Table row | still shows the booking's stored values; the list is not reloaded |

When the next save succeeds: the dialog closes and the list is reloaded with the updated booking.

## Tests

Page tests mock `apps/web/src/services/booking.service.ts`, as today. Each row above is asserted
with the mock rejecting with the overlap `ApiError`.

## Unchanged

Every other state and failure (validation, unknown room, network error, load failure), the `/rooms`
page, its components and `room.service.ts`.
