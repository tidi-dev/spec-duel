# Spec Delta

## Purpose

Gives people a page in the web app to see the bookings, filter them by room, and create, edit and delete a booking without calling the API by hand.

## ADDED Requirements

### Requirement: Bookings page and navigation
The web app SHALL serve a bookings page at `/bookings` and SHALL show a "Bookings" link to it in the main navigation, next to the existing "Rooms" link.

#### Scenario: Navigation link
- **WHEN** a person opens any page of the web app
- **THEN** the main navigation shows a "Bookings" link pointing to `/bookings` and the "Rooms" link is still there

#### Scenario: Page opens
- **WHEN** a person opens `/bookings`
- **THEN** the page shows the heading "Bookings", the room filter, the create form and the bookings table

### Requirement: Bookings table
The page SHALL list bookings in a table with the columns title, room name, organizer, start, end and confirmation status, in the order the API answers them, with paging controls. The room name SHALL come from the room list; a booking whose room is not in that list SHALL show its room id. Start and end SHALL be shown in UTC as `YYYY-MM-DD HH:mm` under headers that say UTC.

#### Scenario: Rows shown
- **WHEN** the API answers two bookings for "Room 01"
- **THEN** the table shows two rows with each booking's title, "Room 01", organizer email, start, end and confirmation status

#### Scenario: Time format
- **WHEN** a booking has `startsAt` `2030-01-01T09:30:00.000Z`
- **THEN** its start cell shows `2030-01-01 09:30`

#### Scenario: Next page
- **WHEN** the API reports 12 bookings and the person goes to the next page
- **THEN** the page requests page 2 and shows the bookings answered for it

### Requirement: Room filter
The page SHALL show a room filter above the table, filled from the room list, with an "All rooms" choice selected at first. Choosing a room SHALL reload the table with only that room's bookings, starting at the first page; choosing "All rooms" SHALL remove the filter.

#### Scenario: Filter options
- **WHEN** the room list answers 12 rooms
- **THEN** the filter offers "All rooms" and the 12 room names

#### Scenario: Filter by room
- **WHEN** the person chooses "Room 03" in the filter
- **THEN** the page requests the bookings of that room, page 1, and the table shows only the answered rows

#### Scenario: Filter removed
- **WHEN** the person chooses "All rooms" after filtering
- **THEN** the page requests the bookings without a room filter

### Requirement: Create form
The page SHALL offer a form to create a booking with room, title, organizer email, start and end (entered in UTC). The form SHALL NOT send a request while a field is empty or the end is not later than the start, and SHALL say which field is wrong. After a successful create the form SHALL be cleared and the table reloaded.

#### Scenario: Booking created
- **WHEN** the person fills every field with valid values and submits
- **THEN** one create request is sent with the chosen room id, the title, the email and both times as ISO 8601 UTC, and afterwards the form is empty and the table is reloaded

#### Scenario: Required field missing
- **WHEN** the person submits with an empty title
- **THEN** no request is sent and the title field shows an error

#### Scenario: End not after start
- **WHEN** the person submits with an end equal to or earlier than the start
- **THEN** no request is sent and the end field shows an error

#### Scenario: Submit while sending
- **WHEN** a create request is still pending
- **THEN** the submit button is disabled

### Requirement: Idempotency key per submission
The form SHALL send one `Idempotency-Key` (a UUID) with each create request. The key SHALL be generated once for a submission and reused every time that same submission is sent again after a failure, including a network error. A new key SHALL be generated after a successful create and whenever the person changes any field.

#### Scenario: Retry after a network error
- **WHEN** a create request fails with a network error and the person submits the unchanged form again
- **THEN** the second request carries the same `Idempotency-Key` as the first

#### Scenario: New key after success
- **WHEN** a create succeeded and the person submits another booking
- **THEN** the new request carries a different `Idempotency-Key`

#### Scenario: New key after an edit
- **WHEN** a create request failed and the person changes the title before submitting again
- **THEN** the next request carries a different `Idempotency-Key`

### Requirement: Edit a booking
Each table row SHALL offer an edit action that opens a form with the booking's title, start and end. Saving SHALL send the three values as an update, apply the same end-after-start check as the create form, then close the form and reload the table.

#### Scenario: Edit saved
- **WHEN** the person opens edit on a row, changes the title and saves
- **THEN** one update request is sent for that booking with the new title and its start and end, and the table is reloaded

#### Scenario: Edit cancelled
- **WHEN** the person opens edit and cancels
- **THEN** no request is sent and the row is unchanged

#### Scenario: Edit form is prefilled
- **WHEN** the person opens edit on a row
- **THEN** the form shows that booking's current title, start and end

### Requirement: Delete a booking
Each table row SHALL offer a delete action that asks for confirmation. Confirming SHALL send the delete and reload the table; declining SHALL send nothing.

#### Scenario: Delete confirmed
- **WHEN** the person chooses delete on a row and confirms
- **THEN** one delete request is sent for that booking and the table is reloaded without it

#### Scenario: Delete declined
- **WHEN** the person chooses delete on a row and declines
- **THEN** no request is sent and the row stays

### Requirement: Loading, empty and error states
The page SHALL show a loading indicator while bookings or rooms are being loaded, an empty message when the API answers no bookings, and an error alert carrying the message from the API when a load, create, update or delete fails. A failed create, update or delete SHALL keep the entered values.

#### Scenario: Loading
- **WHEN** the page is waiting for the bookings
- **THEN** a loading indicator is shown

#### Scenario: Empty
- **WHEN** the API answers no bookings
- **THEN** the table shows "No bookings found."

#### Scenario: Load error
- **WHEN** loading the bookings fails with the message "Booking service is unavailable"
- **THEN** an alert shows "Booking service is unavailable" and no table is shown

#### Scenario: Create error
- **WHEN** a create is answered 404 with the message "Room 123 was not found"
- **THEN** an alert shows "Room 123 was not found" and the form keeps the entered values

#### Scenario: Delete error
- **WHEN** a delete is answered 404 with the message "Booking 123 was not found"
- **THEN** an alert shows "Booking 123 was not found"
