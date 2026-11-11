# Contract: Service Messages and Queue

Patterns, queue name and payload classes come from `@roombook/contract`. The contract fixes the request
payloads; where it defines no answer class, the answer below reuses an existing contract class.

Errors cross NATS as `{ statusCode, errorCode, message }` raised through `ExceptionHelper`.

## Handled by the `booking` service

| Pattern | Request | Answer | Errors |
|---|---|---|---|
| `booking:createBooking` | `CreateBookingMessageDto` | `CreateBookingResultDto` | 400 `BAD_REQUEST.VALIDATION`, 404 `NOT_FOUND.ROOM`, 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS`, 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`, 503 `UNAVAILABLE.SERVICE` |
| `booking:listBookings` | `ListBookingsQueryDto` | `PagedBookingsDto` | — |
| `booking:findBookingById` | `BookingIdMessageDto` | `BookingDto` | 404 `NOT_FOUND.BOOKING` |
| `booking:updateBooking` | `UpdateBookingMessageDto` | `BookingDto` | 400 `BAD_REQUEST.VALIDATION`, 404 `NOT_FOUND.BOOKING` |
| `booking:deleteBooking` | `BookingIdMessageDto` | `BookingDto` (the deleted booking) | 404 `NOT_FOUND.BOOKING` |
| `booking:recordConfirmationResult` | `RecordConfirmationResultDto` | `BookingDto` as stored after the report, or `null` when the booking no longer exists | — |

Notes:

- `CreateBookingResultDto.replayed` is `true` when the answer came from the stored response; the
  `booking` in it is then the stored snapshot, not the current row.
- Every handler answers a value. A handler that answered nothing would leave the caller without a
  reply (research R8), which is why delete answers the deleted booking and the confirmation report
  answers `null` rather than nothing.
- `booking:recordConfirmationResult` never raises for a missing or already final booking; it changes
  nothing and answers the stored state.
- The `booking` service trusts the shape of its payloads: the gateway validates HTTP input, and the
  worker builds its report from contract types.

## Sent by the `booking` service

| Pattern | To | Request | Answer | Used for |
|---|---|---|---|---|
| `room:findRoomById` | `room` | `RoomIdMessageDto` | `RoomDto` | the room check on create; 404 `NOT_FOUND.ROOM` and 503 `UNAVAILABLE.SERVICE` are passed on to the caller |

## Sent by the `worker` service

| Pattern | To | Request | Used for |
|---|---|---|---|
| `booking:findBookingById` | `booking` | `BookingIdMessageDto` | reading the organizer address and the current confirmation status |
| `booking:recordConfirmationResult` | `booking` | `RecordConfirmationResultDto` | reporting the outcome of every attempt |

## Queue `booking-confirmation`

| | |
|---|---|
| Producer | `booking` service, once per created booking, after the create transaction commits |
| Consumer | `worker` service |
| Job name | `QueueEnum.BOOKING_CONFIRMATION` |
| Job id | `confirmationJobId(bookingId)` |
| Payload | `ConfirmationJobDto` — `{ bookingId }` |
| Options | `attempts: CONFIRMATION_JOB_ATTEMPTS`, `backoff: { type: 'exponential', delay: CONFIRMATION_BACKOFF_MS }` |

Processing of one attempt (`attempt` = attempts already made + 1):

| Situation | Report to `booking` | Job result |
|---|---|---|
| Booking not found | none | completes; no retry |
| Booking already `SENT` or `FAILED` | none | completes |
| Sender succeeds | `SENT`, `attempt` | completes |
| Sender fails, retries left | `PENDING`, `attempt` | fails; retried after the backoff |
| Sender fails on the last attempt | `FAILED`, `attempt` | fails; no retry |
| `booking` service does not answer | none | fails; retried if attempts are left |

Sender rule (`RETRY_EMAIL_DOMAIN`, `BOUNCE_EMAIL_DOMAIN`): an address ending in `@retry.example`
succeeds from attempt 3; ending in `@bounce.example` never succeeds; any other address succeeds on
attempt 1. Nothing is sent anywhere.

## Health

Unchanged: `health:booking`, `health:room` and `health:worker` already exist and are exposed as
`GET /api/health/<service>`. This feature adds no deployable service.
