# Feature: meeting-room bookings

Add bookings to roombook: people book a meeting room for a time span, and get a confirmation.

The repository already has the gateway, the `booking`, `room` and `worker` services (health endpoints only for `booking` and `worker`), the room list, the `/rooms` page, and the shared contract in `libs/contract` (`@roombook/contract`). The contract already defines every route name, message pattern, DTO class, error code, header name, queue name and constant this feature needs. Use it as it is; do not change `libs/contract`.

Out of scope: the `room` service and the `/rooms` page must not be changed.

## 1. Bookings API (gateway, under `/api`)

A booking has: `id`, `roomId`, `title`, `organizerEmail`, `startsAt`, `endsAt`, `confirmationStatus` (`PENDING`, `SENT` or `FAILED`), `confirmationAttempts`, `createdAt`, `updatedAt`. Times are ISO 8601 in UTC. Errors are answered as `{ statusCode, errorCode, message }`.

- `POST /api/bookings` creates a booking and answers 201 with the booking. A new booking starts with `confirmationStatus` `PENDING` and `confirmationAttempts` 0.
- `GET /api/bookings?roomId=&page=1&limit=10` answers `{ items, total, page, limit }`, ordered by `startsAt` ascending. `roomId` is optional and filters by room.
- `GET /api/bookings/:id` answers 200 with the booking, or 404 with `NOT_FOUND.BOOKING`.
- `PATCH /api/bookings/:id` changes `title`, `startsAt` and/or `endsAt` and answers 200 with the updated booking, or 404 with `NOT_FOUND.BOOKING`.
- `DELETE /api/bookings/:id` answers 204, or 404 with `NOT_FOUND.BOOKING`. A deleted booking is gone: reading it afterwards answers 404.

Validation:
- An invalid body answers 400.
- `endsAt` must be later than `startsAt`; equal or earlier answers 400 with `BAD_REQUEST.VALIDATION`. This also holds after an update.
- The room must exist. The `booking` service asks the `room` service; an unknown room answers 404 with `NOT_FOUND.ROOM`.

The `booking` service owns bookings and their storage. The gateway only validates and forwards.

## 2. Idempotent create

`POST /api/bookings` requires the `Idempotency-Key` request header, whose value is a UUID.

- The header is missing or is not a UUID: 400 with `BAD_REQUEST.IDEMPOTENCY_KEY`.
- First request with a key: the booking is created, and the key, a fingerprint of the request body, and the response are stored. Claiming the key and inserting the booking happen in one database transaction.
- The same key with the same body, after the first request completed: the stored status and body are answered again, unchanged, with the response header `Idempotency-Replayed: true`. No second booking is created and no second confirmation job is enqueued.
- The same key with a different body: 422 with `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.
- The same key while the first request is still being processed: 409 with `CONFLICT.IDEMPOTENCY_IN_PROGRESS`. Two identical requests arriving at the same moment must never create two bookings.
- A request that fails validation is not stored against its key; the key can be used again.
- Keys do not expire.

## 3. Confirmation job

When a booking is created, the `booking` service enqueues one confirmation job on the queue `booking-confirmation` (`QueueEnum.BOOKING_CONFIRMATION`).

- Payload: `{ bookingId }` (`ConfirmationJobDto`).
- Job id: `confirmationJobId(bookingId)`, so that a booking can never have two confirmation jobs.
- Attempts: `CONFIRMATION_JOB_ATTEMPTS` (3), with exponential backoff starting at `CONFIRMATION_BACKOFF_MS` (1 second).

The `worker` service processes the job. It "sends" the confirmation and reports the outcome to the `booking` service over NATS (`BookingPatternEnum.RECORD_CONFIRMATION`, `RecordConfirmationResultDto`), which updates the booking's `confirmationStatus` and `confirmationAttempts`. The worker has no database access.

Nothing is really sent. The sender is simulated, with these fixed rules, decided by the booking's `organizerEmail`:
- an address ending in `@retry.example` (`RETRY_EMAIL_DOMAIN`) fails on the first two attempts and succeeds on the third: the booking ends as `SENT` with 3 attempts;
- an address ending in `@bounce.example` (`BOUNCE_EMAIL_DOMAIN`) fails on every attempt: after the third the booking ends as `FAILED` with 3 attempts;
- any other address succeeds on the first attempt: `SENT` with 1 attempt.

The processor must be safe to run twice for the same booking.

## 4. Bookings page (`apps/web`)

Add a `/bookings` page and a "Bookings" link in the navigation.

- A table of bookings: title, room name, organizer, start, end, confirmation status.
- A room filter above the table, filled from the room list.
- A form to create a booking: room, title, organizer email, start, end. Each submission generates one `Idempotency-Key`; if the same submission is retried after a network error, it reuses that key.
- Edit (title, start, end) and delete for each row.
- Loading, empty and error states. An error shows the message from the API.

## Done when

- Everything above works end to end through the gateway.
- New and changed services have unit tests; the page has tests with the service layer mocked.
- `pnpm run build`, `pnpm run lint` and `pnpm run test` pass.
