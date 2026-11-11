# Spec Delta

## ADDED Requirements

### Requirement: Overlap rejection is shown at the form
The page SHALL show the message answered by the API next to the form that was submitted when a create or an edit is rejected with `CONFLICT.BOOKING_OVERLAP`: above the fields of the create form, or inside the edit form. The form SHALL keep every value the person entered, the edit form SHALL stay open, and the table SHALL NOT be reloaded. The message SHALL disappear when the person submits again.

#### Scenario: Create rejected for overlap
- **WHEN** a create is answered 409 `CONFLICT.BOOKING_OVERLAP` with the message "The room already has a booking that overlaps this time span"
- **THEN** an alert in the create form shows that message, the room, title, organizer email, start and end fields keep the entered values, and the table is not reloaded

#### Scenario: Edit rejected for overlap
- **WHEN** an update is answered 409 `CONFLICT.BOOKING_OVERLAP` with the message "The room already has a booking that overlaps this time span"
- **THEN** the edit form stays open, an alert inside it shows that message, and the title, start and end fields keep the entered values

#### Scenario: Corrected create after an overlap rejection
- **WHEN** a create was rejected for overlap, the person changes the start and end to a free span and submits again
- **THEN** the alert is gone, one create request is sent with the new times and a new `Idempotency-Key`, and after it succeeds the form is empty and the table is reloaded

#### Scenario: Corrected edit after an overlap rejection
- **WHEN** an edit was rejected for overlap, the person changes the end to a free span and saves again
- **THEN** one update request is sent with the new values, the edit form closes and the table is reloaded
