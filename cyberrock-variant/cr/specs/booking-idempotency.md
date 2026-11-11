# booking-idempotency

## IDM-001: Idempotency-Key header is required
The system SHALL answer 400 `BAD_REQUEST.IDEMPOTENCY_KEY` at the gateway when `POST /api/bookings` has no `Idempotency-Key` header or its value is not a UUID, checked before the body.
- Scenario: missing or malformed. WHEN the header is absent, empty or `abc` THEN 400 `BAD_REQUEST.IDEMPOTENCY_KEY` and no NATS message is sent, even if the body is also invalid

## IDM-002: Key and booking are stored atomically
The system SHALL store the key, the request fingerprint and the response body in the same database transaction that inserts the booking.
- Scenario: both or neither. WHEN the booking insert fails inside the transaction THEN no row for K1 exists; WHEN it succeeds THEN exactly one key row and one booking exist

## IDM-003: Replay a completed request
The system SHALL answer a request whose key and fingerprint match a completed one with 201, the stored body unchanged and the response header `Idempotency-Replayed: true`, creating no booking.
- Scenario: replay. WHEN B1 with K1 is posted twice in a row THEN both answer 201 with the same `id`, only the second has `Idempotency-Replayed: true`, and one booking exists
- Scenario: stored body, not current state. WHEN the booking has since become `SENT` or been deleted and B1 with K1 is posted again THEN 201 with the original body (`PENDING`, 0 attempts)

## IDM-004: Fingerprint of the normalised body
The system SHALL compute the fingerprint from the parsed body (instants as epoch milliseconds, `roomId` lower-cased, fixed field order) and compare keys case-insensitively.
- Scenario: same request, other spelling. WHEN B1 is replayed with reordered properties, `startsAt` `2030-01-07T16:00:00+07:00`, `endsAt` `2030-01-07T10:00:00Z`, `roomId` and K1 in upper case THEN it is a replay (IDM-003)
- Scenario: real difference. WHEN `title` is `sprint planning` instead of `Sprint planning` THEN it is a different body (IDM-005)

## IDM-005: A key cannot be reused for another body
The system SHALL answer 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED` when a stored key arrives with a different fingerprint.
- Scenario: reuse. WHEN K1 completed for B1 and K1 is posted with `title` `Retro` THEN 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`, no booking is created and the first one is unchanged

## IDM-006: One winner for concurrent requests
The system SHALL answer 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` to a request whose key is being processed by another transaction, without waiting for it.
- Scenario: in progress. WHEN K1's transaction is open and B1 with K1 arrives THEN 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` at once
- Scenario: simultaneous. WHEN ten B1 requests with K1 run at the same moment against the real database THEN exactly one booking exists and every answer is 201 (first or replay) or 409

## IDM-007: Failed requests do not consume the key
The system SHALL store nothing against a key whose request is answered 400, 404, 409 `CONFLICT.BOOKING_OVERLAP` or 503 before the transaction commits.
- Scenario: key reusable. WHEN K1 is posted with `endsAt` equal to `startsAt` (400), then with an unknown room (404), then with B1 THEN the third answers 201 without `Idempotency-Replayed`
- Scenario: overlap is not stored. WHEN R1 09:30–10:30 is posted with K1 (409), A is deleted and the same request is posted with K1 again THEN 201 without `Idempotency-Replayed`
