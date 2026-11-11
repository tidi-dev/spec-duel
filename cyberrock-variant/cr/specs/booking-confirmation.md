# booking-confirmation

## CNF-001: Enqueue one confirmation job
The system SHALL have the `booking` service add one job to `QueueEnum.BOOKING_CONFIRMATION` after the create transaction commits.
- Scenario: job options. WHEN booking `b1` is created THEN `add` receives payload `{ bookingId: "b1" }`, `jobId` `confirmation-b1`, `attempts` 3, `backoff` `{ type: "exponential", delay: 1000 }`, `removeOnComplete` false and `removeOnFail` false

## CNF-002: A replay adds no second job
The system SHALL enqueue with the same job id on a replay (IDM-003), so the queue ignores it when the job exists and repairs it when it was lost.
- Scenario: replay. WHEN B1 with K1 is posted twice THEN the queue holds one job `confirmation-<id>`, whatever its state

## CNF-003: Enqueue failure is reported and recoverable
The system SHALL bound the enqueue with a 2000 ms timeout and answer 503 `UNAVAILABLE.SERVICE` when it fails or times out, keeping the committed booking and key.
- Scenario: Redis down or hanging. WHEN `add` rejects, or does not settle within 2000 ms THEN 503 `UNAVAILABLE.SERVICE`, the error is logged, and the booking and key row exist
- Scenario: recovery. WHEN the same request is then retried with K1 and Redis is back THEN 201 with `Idempotency-Replayed: true` and the job `confirmation-<id>` exists

## CNF-004: Simulated sender
The system SHALL decide the outcome of a send from the domain of `organizerEmail`, compared case-insensitively, and the attempt number (first attempt is 1).
- Scenario: retry domain. WHEN the address is `ann@retry.example` or `ann@RETRY.EXAMPLE` THEN attempts 1 and 2 fail and attempt 3 succeeds
- Scenario: bounce domain. WHEN the address is `ann@bounce.example` THEN attempts 1, 2 and 3 fail
- Scenario: any other. WHEN the address is `ann@example.com`, `ann@notretry.example` or `retry.example@example.com` THEN attempt 1 succeeds

## CNF-005: The worker reports every attempt
The system SHALL have the worker read the booking (`BookingPatternEnum.FIND_BY_ID`), send, and report over `BookingPatternEnum.RECORD_CONFIRMATION`: `SENT` on success, `PENDING` on a failure with attempts left (the job then fails so the queue retries), `FAILED` on the last failure, each with the attempt number.
- Scenario: plain address. WHEN the job runs for `ann@example.com` THEN one report `{ status: SENT, attempts: 1 }` and the booking reads `SENT`, 1
- Scenario: retry address. WHEN the job runs for `ann@retry.example` THEN reports `PENDING` 1, `PENDING` 2, `SENT` 3 and the booking ends `SENT`, 3
- Scenario: bounce address. WHEN the job runs for `ann@bounce.example` THEN reports `PENDING` 1, `PENDING` 2, `FAILED` 3 and the booking ends `FAILED`, 3

## CNF-006: Recording a result never moves backwards
The system SHALL apply a result in one conditional UPDATE: only when the stored status is not `SENT` and the stored attempts are not higher than the reported ones; an unknown booking answers 404 `NOT_FOUND.BOOKING`.
- Scenario: late or repeated result. WHEN the booking is `SENT`, 1 and `{ PENDING, 1 }` or `{ SENT, 1 }` arrives THEN it stays `SENT`, 1; WHEN it is `PENDING`, 2 and `{ PENDING, 1 }` arrives THEN it stays `PENDING`, 2
- Scenario: unknown booking. WHEN the booking was deleted THEN 404 `NOT_FOUND.BOOKING`

## CNF-007: The processor is safe to run twice
The system SHALL complete the job without sending or reporting when the booking is already `SENT` or no longer exists, and fail the job for a retry on any other error.
- Scenario: second run. WHEN the job runs again for a booking that reads `SENT` THEN nothing is sent, nothing is reported and the job completes
- Scenario: deleted booking. WHEN the read or the report answers 404 `NOT_FOUND.BOOKING` THEN the job completes and is not retried
- Scenario: booking service down. WHEN the read or the report answers 503 `UNAVAILABLE.SERVICE` THEN the job fails and the queue retries it
