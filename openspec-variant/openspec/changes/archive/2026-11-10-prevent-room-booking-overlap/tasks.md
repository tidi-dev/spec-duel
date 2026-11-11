# Tasks

Conventions for every task: write the failing spec first, then the code; follow `design.md` for file names and the project rules for style (no `interface`, no `any`, named DTO classes for parameters, explicit repository return types, files under 200 lines, no narrative comments). Do not touch `apps/room`, `apps/web/src/views/rooms`, the migrations, or anything in `libs/contract` other than `error-code.enum.ts`.

## 1. Contract (`libs/contract`)

- [x] 1.1 Add `BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP'` to `ErrorCodeEnum` in `libs/contract/src/lib/error-code.enum.ts`, after `IDEMPOTENCY_IN_PROGRESS`; verify `git diff --stat libs/contract` lists only that file and `pnpm nx build contract` passes

## 2. Overlap check (`apps/booking`)

- [x] 2.1 Add `dto/booking-overlap-criteria.ts` with the class `BookingOverlapCriteria` (`roomId`, `startsAt: Date`, `endsAt: Date`, optional `excludedBookingId`) as in design D2; verify `pnpm nx build booking` passes
- [x] 2.2 Add `booking-overlap.query.ts` with `BookingOverlapQuery.existsLocked(manager, criteria)`: first the blocking `pg_advisory_xact_lock(hashtextextended($1, 0))` with the argument `booking-room:<roomId>`, then `manager.existsBy(BookingEntity, …)` with `LessThan(endsAt)`, `MoreThan(startsAt)` and `Not(excludedBookingId)` only when it is set; verify `booking-overlap.query.spec.ts` (mocked manager) asserts the lock SQL and argument, that the lock is called before `existsBy`, the where-clause with and without `excludedBookingId`, and that the method answers what `existsBy` answers

## 3. Create rejects overlap (`apps/booking`)

- [x] 3.1 Add `OVERLAP` to `IdempotentCreateOutcomeKindEnum` and `{ kind: OVERLAP }` to the `IdempotentCreateOutcome` union in `dto/idempotent-create-outcome.ts`; verify `pnpm nx build booking` fails only on the now non-exhaustive `switch` in `booking.service.ts` (fixed in 3.3)
- [x] 3.2 In `IdempotentBookingRepository.createLocked`, call `BookingOverlapQuery.existsLocked` after the key re-read and before the booking insert, returning `{ kind: OVERLAP }` when it is true (design D3); verify `idempotent-booking.repository.spec.ts` covers: overlap → outcome `OVERLAP` with neither `save` nor `insert` called; no overlap → `CREATED` as before; call order key lock, key read, room lock, overlap check, booking save, key insert; and `IN_PROGRESS` / `EXISTING` still return without running the overlap check
- [x] 3.3 In `BookingService.resolveCreateOutcome`, map `OVERLAP` to `ExceptionHelper.conflict(ErrorCodeEnum.BOOKING_OVERLAP, <message constant of design D5>)`; verify `booking.service.create.spec.ts` gains a case asserting 409 `CONFLICT.BOOKING_OVERLAP`, a non-empty message and that `confirmationQueueProducer.enqueue` is not called, and that the existing cases (created, both replays, 422, in-progress, unknown room) pass unchanged

## 4. Update rejects overlap (`apps/booking`)

- [x] 4.1 Add `dto/update-booking-outcome.ts` with `UpdateBookingOutcomeKindEnum` (`UPDATED`, `NOT_FOUND`, `OVERLAP`) and the `UpdateBookingOutcome` union (`UPDATED` carries the `BookingDto`), mirroring `idempotent-create-outcome.ts`; verify `pnpm nx build booking` passes
- [x] 4.2 Change `BookingRepository.update` to the transaction of design D4 (inject `DataSource`; read by id, `existsLocked` with `excludedBookingId`, update, re-read) with return type `Promise<UpdateBookingOutcome>`; move the update cases out of `booking.repository.spec.ts` into a new `booking.repository.update.spec.ts` and verify it covers: unknown id → `NOT_FOUND` without lock or write; overlap → `OVERLAP` without write; no overlap → `UPDATED` with the mapped booking and `update` called with `{ id }` and the three values; zero affected rows → `NOT_FOUND`; the overlap criteria carry the stored `roomId` and the booking's own id; and both spec files stay under 200 lines
- [x] 4.3 Change `BookingService.updateBooking` to switch on the outcome (`UPDATED` → booking, `NOT_FOUND` → existing 404, `OVERLAP` → 409 `CONFLICT.BOOKING_OVERLAP` with the same message constant); move the update cases out of `booking.service.spec.ts` into a new `booking.service.update.spec.ts`, adapt their repository mocks to the outcome type, and verify it covers: title-only change, both times changed, empty change set, the three 400 cases with no repository call, unknown id → 404, deleted during update → 404, and overlap → 409; verify `pnpm nx test booking` and `pnpm nx lint booking` pass

## 5. Gateway relays the new code (`apps/gateway`)

- [x] 5.1 Add `['POST', '', 409, ErrorCodeEnum.BOOKING_OVERLAP]` and ``['PATCH', `/${id}`, 409, ErrorCodeEnum.BOOKING_OVERLAP]`` to the relayed-errors table in `apps/gateway/src/booking/booking.controller.spec.ts`; verify `pnpm nx test gateway` passes with no change under `apps/gateway/src` other than that spec

## 6. Bookings page (`apps/web`)

- [x] 6.1 In `booking-create-form.spec.tsx`, add cases for a create rejected with an `ApiError` 409 `CONFLICT.BOOKING_OVERLAP` and the message of design D5: (a) the alert inside the form shows the message, all five fields keep their values and `onCreated` is not called; (b) after changing start and end and submitting again the alert is gone, a second request is sent with the new times and a different `Idempotency-Key`, and on success the form is empty and `onCreated` is called once; verify `pnpm nx test web` passes and the spec file stays under 200 lines (move the idempotency-key cases to `booking-create-form.idempotency-key.spec.tsx` if it would not)
- [x] 6.2 In `booking-edit-dialog.spec.tsx`, add cases for an update rejected with the same `ApiError`: (a) the dialog stays open, the alert inside it shows the message, title, start and end keep the entered values, `onSaved` and `onClose` are not called; (b) after changing the end and saving again one more update is sent with the new values and `onSaved` is called once; verify `pnpm nx test web` passes
- [x] 6.3 If a case of 6.1 or 6.2 fails against the current forms, fix `booking-create-form.tsx` or `booking-edit-dialog.tsx` (not the spec) until it passes; otherwise leave both files untouched; verify with `git diff --stat apps/web` and `pnpm nx lint web`

## 7. Integration checks

- [x] 7.1 Run `pnpm run build`, `pnpm run lint` and `pnpm run test`; verify all three exit 0
- [x] 7.2 Verify the scope: `git status --short` shows no change under `apps/room`, `apps/web/src/views/rooms`, `apps/web/src/pages/rooms`, `libs/backend-common/src/lib/database` or `libs/contract` apart from `error-code.enum.ts`, and no file created by this change exceeds 200 lines (`wc -l` on the changed files)
- [x] 7.3 With `pnpm run stack:reset` then `pnpm run stack:up` and the services running as described in `docs/local-setup.md`, exercise the gateway with a seeded room id and verify the answers of the `bookings-api` delta: identical span → 409 `CONFLICT.BOOKING_OVERLAP`; partial overlap at each end and containment → 409; adjacent before and after → 201; same span in another room → 201; update onto another booking → 409 and the booking unchanged; title-only update and shortening inside its own span → 200
- [x] 7.4 On the same stack, verify the `booking-idempotency` delta: a create rejected for overlap repeated with the same key → 409 again without `Idempotency-Replayed`; after deleting the other booking the same key and body → 201 without `Idempotency-Replayed`; repeating a completed create → 201 with `Idempotency-Replayed: true`; and the list shows no booking for any rejected create
- [x] 7.5 On the same stack, send ten creates for one room and one span at the same moment, each with its own `Idempotency-Key` (for example ten backgrounded `curl` calls followed by `wait`); verify exactly one 201 and nine 409 `CONFLICT.BOOKING_OVERLAP`, no 5xx, `GET /api/bookings?roomId=<id>` answers `total` 1, and that booking reaches `confirmationStatus` `SENT` with `confirmationAttempts` 1; repeat the run three times to rule out a lucky ordering
- [ ] 7.6 Open `/bookings` in the web app, create a booking, then submit the same room and span again and edit another booking onto it; verify the API message is shown in the create form and in the edit dialog, the typed values are kept, and `/rooms` still renders as before
