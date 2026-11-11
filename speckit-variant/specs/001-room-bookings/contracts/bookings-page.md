# Contract: Bookings Page (`apps/web`)

Route `/bookings`, reached from a "Bookings" link in the main navigation, after "Rooms".

## Service layer — `apps/web/src/services/booking.service.ts`

The page talks only to these functions and to the existing `listRooms`. Page tests mock this module.

| Function | Request | Returns |
|---|---|---|
| `listBookings(query: ListBookingsQueryDto)` | `GET /bookings` with `page`, `limit` and, when set, `roomId` | `PagedBookingsDto` |
| `createBooking(booking: CreateBookingDto, idempotencyKey: string)` | `POST /bookings` with the `Idempotency-Key` header | `BookingDto` |
| `updateBooking(id: string, changes: UpdateBookingDto)` | `PATCH /bookings/:id` | `BookingDto` |
| `deleteBooking(id: string)` | `DELETE /bookings/:id` | nothing |

A request the API answered with an error rejects with `ApiError` (carrying the API's `message`). A
request that got no answer rejects with the underlying network error. That difference is the page's
only test for "network error".

## Page regions

| Region | Accessible name / role | Content |
|---|---|---|
| Heading | `heading` "Bookings" | |
| Room filter | `combobox` "Room" | "All rooms" plus one option per room from `listRooms(1, MAX_PAGE_SIZE)` |
| Create form | `form` "New booking" | Room, Title, Organizer email, Start, End, and a "Create booking" button |
| Table | `table` "Bookings" | columns Title, Room, Organizer, Start, End, Confirmation, Actions |
| Row actions | `button` "Edit <title>", `button` "Delete <title>" | |
| Edit dialog | `dialog` "Edit booking" | Title, Start, End; "Save" and "Cancel" |
| Delete dialog | `dialog` "Delete booking" | asks for confirmation; "Delete" and "Cancel" |
| Paging | table pagination | `DEFAULT_PAGE_SIZE` rows per page |

## States

| State | Shown |
|---|---|
| Loading the list | a progress bar labelled "Loading bookings" |
| No bookings (or none for the chosen room) | the text "No bookings found." instead of the table |
| Load failed | an error alert with the error's message; no table |
| Create, edit or delete failed | an error alert with the error's message next to the action; the list stays as it was |

## Behaviour

- **Room column**: the room's name from the loaded room list; the room id when the room is not among
  them.
- **Times**: entered in `datetime-local` inputs in the browser's time zone, sent as UTC ISO 8601,
  shown with the browser's locale formatting.
- **Filter**: choosing a room reloads the list with that `roomId` from page 1; "All rooms" removes the
  filter.
- **Form validation** (before any request): room chosen, title 1–`BOOKING_TITLE_MAX_LENGTH`
  characters, a valid email, both times set, end later than start.
- **After a successful create, edit or delete**: the list is reloaded; the create form is cleared.
- **Edit** sends `title`, `startsAt` and `endsAt`.
- **Delete** is sent only after the dialog is confirmed.

## Idempotency key rule

| Event | Key for the next submit |
|---|---|
| First submit of a form | a new UUID (v4) |
| The request got no answer (network error) and the form is submitted again unchanged | the same key |
| The API answered, with success or with an error | a new key |
| Any form field changed | a new key |

## Unchanged

The `/rooms` page, its components and `room.service.ts` are not edited. `app-layout.tsx` gains one
navigation item.
