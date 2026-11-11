# Proposal

## Why

roombook lists meeting rooms but nobody can book one: the `booking` and `worker` services answer health checks only. This change adds bookings end to end, so a person can book a room for a time span and the system records whether the confirmation was sent.

## What Changes

- Add a bookings API on the gateway under `/api/bookings`: create, list (paged, optional room filter, ordered by start time), read, update (`title`, `startsAt`, `endsAt`) and delete. The gateway validates and forwards over NATS; the `booking` service owns the rules and the storage.
- Add validation owned by the `booking` service: `endsAt` later than `startsAt` (also after an update), and the room must exist according to the `room` service.
- Make `POST /api/bookings` idempotent through a required `Idempotency-Key` header (a UUID): replay of a completed request, rejection of a reused key with a different body, rejection of a key that is still being processed, and no duplicate booking under concurrent identical requests.
- Add a confirmation job: the `booking` service enqueues one job per created booking on `booking-confirmation`; the `worker` processes it with a simulated sender and reports each outcome to the `booking` service over NATS, which records `confirmationStatus` and `confirmationAttempts`.
- Add a `/bookings` page to `apps/web` with a bookings table, a room filter, a create form that manages its `Idempotency-Key`, edit and delete per row, and loading, empty and error states. Add a "Bookings" link to the navigation.
- Add two tables (`bookings`, `idempotency_keys`) through one new migration in `libs/backend-common`.

Not changed: `libs/contract`, the `room` service and the `/rooms` page. No dependency is added.

Assumptions made where the request was silent (each is stated as a requirement in the specs so it can be reviewed):

- Two bookings may overlap in the same room; no availability check is part of this change.
- A booking id in the path that is not a UUID answers 400 `BAD_REQUEST.VALIDATION`.
- An empty `roomId=` query value is invalid (400); the filter is applied only when `roomId` is present.
- A time without a zone designator is read as UTC; a time with an offset is converted to UTC.
- Two bodies are "the same" when all five fields are equal as sent, character for character.
- On a create request, body validation is answered before the idempotency key is consulted, and the key is consulted before the room is checked.
- The worker reports every attempt, so `confirmationAttempts` moves 1, 2, 3 while the status stays `PENDING` between failed attempts.
- Email domain rules are matched case-insensitively.
- The page shows and accepts times in UTC, labelled as such, and does not refresh confirmation status on its own.

## Capabilities

### New Capabilities

- `bookings-api`: the HTTP contract for bookings on the gateway (create, list, read, update, delete), the booking resource shape, validation rules and error answers.
- `booking-idempotency`: the `Idempotency-Key` behaviour of booking creation (required header, replay, key reuse, in-progress conflict, concurrency guarantee, no expiry).
- `booking-confirmation`: the confirmation job per booking, the simulated sender rules, retry and backoff, and how outcomes are recorded on the booking.
- `bookings-page`: the `/bookings` page in the web app and its navigation link.

### Modified Capabilities

None. `openspec/specs/` holds no specs yet.

## Impact

- `apps/gateway`: new booking module (controller, idempotency-key guard, replay-header interceptor), registered in the app module.
- `apps/booking`: new booking module (NATS controller, service, validator, repositories, room lookup client, confirmation queue producer); the app module gains the NATS client and the queue registration.
- `apps/worker`: new confirmation module (BullMQ processor, service, simulated sender); the app module gains the NATS client.
- `apps/web`: new `/bookings` page, views and booking service; one more navigation item in `app-layout.tsx`.
- `libs/backend-common`: two new entities, one new migration, the data source entity list, and an exported error-response type guard (moved out of `rpc-exception.filter.ts`, behaviour unchanged).
- Database: new tables `bookings` and `idempotency_keys`. Redis: new queue `booking-confirmation`.
- Environment: no new variables.
