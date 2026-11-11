# prevent-overlapping-room-bookings: Bookings of the same room may no longer overlap

Tier: change
Why this tier: it adds a conflict rule to the existing `bookings` capability; create, update, idempotency and the page already exist.

## Why
Two bookings can occupy the same room at the same time (archived assumption "overlapping bookings of one room are allowed"). Create and update now answer 409 `CONFLICT.BOOKING_OVERLAP` instead, also under concurrency.
Sample values, all on 2030-01-07 UTC: rooms R1 and R2; A = a stored booking of R1 09:00–10:00; K1 = an unused idempotency key. Every error body is `{ statusCode, errorCode, message }`.

## Requirements
### ADDED bookings
#### BKG-012: Overlap rule
The system SHALL treat two bookings as overlapping only when they have the same `roomId` and each starts before the other ends (half-open spans, compared as instants).
- Scenario: inside or across. WHEN a span of R1 is 09:30–10:30, 08:00–09:00:00.001, 09:15–09:45 or 08:00–11:00 THEN it overlaps A
- Scenario: touching. WHEN a span of R1 is 10:00–11:00 or 08:00–09:00 THEN it does not overlap A
- Scenario: other room. WHEN a span of R2 is 09:00–10:00 THEN it does not overlap A
#### BKG-013: Create rejects an overlap
The system SHALL answer 409 `CONFLICT.BOOKING_OVERLAP` on `POST /api/bookings` when the new span overlaps (BKG-012) a stored booking, storing no booking and enqueueing no confirmation job.
- Scenario: rejected. WHEN R1 09:30–10:30 is posted with K1 THEN 409 `CONFLICT.BOOKING_OVERLAP`, only A exists in R1 and the queue got no job
- Scenario: allowed. WHEN R1 10:00–11:00 is posted, or R2 09:00–10:00 THEN 201
- Scenario: replay is not a conflict. WHEN the request that created A is posted again with its key THEN the IDM-003 replay answers 201, not 409
#### BKG-014: Update rejects an overlap
The system SHALL answer 409 `CONFLICT.BOOKING_OVERLAP` on `PATCH /api/bookings/:id` when the merged span overlaps (BKG-012) another booking, leaving the booking unchanged; a booking never conflicts with itself.
- Scenario: rejected. WHEN B of R1 10:00–11:00 is patched with `{ "startsAt": "2030-01-07T09:59:59.999Z" }` THEN 409 `CONFLICT.BOOKING_OVERLAP` and B still starts at 10:00
- Scenario: itself. WHEN A is patched with `{ "title": "Retro" }`, or with `{ "endsAt": "2030-01-07T09:30:00Z" }` THEN 200
- Scenario: touching. WHEN B is patched with `{ "endsAt": "2030-01-07T12:00:00Z" }`, or A with `{ "startsAt": "2030-01-07T08:00:00Z" }` THEN 200
#### BKG-015: Span writes of one room are serialised
The system SHALL run the overlap check and the write of a create or a span-changing update inside one transaction that holds a lock on the room, so that concurrent writes cannot both pass the check.
- Scenario: simultaneous creates. WHEN R2 09:00–10:00 and R2 09:30–10:30 are posted at the same moment with different keys against the real database THEN exactly one answers 201, the other 409 `CONFLICT.BOOKING_OVERLAP`, and one booking exists in R2
- Scenario: simultaneous updates. WHEN A (09:00–10:00) is patched with `endsAt` 10:45 and C of R1 (11:00–12:00) with `startsAt` 10:15 at the same moment THEN exactly one answers 200 and the other 409 `CONFLICT.BOOKING_OVERLAP`
#### BKG-016: The database refuses an overlap
The system SHALL back BKG-012 with an exclusion constraint `EXCL_bookings_room_span` on `bookings` and map its violation to 409 `CONFLICT.BOOKING_OVERLAP`.
- Scenario: direct write. WHEN a row of R1 09:30–10:30 is inserted directly next to A THEN Postgres rejects it with `EXCL_bookings_room_span`; WHEN the row is R1 10:00–11:00 THEN it is stored
### MODIFIED booking-idempotency
#### IDM-007: Failed requests do not consume the key
The system SHALL store nothing against a key whose request is answered 400, 404, 409 `CONFLICT.BOOKING_OVERLAP` or 503 before the transaction commits.
- Scenario: key reusable. WHEN K1 is posted with `endsAt` equal to `startsAt` (400), then with an unknown room (404), then with B1 THEN the third answers 201 without `Idempotency-Replayed`
- Scenario: overlap is not stored. WHEN R1 09:30–10:30 is posted with K1 (409), A is deleted and the same request is posted with K1 again THEN 201 without `Idempotency-Replayed`
### MODIFIED bookings-page
#### BPG-005: Create form
The system SHALL offer a form with room, title, organizer email, start and end (entered as UTC), validate it before sending, and refetch the list after a 201.
- Scenario: submit. WHEN the form holds R1, "Sprint planning", `ann@example.com`, `2030-01-07T09:00`, `2030-01-07T10:00` and is submitted THEN `createBooking` receives B1 and a UUID key, the form resets and the list is fetched again
- Scenario: client validation. WHEN the title is empty, the email is `x`, or end is not later than start THEN the field shows an error and `createBooking` is not called
- Scenario: API error. WHEN `createBooking` rejects with 404 `NOT_FOUND.ROOM` "Room … was not found" THEN an alert shows that message and the entered values stay
- Scenario: overlap. WHEN `createBooking` rejects with 409 `CONFLICT.BOOKING_OVERLAP` "The room is already booked in that time span" THEN an alert in the form shows that message, all five values stay, and the next submit carries a new key (BPG-006)
#### BPG-007: Edit a row
The system SHALL let the user edit title, start and end of a row and send only the fields whose value changed.
- Scenario: title only. WHEN a booking starting `2030-01-07T09:00:30.123Z` has its title changed to "Retro" and is saved THEN `updateBooking` receives exactly `{ title: "Retro" }` and the list is fetched again
- Scenario: no change. WHEN the dialog is saved untouched THEN `updateBooking` is not called
- Scenario: invalid. WHEN end is not later than start THEN the field shows the BPG-005 error; WHEN the API answers 400 THEN its message is shown in the dialog
- Scenario: overlap. WHEN `updateBooking` rejects with 409 `CONFLICT.BOOKING_OVERLAP` THEN the dialog stays open, shows the API's message and keeps the entered title, start and end

## Design
- Guard: inside the existing create and update transactions, `pg_advisory_xact_lock(hashtextextended('room:' || roomId, 0))`, then the overlap query, then the write. The lock waits (unlike the key try-lock), so the loser sees the winner's row and gets the friendly 409.
- The exclusion constraint alone is not the guard: two concurrent conflicting inserts can deadlock on it. It is the backstop (BKG-016); behind the room lock it never races.
- Constraint: `EXCLUDE USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)`, default `[)` bounds, in a new migration that first runs `CREATE EXTENSION IF NOT EXISTS btree_gist`, and as `@Exclusion` on the entity. Assumption: the migration role may create that extension (trusted contrib in Postgres 15); it is not a package dependency.
- Create order: key try-lock → stored key (replay or reuse) → room lock → overlap check → insert booking and key. The key is read first, so a replay never meets its own booking. The service order stays validation → room lookup → transaction → enqueue, so 400 and 404 win over 409.
- Update: the booking row lock first (BKG-009), then the room lock and the check against the merged span excluding its own `id`, only when `startsAt` or `endsAt` changes. A title-only patch takes no room lock and runs no check.
- Lock order is always key or row before room, and nothing takes a room lock first, so no cycle.
- The overlap is thrown inside the transaction through `ExceptionHelper.conflict`; the rollback leaves no key row (IDM-007) and the service never reaches the enqueue. `BookingService` needs no code change; its specs gain the cases.
- The overlap query uses the ORM (`LessThan`, `MoreThan`, `Not`); raw SQL only for the advisory lock and the migration.
- Assumption: the message is "The room is already booked in that time span"; the web app shows it as received and branches on nothing.
- Assumption: the web forms already show `error.message` and keep their values for any `ApiError`; the frontend tasks prove it and change code only if a spec fails. `use-idempotency-key.ts` already treats this 409 as a final answer.
- Existing specs that store several bookings in one room and span (integration specs, fixtures) move to distinct rooms or spans; their assertions stay.
- Home of each rule: overlap predicate, room lock and the 409 → `apps/booking/src/booking/booking-overlap.ts`, called by `idempotent-booking.repository.ts` and `booking.repository.ts`; constraint name → `booking.entity.ts`; constraint → 409 mapping → the shared rethrow in `booking.repository.ts`.

## Risks
| Risk | Applies | Note | Task |
|---|---|---|---|
| R-01 | no | no new input field | - |
| R-02 | yes | the check must use the merged span read under the row lock and other rows read under the room lock | T06 |
| R-03 | no | no new side effect; a rejected create enqueues nothing (BKG-013) | - |
| R-04 | no | no new parsing; spans arrive as parsed instants | - |
| R-05 | no | no new validator or parser | - |
| R-06 | no | compares `Date` instants and a `uuid` column, not raw strings | - |
| R-07 | no | no new rows, keys or jobs | - |
| R-08 | yes | overlap invariant; BKG-016 | T02 |
| R-09 | yes | room lock, exclusion constraint and rollback on the real database | T06 |
| R-10 | yes | "does not conflict with itself" and "no job enqueued" assertions name BKG-014 and BKG-013 | T07 |
| R-11 | yes | one overlap rule for create and update | T03 |
| R-12 | yes | raw SQL only for the advisory lock; overlap query through the ORM | T03 |
| R-13 | no | no new column, field or option | - |
| R-14 | no | key lifecycle unchanged; this 409 is a final answer under BPG-006, asserted in T09 | - |
| R-15 | no | no list mutation changes | - |
| R-16 | no | no list or select changes | - |
| R-17 | no | edit still sends only changed fields; a rejection sends nothing new | - |

## Tasks
- [x] T01 @main [BKG-013] Add `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'` to `ErrorCodeEnum` before the tracks start; the contract spec asserts the value | libs/contract/src/lib/error-code.enum.ts, libs/contract/src/lib/contract.constants.spec.ts
- [x] T02 @be [BKG-016, R-08] Migration with `btree_gist` and `EXCL_bookings_room_span`, `@Exclusion` and the exported constraint name on the entity; integration spec inserts an overlapping row directly and expects Postgres to refuse, and a touching row to be stored | libs/backend-common/src/lib/database/migrations/1731400000000-add-bookings-overlap-exclusion.ts, libs/backend-common/src/lib/database/migrations/index.ts, libs/backend-common/src/lib/entities/booking.entity.ts, libs/backend-common/src/index.ts, libs/backend-common/src/lib/database/booking-overlap-constraint.int.spec.ts
- [x] T03 @be [BKG-012, R-11, R-12] `requireFreeSpan(manager, span)`: room lock, ORM overlap query excluding an optional own id, 409 through `ExceptionHelper`; unit spec asserts the lock statement, the query conditions and the 409 for a create-shaped and an update-shaped call | apps/booking/src/booking/booking-overlap.ts, apps/booking/src/booking/booking-overlap.spec.ts
- [x] T04 @be [BKG-013, IDM-007] Idempotent create calls T03 after the key lookup and maps the exclusion violation to the same 409; unit spec: overlap rolls back with no key insert, replay and reuse never reach the check | apps/booking/src/booking/idempotent-booking.repository.ts, apps/booking/src/booking/idempotent-booking.repository.spec.ts, apps/booking/src/booking/booking.repository.ts
- [x] T05 @be [BKG-014] Update calls T03 with the merged span and its own id only when the span changes; unit spec: title-only patch runs no check, span patch does, constraint violation maps to 409 | apps/booking/src/booking/booking.repository.ts, apps/booking/src/booking/booking.repository.update.spec.ts
- [x] T06 @be [BKG-012, BKG-013, BKG-014, BKG-015, IDM-007, R-02, R-09] Integration spec on the real database: every BKG-012 span through create and update, the two simultaneous creates, the two simultaneous updates, itself and touching cases, key reusable after a 409; existing integration specs move to distinct rooms or spans | apps/booking/src/booking/booking-overlap.int.spec.ts, apps/booking/src/booking/booking-repositories.int.spec.ts, apps/booking/src/booking/booking-repositories.update.int.spec.ts
- [x] T07 @be [BKG-013, BKG-014, R-10] Booking service spec: an overlap from either repository surfaces as 409 `CONFLICT.BOOKING_OVERLAP`, create enqueues nothing, a title-only update succeeds; test names carry the requirement IDs | apps/booking/src/booking/booking.service.overlap.spec.ts
- [x] T08 @be [BKG-013, BKG-014] Gateway forwarding spec: a 409 `CONFLICT.BOOKING_OVERLAP` from the booking service reaches the HTTP answer unchanged on POST and PATCH | apps/gateway/src/booking/booking.service.spec.ts
- [x] T09 @fe [BPG-005] Create form spec for the overlap scenario: alert with the API message, five values kept, new key on the next submit; fix the form only if the spec fails | apps/web/src/views/bookings/create-booking-form.overlap.spec.tsx, apps/web/src/views/bookings/create-booking-form.tsx
- [x] T10 @fe [BPG-007] Edit dialog spec for the overlap scenario: dialog open, API message shown, entered values kept; fix the dialog only if the spec fails | apps/web/src/views/bookings/edit-booking-dialog.overlap.spec.tsx, apps/web/src/views/bookings/edit-booking-dialog.tsx
- [x] T11 @main [verify] Integration specs of `backend-common` and `booking` against the stack (cr/rules.md → Commands)
- [x] T12 @main [verify] `pnpm run build`, `pnpm run lint`, `pnpm run test`
