# bookings-page

## BPG-001: Bookings route and navigation
The system SHALL serve the bookings page at `/bookings` and show a "Bookings" link in the main navigation.
- Scenario: link. WHEN the layout renders THEN the navigation has a link "Bookings" with href `/bookings` next to "Rooms"

## BPG-002: Bookings table
The system SHALL show a paginated table (10 rows per page) with title, room name, organizer, start, end and confirmation status, times as `YYYY-MM-DD HH:mm UTC`.
- Scenario: row. WHEN B1 is listed and R1 is named "Atlas" THEN its row shows `Sprint planning`, `Atlas`, `ann@example.com`, `2030-01-07 09:00 UTC`, `2030-01-07 10:00 UTC`, `PENDING`
- Scenario: next page. WHEN `total` is 12 and "next page" is clicked THEN `listBookings` is called with page 2, limit 10

## BPG-003: Room filter with every room
The system SHALL fill the room filter and the form's room select with all rooms, and request the list with the chosen `roomId` from page 1.
- Scenario: more rooms than one page. WHEN 12 rooms exist THEN the filter offers "All rooms" and 12 rooms
- Scenario: filter. WHEN "Atlas" is chosen on page 2 THEN `listBookings` is called with `roomId` R1 and page 1; WHEN "All rooms" is chosen THEN no `roomId` is sent

## BPG-004: Loading, empty and error states
The system SHALL show a progress bar while a list request runs, "No bookings yet" for an empty result, and the API's message in an alert when a request fails.
- Scenario: error. WHEN `listBookings` rejects with `ApiError` 503 "Booking service is unavailable" THEN an alert shows that message and no table is shown
- Scenario: empty. WHEN `items` is `[]` THEN "No bookings yet" is shown

## BPG-005: Create form
The system SHALL offer a form with room, title, organizer email, start and end (entered as UTC), validate it before sending, and refetch the list after a 201.
- Scenario: submit. WHEN the form holds R1, "Sprint planning", `ann@example.com`, `2030-01-07T09:00`, `2030-01-07T10:00` and is submitted THEN `createBooking` receives B1 and a UUID key, the form resets and the list is fetched again
- Scenario: client validation. WHEN the title is empty, the email is `x`, or end is not later than start THEN the field shows an error and `createBooking` is not called
- Scenario: API error. WHEN `createBooking` rejects with 404 `NOT_FOUND.ROOM` "Room … was not found" THEN an alert shows that message and the entered values stay
- Scenario: overlap. WHEN `createBooking` rejects with 409 `CONFLICT.BOOKING_OVERLAP` "The room is already booked in that time span" THEN an alert in the form shows that message, all five values stay, and the next submit carries a new key (BPG-006)

## BPG-006: One Idempotency-Key per submission
The system SHALL keep the key of a submission until it gets a final answer or the user changes a field: a network error, a 5xx or 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` keeps it; a 2xx or any other 4xx drops it.
- Scenario: retry. WHEN a submit fails with a network error or 503 and the unchanged form is submitted again THEN both calls carry the same key
- Scenario: edited payload. WHEN the title is changed after a 503 and the form is submitted THEN the call carries a new key
- Scenario: next booking. WHEN a submit answers 201 and the same values are submitted again THEN the call carries a new key

## BPG-007: Edit a row
The system SHALL let the user edit title, start and end of a row and send only the fields whose value changed.
- Scenario: title only. WHEN a booking starting `2030-01-07T09:00:30.123Z` has its title changed to "Retro" and is saved THEN `updateBooking` receives exactly `{ title: "Retro" }` and the list is fetched again
- Scenario: no change. WHEN the dialog is saved untouched THEN `updateBooking` is not called
- Scenario: invalid. WHEN end is not later than start THEN the field shows the BPG-005 error; WHEN the API answers 400 THEN its message is shown in the dialog
- Scenario: overlap. WHEN `updateBooking` rejects with 409 `CONFLICT.BOOKING_OVERLAP` THEN the dialog stays open, shows the API's message and keeps the entered title, start and end

## BPG-008: Delete a row
The system SHALL delete the row's booking, refetch, and step back to the previous page when the current one became empty.
- Scenario: last row of the last page. WHEN the only row of page 2 is deleted THEN page 1 is requested and shown
- Scenario: failure. WHEN `deleteBooking` rejects with 404 `NOT_FOUND.BOOKING` THEN an alert shows the API's message and the list is fetched again
