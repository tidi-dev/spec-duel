# Tasks

Conventions for every task: write the failing spec first, then the code; follow `design.md` for file names and the project rules for style (no `interface`, no `any`, named DTO classes for parameters, explicit repository return types, files under 200 lines). Do not touch `libs/contract`, `apps/room` or `apps/web/src/views/rooms`.

## 1. Shared library (`libs/backend-common`)

- [x] 1.1 Move `isErrorResponse` from `errors/rpc-exception.filter.ts` into an exported `errors/error-response.guard.ts` with its own spec (object with the three fields, missing field, non-object), import it in the filter and export it from `index.ts`; verify `pnpm nx test backend-common` passes with the existing filter spec unchanged
- [x] 1.2 Add `entities/booking.entity.ts` and `entities/idempotency-key.entity.ts` with the columns of design D3, export both from `index.ts` and add them to the `entities` list in `database/data-source.ts`; verify `pnpm nx build backend-common` passes
- [x] 1.3 Add `database/migrations/1731200000002-create-bookings.ts` creating `bookings` (both `CHECK` constraints, both indexes) and `idempotency_keys`, with a `down` that drops them, and register it in `migrations/index.ts`; verify `pnpm run migration:run` then `pnpm run migration:revert` then `pnpm run migration:run` all succeed against the local stack database

## 2. Booking service: read, list, update, delete (`apps/booking`)

- [x] 2.1 Add `booking-time.util.ts` (zone-less value read as UTC, unparseable value raises 400 `BAD_REQUEST.VALIDATION`) and `booking.mapper.ts` (entity to `BookingDto`, times through `toISOString()`); verify their specs cover an offset, a zone-less value, a week date and the mapped field list
- [x] 2.2 Add `booking.repository.ts` with `findById`, `findPage` (order `starts_at, id`, `skip = (page - 1) * limit`, optional `roomId`), `update` and `delete`, each with an explicit return type; verify `booking.repository.spec.ts` asserts the query options for page 1, page 2 with limit 5, the room filter, and `null` / `false` for an unknown id
- [x] 2.3 Add `booking.validator.ts` with the time-order rule (equal and earlier both rejected with 400 `BAD_REQUEST.VALIDATION`); verify its spec covers later, equal and earlier
- [x] 2.4 Add `booking.service.ts` with `listBookings`, `findBookingById`, `updateBooking` (read, merge stored and changed values, validate, update) and `deleteBooking`, raising 404 `NOT_FOUND.BOOKING` through `ExceptionHelper`; verify `booking.service.spec.ts` covers the found and not-found path of each method, an update that moves `startsAt` past the stored `endsAt`, and an empty change set
- [x] 2.5 Add `booking.controller.ts` handlers for `BookingPatternEnum.LIST`, `FIND_BY_ID`, `UPDATE` and `DELETE` (one delegating statement each) and `booking.module.ts`; register the module and `NatsClientModule` in the app module; verify the controller spec asserts each pattern's metadata and delegation, and `pnpm nx build booking` passes

## 3. Booking service: idempotent create and confirmation job (`apps/booking`)

- [x] 3.1 Add `booking-fingerprint.util.ts` (SHA-256 hex over the five fields as sent, fixed order); verify its spec shows equal bodies give equal fingerprints, and a changed title or a differently written instant gives a different one
- [x] 3.2 Add `room-lookup.client.ts` asking `RoomPatternEnum.FIND_BY_ID` through `NatsRequestUtil`, re-raising `NOT_FOUND.ROOM` as a 404 `RpcException` and letting `UNAVAILABLE.SERVICE` pass; verify its spec covers found, unknown room and no answer
- [x] 3.3 Add `confirmation-queue.producer.ts` and register the queue `QueueEnum.BOOKING_CONFIRMATION` in the booking module; verify its spec asserts `add` is called with payload `{ bookingId }`, `jobId` `confirmationJobId(bookingId)`, `attempts` 3 and exponential backoff with delay 1000, and that a rejected `add` is logged and not rethrown
- [x] 3.4 Add `idempotent-booking.repository.ts` with `findByKey` and the single-transaction `create` of design D4 (try advisory lock, read key, insert booking, insert key row), returning the named outcome type; verify its spec, with a mocked `DataSource.transaction` and entity manager, covers the three outcomes and asserts nothing is inserted for *in progress* and *existing*
- [x] 3.5 Add `createBooking` to the service in the order of design D4 (validate, fast-path key read, room lookup, repository create, enqueue only for *created*) and the `BookingPatternEnum.CREATE` handler; verify `booking.service.spec.ts` covers: created (enqueued once, `replayed` false), replay from the fast path and from the repository (`replayed` true, stored body, no room lookup on the fast path, no enqueue), different fingerprint → 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`, in progress → 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS`, invalid time order → 400 before any key read, unknown room → 404 with nothing stored

## 4. Booking service: record confirmation (`apps/booking`)

- [x] 4.1 Add `recordConfirmation` to `booking.repository.ts` as one conditional update (`confirmation_status = 'PENDING'` and `confirmation_attempts <= :attempts`); verify the repository spec asserts the where-clause and that zero affected rows resolves without error
- [x] 4.2 Add `recordConfirmationResult` to the service and the `BookingPatternEnum.RECORD_CONFIRMATION` handler; verify the service and controller specs cover a recorded outcome and an unknown booking id answered without error

## 5. Gateway (`apps/gateway`)

- [x] 5.1 Add `idempotency-key.guard.ts`; verify its spec covers a missing header, a non-UUID value (both 400 `BAD_REQUEST.IDEMPOTENCY_KEY`) and a valid UUID
- [x] 5.2 Add `idempotency-replayed.interceptor.ts`; verify its spec shows the body becomes the booking, and the `Idempotency-Replayed: true` header is set only when `replayed` is true
- [x] 5.3 Add `booking.controller.ts` with the five routes of the `bookings-api` spec and `booking.module.ts`, registered in the app module; verify `booking.controller.spec.ts` (HTTP listener with a mocked NATS client, as in `room.controller.spec.ts`) covers: 201 forwarding `{ idempotencyKey, booking }` to `BookingPatternEnum.CREATE`; replay header; missing key → 400 `BAD_REQUEST.IDEMPOTENCY_KEY` without a NATS call, also when the body is invalid; invalid body → 400 `BAD_REQUEST.VALIDATION`; list defaults, room filter and each invalid query; `GET`, `PATCH` and `DELETE` forwarding with their payload classes; `DELETE` → 204 with an empty body; non-UUID `:id` → 400; an error object from the booking service answered with its status and `errorCode`

## 6. Worker (`apps/worker`)

- [x] 6.1 Add `simulated-confirmation.sender.ts`; verify its spec is a table over attempts 1 to 3 for an ordinary address, `@retry.example`, `@bounce.example` and an upper-case domain
- [x] 6.2 Add `booking.client.ts` (find the booking, returning `null` for `NOT_FOUND.BOOKING`; report an outcome) over `NatsRequestUtil`; verify its spec covers found, not found, another error rethrown, and the reported payload
- [x] 6.3 Add `confirmation.service.ts` implementing the run of design D7; verify its spec covers: ordinary address → reports `SENT`/1 and resolves; retry address attempts 1 and 2 → reports `PENDING` with the attempt and rejects, attempt 3 → `SENT`/3; bounce address attempt 3 → reports `FAILED`/3 and rejects; booking not found → no send, no report, resolves; booking already `SENT` → no send, no report; the same attempt run twice → identical report
- [x] 6.4 Add `confirmation.processor.ts` on `QueueEnum.BOOKING_CONFIRMATION` (delegates with `bookingId` and `attemptsMade + 1`) and `confirmation.module.ts`; register it and `NatsClientModule` in the app module; verify the processor spec asserts the delegation and `pnpm nx build worker` passes

## 7. Web: services, page and navigation (`apps/web`)

- [x] 7.1 Add `services/booking.service.ts` (`listBookings`, `createBooking`, `updateBooking`, `deleteBooking`); verify `booking.service.spec.ts`, with `apiClient` mocked, asserts each path and method, that `roomId` is left out when not given, and that create sends the `Idempotency-Key` header
- [x] 7.2 Add `views/bookings/booking-time-format.ts`; verify its spec covers ISO → `YYYY-MM-DD HH:mm`, ISO → input value and input value → ISO UTC
- [x] 7.3 Add `bookings-table.tsx` and `booking-room-filter.tsx`; verify their specs cover the six columns, room name with fallback to the room id, the empty message, the edit and delete actions calling back with the row's booking, and the filter options with "All rooms"
- [x] 7.4 Add `booking-create-form.tsx` using `react-hook-form` without a resolver; verify its spec covers a valid submit (payload in ISO UTC), a required-field error, the end-after-start error, the disabled button while pending, the API message shown with values kept, the same key reused after a network error, a new key after success and a new key after a field change
- [x] 7.5 Add `booking-edit-dialog.tsx` and `booking-delete-dialog.tsx`; verify their specs cover prefilled values, save, cancel, the end-after-start error, confirm, decline and the API message shown
- [x] 7.6 Add `bookings-page.tsx` and `pages/bookings/index.tsx`; verify `bookings-page.spec.tsx`, with `booking.service` and `room.service` mocked, covers loading, rows, empty, load error with the API message, filtering by room (page reset to 1), paging, reload after create, edit and delete, and a delete error
- [x] 7.7 Add the "Bookings" item to `NAV_ITEMS` in `layouts/app-layout.tsx`; verify `app-layout.spec.tsx` asserts both the "Rooms" and the "Bookings" links

## 8. Integration checks

- [x] 8.1 Run `pnpm run build`, `pnpm run lint` and `pnpm run test`; verify all three exit 0, and that `git status` shows no change under `libs/contract`, `apps/room` or `apps/web/src/views/rooms`
- [ ] 8.2 Start the stack with `pnpm run stack:up` and walk the `bookings-api` scenarios through the gateway with `curl`; verify create 201, list with and without `roomId`, read, patch, delete 204 then 404, unknown room 404 `NOT_FOUND.ROOM`, and `endsAt` not after `startsAt` 400
- [ ] 8.3 Against the running stack, verify the `booking-idempotency` scenarios: missing and malformed key 400; replay answers the same body with `Idempotency-Replayed: true`; a different body answers 422; ten parallel identical requests leave exactly one booking, with every answer being the one plain 201, a replayed 201 or a 409; a key used for a rejected request works afterwards
- [ ] 8.4 Against the running stack, verify the `booking-confirmation` scenarios by reading each booking after its job finished: an ordinary address ends `SENT` with 1 attempt, `@retry.example` ends `SENT` with 3, `@bounce.example` ends `FAILED` with 3, and a booking deleted right after creation leaves no failed job in `tmp/logs/worker.log`
- [ ] 8.5 Open `/bookings` in the web app; verify the navigation link, the table, the room filter, create, edit and delete work against the gateway, then stop the stack with `pnpm run stack:down`
