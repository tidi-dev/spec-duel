# Spec Delta

## Purpose

Sends one confirmation for every created booking through a background job, with bounded retries, and records on the booking whether the confirmation was sent or failed and how many attempts were made.

## ADDED Requirements

### Requirement: One confirmation job per booking
The system SHALL enqueue exactly one confirmation job on the queue `booking-confirmation` when a booking is created, after the booking is stored. The payload SHALL be `{ bookingId }` and the job id SHALL be the contract's confirmation job id for that booking, so a booking can never have two jobs. Updates, deletes and replays SHALL NOT enqueue a job.

#### Scenario: Job enqueued on create
- **WHEN** a booking is created
- **THEN** the queue `booking-confirmation` holds one job with payload `{ bookingId }` and job id `confirmation-<bookingId>`

#### Scenario: No job for a rejected create
- **WHEN** a create is answered with 400, 404, 409 or 422
- **THEN** no job is enqueued

#### Scenario: No second job on replay
- **WHEN** a completed create is replayed with the same key and body
- **THEN** the queue still holds one job for that booking

### Requirement: Retry policy
The system SHALL run a confirmation job at most 3 times, waiting with exponential backoff that starts at 1 second between attempts (1 second before the second attempt, 2 seconds before the third).

#### Scenario: Job options
- **WHEN** a confirmation job is enqueued
- **THEN** it is configured with 3 attempts and exponential backoff with a 1000 ms starting delay

#### Scenario: No fourth attempt
- **WHEN** the third attempt of a job fails
- **THEN** the job is not run again

### Requirement: Simulated sender rules
The system SHALL NOT send a real message. Each attempt's result SHALL be decided only by the booking's `organizerEmail` and the attempt number: an address ending in `@retry.example` fails on attempts 1 and 2 and succeeds on attempt 3; an address ending in `@bounce.example` fails on every attempt; any other address succeeds on attempt 1. The domain SHALL be matched case-insensitively.

#### Scenario: Ordinary address
- **WHEN** a booking is created with `organizerEmail` `ana@example.com` and its job has finished
- **THEN** the booking has `confirmationStatus` `SENT` and `confirmationAttempts` 1

#### Scenario: Retry address
- **WHEN** a booking is created with `organizerEmail` `ana@retry.example` and its job has finished
- **THEN** the booking has `confirmationStatus` `SENT` and `confirmationAttempts` 3

#### Scenario: Bounce address
- **WHEN** a booking is created with `organizerEmail` `ana@bounce.example` and its job has finished
- **THEN** the booking has `confirmationStatus` `FAILED` and `confirmationAttempts` 3

#### Scenario: Upper-case domain
- **WHEN** a booking is created with `organizerEmail` `ana@BOUNCE.EXAMPLE` and its job has finished
- **THEN** the booking has `confirmationStatus` `FAILED` and `confirmationAttempts` 3

### Requirement: Outcome is recorded on the booking
The worker SHALL report the outcome of every attempt to the `booking` service, which records it on the booking: a successful attempt as `SENT`, a failed third attempt as `FAILED`, and a failed earlier attempt as `PENDING`, each with the attempt number as `confirmationAttempts`. The worker SHALL have no database access; it reads the booking and reports through the `booking` service only.

#### Scenario: Progress between attempts
- **WHEN** the first attempt for a `@retry.example` booking has failed and the second has not yet run
- **THEN** the booking has `confirmationStatus` `PENDING` and `confirmationAttempts` 1

#### Scenario: Outcome is visible through the API
- **WHEN** a client reads a booking after its job has finished
- **THEN** the answer carries the recorded `confirmationStatus` and `confirmationAttempts`

### Requirement: Processing is safe to repeat
The system SHALL reach the same final booking state when the confirmation job for a booking is processed more than once. A booking whose status is `SENT` or `FAILED` SHALL never change status or attempts again, and a recorded attempt count SHALL never decrease.

#### Scenario: Job processed again after SENT
- **WHEN** the job of a booking that is `SENT` with 1 attempt is processed a second time
- **THEN** nothing is sent and the booking stays `SENT` with 1 attempt

#### Scenario: Same attempt delivered twice
- **WHEN** the same attempt of a job is processed twice
- **THEN** both runs report the same outcome and the booking holds that outcome once

#### Scenario: Late report after a final outcome
- **WHEN** an outcome `PENDING` with 1 attempt reaches the `booking` service after the booking was recorded as `SENT` with 3 attempts
- **THEN** the booking stays `SENT` with 3 attempts

### Requirement: Confirmation for a deleted booking
The system SHALL finish a confirmation job without sending and without retrying when its booking no longer exists. A reported outcome for a booking that no longer exists SHALL be ignored without error.

#### Scenario: Booking deleted before the job runs
- **WHEN** a booking is deleted before its confirmation job is processed
- **THEN** the job completes, nothing is sent and no further attempt is made

#### Scenario: Booking deleted between attempts
- **WHEN** a `@retry.example` booking is deleted after its first failed attempt
- **THEN** the next attempt completes without sending and the job is not retried
