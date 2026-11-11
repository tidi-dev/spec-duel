# Code audit: speckit-variant (kit-written code, baseline-v1..HEAD)

Scope: `apps/` and `libs/` in `speckit-variant`, diff `baseline-v1..HEAD` (91 files). Paths below are relative to the variant root. Method: `.claude/skills/lean-audit/SKILL.md`, gates from `RULES.md` R1–R11 and the TypeScript and architecture rules in `be-development-rules.md`. Read-only: nothing was built, linted, tested or edited. Two small `node` checks were run against the installed `validator` package to confirm date parsing.

**What this code does:** roombook adds meeting-room bookings. The gateway accepts `POST/GET/PATCH/DELETE /api/bookings` (create needs an `Idempotency-Key` UUID header) and forwards each call over NATS to the booking service. The booking service checks the room through the room service, takes a Postgres advisory lock per room, refuses overlapping time spans, writes the booking and its idempotency row in one transaction, and then queues a BullMQ confirmation job that the worker processes with retries. The Next.js `/bookings` page lists, filters, creates, edits and deletes bookings. Change 3 fixes the rooms list `skip` so it uses the page size the caller asked for.
**Assumed load:** one internal office tool. Tens of users at once, a few requests per second at peak, one or a few replicas of each service, bookings in the thousands per room over the years. Two people booking the same room at the same moment is expected, and that is the case change 2 has to handle.

## Findings

### Must fix

1. **`PATCH` with `"startsAt": null` moves the booking start to 1 January 1970** (`apps/booking/src/booking/booking.service.ts:21-22,43`, `apps/booking/src/booking/booking.repository.ts:39,91-94`) — high [Verified]
   - **What this is:** The gateway DTO (`UpdateBookingDto`, `@IsOptional()`) lets `null` through, because class-validator's `IsOptional` skips `null` as well as `undefined` (I checked `IsOptional.js:20`). The service only treats `undefined` as "not sent". `isInstantOrAbsent(null)` calls `new Date(null)`, which is a valid date (epoch 0), and `toInstantOrNull(null)` returns `new Date(null)`.
   - **Problem:** `PATCH /api/bookings/:id {"startsAt": null}` passes every check. If the room has no other booking that ends before this booking's end, the row is saved with `starts_at = 1970-01-01T00:00Z`, and the room then counts as taken from 1970 up to that end time. If the room does have an earlier booking, the user gets a wrong `409 CONFLICT.BOOKING_OVERLAP`. `{"endsAt": null}` gives a misleading 400.
   - **Fix:** In `booking.service.ts`, treat `null` the same as invalid: `isInstantOrAbsent = (v) => v === undefined || (typeof v === 'string' && parseBookingInstant(v) !== null)`. Add a case to `booking.service.spec.ts` (and a gateway `PATCH` case in `apps/gateway/src/booking/booking.controller.spec.ts`) that sends `startsAt: null` and expects 400.
   - **If we skip it:** One malformed API call silently corrupts a booking and blocks the room until that booking's real end time.

### Should fix

2. **Date-times without a time-zone offset are read in the booking server's local time** (`apps/booking/src/booking/booking-time-range.util.ts:1-4`, used at `create-booking.service.ts:60-69`, `idempotent-booking.repository.ts:60,81-82`) — medium [Verified]
   - **What this is:** The contract DTO uses `@IsISO8601({ strict: true })`. That accepts `2030-01-07T09:00`, `2030-01-07` and the ordinal date `2030-007`. `parseBookingInstant` then passes the string to `new Date()`.
   - **Problem:** With `TZ=Asia/Ho_Chi_Minh`, `2030-01-07T09:00` is stored as `02:00Z`. In a UTC container the same request is stored as `09:00Z`, so the result depends on where the service runs. `2030-007` is ISO for 7 January, but `new Date` reads it as 1 July 2030 (both checked with node). The web app always sends `...Z`, so only direct API clients are affected.
   - **Fix:** In `parseBookingInstant`, also require a full date-time that ends in `Z` or `±hh:mm` (one regex), and return `null` otherwise. The existing 400 path handles the rest. Add those three strings as rejected cases to `booking-time-range.util.spec.ts`.
   - **If we skip it:** An API client that leaves out the offset books the wrong hour, and the result changes when a deploy changes the container time zone.

3. **A booking can stay `PENDING` forever when the confirmation job is lost** (`apps/booking/src/booking/create-booking.service.ts:31-35`, `apps/booking/src/booking/confirmation-queue.producer.ts:23-38`) — medium [Verified]
   - **What this is:** The job is queued only after the transaction has committed, and only for a `CREATED` result. A Redis error or the 2-second timeout is logged and then ignored.
   - **Problem:** Suppose Redis is down for a moment, or the booking process crashes between the commit and `queue.add`. The booking exists, no job exists, and nothing creates one later. A client retry with the same key gets `REPLAYED`, which never queues a job. The same thing happens if the worker cannot reach the booking service on all 3 attempts.
   - **Fix:** Add one sweeper in the booking service: on startup and every few minutes, queue `confirmationJobId(id)` for `PENDING` bookings older than one minute. The fixed `jobId` already stops duplicates. Cover it with a spec next to `confirmation-queue.producer.spec.ts`.
   - **If we skip it:** A short Redis outage leaves organizers without a confirmation, and their bookings show `PENDING` indefinitely.

4. **The create form throws away its idempotency key after a 503 or 409 "in progress", so the retry looks like a double-booking** (`apps/web/src/views/bookings/booking-create-form.tsx:38-43`) — medium [Verified]
   - **What this is:** `if (error instanceof ApiError) release();` drops the key on every HTTP error. The client interceptor (`services/api-client.ts:10`) wraps every response that has a status, including 503 and 409, in `ApiError`.
   - **Problem:** The gateway gives up after 5 s (`NATS_REQUEST_TIMEOUT_MS`) and returns 503. The booking service can still commit after that, for example after a slow room lookup or a wait for the room lock. The user clicks "Create booking" again, the request goes out with a new key, and the user gets `409 "The room is already booked for that time"` for their own booking. The list is not reloaded, so the booking they did create is not on screen. `409 CONFLICT.IDEMPOTENCY_IN_PROGRESS` goes the same way.
   - **Fix:** Release the key only for 4xx answers that prove nothing was stored: 400, 404, 422 and `CONFLICT.BOOKING_OVERLAP`. Keep it on 503 and on `IDEMPOTENCY_IN_PROGRESS`. Add "keeps the key after a 503" to `booking-create-form.spec.tsx`.
   - **If we skip it:** The retry protection that change 1 built on the server is undone on the client in exactly the case it exists for.

5. **Deleting the last row of the last page leaves the user on an empty page with no way back** (`apps/web/src/views/bookings/bookings-page.tsx:60-73`, `apps/web/src/views/bookings/use-bookings.ts:30`) — medium [Verified]
   - **What this is:** After a delete, `reload()` asks for the same page again. The table, including its `TablePagination`, is rendered only when `bookings.length > 0`.
   - **Problem:** With 11 bookings, go to page 2 and delete its one row. Page 2 comes back with `items: []` and `total: 10`. The page shows "No bookings found." and has no pager, even though 10 bookings exist. The user can only escape by changing the room filter or reloading the browser. The same thing happens when someone else deletes rows.
   - **Fix:** In `useBookings`, when a response has no items, `page > 1` and `total > 0`, call `setPage(Math.ceil(total / DEFAULT_PAGE_SIZE))`. Add the case to `bookings-page.spec.tsx` or `use-bookings.spec.ts`.
   - **If we skip it:** Users believe their bookings are gone.

6. **The concurrency protection and the raw SQL are tested only against mocks** (`apps/booking/src/booking/booking-overlap.query.spec.ts:38-49`, `idempotent-booking.repository*.spec.ts`, `booking.repository.update.spec.ts:54`) — medium [Verified]
   - **What this is:** The overlap rule, the per-room advisory lock, the two try-locks for idempotency, `COALESCE` in the update, and TypeORM's `[rows, rowCount]` result for `UPDATE ... RETURNING` all live in SQL strings. The specs check those strings with `toContain` and feed back canned rows. Of 39 kit specs, none runs a statement against Postgres.
   - **Problem:** Several mistakes would leave every spec green: swapping `$2`/`$3` in the overlap SQL as long as each substring still appears, a lock name typo between create and update, a TypeORM upgrade that changes the result shape, or a wrong cast. The race that change 2 exists to prevent has never actually been run.
   - **Fix:** Add one integration spec, `apps/booking/src/booking/booking-overlap.int.spec.ts`, against the docker-compose Postgres. It fires two concurrent `claim()` calls for the same room and slot and expects exactly one `CREATED` and one `OVERLAP`. It also runs one `update()` into an occupied slot, and checks that back-to-back bookings (end equals start) are allowed.
   - **If we skip it:** The highest-risk code in the change has only been tested against the developer's own assumptions.

7. **No database rule stops overlapping bookings; only code that remembers to take the lock does** (`libs/backend-common/src/lib/database/migrations/1731200000002-create-bookings.ts:20-28`, `apps/booking/src/booking/booking-overlap.query.ts:5-17`) — medium [Judgement]
   - **What this is:** No overlap is correct only while every writer calls `lockRoom` and then `isRoomSpanTaken` in the same transaction. Today two paths do this: `idempotent-booking.repository.ts:59` and `booking.repository.ts:86`.
   - **Problem:** Any later write path skips the check without anyone noticing: a bulk import, an admin script, a "move booking to another room" feature, or a manual SQL fix. The check also scans every booking in the room that starts before the new end, so it gets slower as history grows.
   - **Fix:** Add `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)` (needs `btree_gist`) in a new migration. Catch SQLSTATE `23P01` and turn it into `raiseBookingOverlap()`. The advisory lock can stay as the friendly first check.
   - **If we skip it:** The main rule of change 2 depends on discipline rather than on the schema.

8. **Raw `UPDATE`/`DELETE ... RETURNING` with a hand-written column list** (`apps/booking/src/booking/booking.repository.ts:17-37,101-117`) — medium [Verified]
   - **What this is:** `RETURNING_BOOKING` copies by hand the entity's mapping from column names to field names, so that update and delete can return the row. The update also repeats the end-after-start check in SQL (line 36), which `isEndAfterStart` at line 95 and the table's `CHECK` constraint already enforce.
   - **Problem:** Add a column, say `notes`, to `BookingEntity` and forget this list. `PATCH` and `DELETE` then return bookings without `notes`, and no spec notices, because the specs mock `query`. The `DELETE` body is thrown away anyway: the gateway answers 204 (`apps/gateway/src/booking/booking.controller.ts:80-82`).
   - **Fix:** Inside the existing transaction, use `manager.update(BookingEntity, id, {...})` and then `manager.findOneBy`. For delete, use `this.bookings.delete({ id })` and check `affected`, or keep a `findOneBy` before it if the NATS contract needs the body. This deletes `RETURNING_BOOKING`, `UPDATE_BOOKING_SQL` and `ReturnedBookingRows` (about 25 lines).
   - **If we skip it:** Every new booking field needs a second, untested edit in raw SQL.

9. **Booking rules for create and update live in different layers** (`create-booking.service.ts:60-69` + `idempotent-booking.repository.ts:59-62` vs `booking.service.ts:43-52` + `booking.repository.ts:91-100`) — medium [Judgement]
   - **What this is:** On create, the service checks the time range and the repository checks overlap. On update, the service checks only that the dates parse, and the repository checks the time range (after merging with the stored row) and overlap.
   - **Problem:** Add a rule such as "at most 8 hours" or "not in the past". A developer who puts it next to `assertTimeRange` in `CreateBookingService` leaves `PATCH` free to stretch a booking to 12 hours, because the merged update span is only visible inside `BookingRepository.updateWithin`. No spec runs the same rule through both paths.
   - **Fix:** Add one pure function, `bookingSpanError(startsAt, endsAt): UpdateBookingOutcomeEnum | null`, in `booking-time-range.util.ts`. Call it from `assertTimeRange` and from `updateWithin`. Test each new rule once there, plus one case per path.
   - **If we skip it:** Rules drift apart between create and edit, the same class of bug as a gateway DTO that disagrees with the service.

### Nice to have

10. **Hand-written transaction boilerplate, twice** (`apps/booking/src/booking/booking.repository.ts:61-75`, `apps/booking/src/booking/idempotent-booking.repository.ts:25-39`) — low [Verified]
    - **What this is:** Both methods repeat the same 13 lines of `createQueryRunner / connect / startTransaction / commit / rollback / release`. This is the clone-finder hit.
    - **Problem:** TypeORM's `dataSource.transaction(manager => ...)` does the same thing natively. Two copies must be kept in step, for example if an isolation level or a lock timeout is added.
    - **Fix:** `return this.dataSource.transaction((manager) => this.claimWithin(manager, key, fingerprint, booking));` and the same for `updateWithin`. The specs then mock `transaction` in place of the queryRunner record.
    - **If we skip it:** About 24 extra lines, plus two sets of queryRunner mocks in the specs.

11. **Title, start and end fields are written out twice in the web app** (`apps/web/src/views/bookings/booking-create-form.tsx:82-124` vs `apps/web/src/views/bookings/booking-edit-dialog.tsx:58-83`) — low [Verified]
    - **What this is:** The same three `TextField` blocks, with `register` and error wiring, appear in both components. The validation rules are already shared through `booking-form.schema.ts:16-27`.
    - **Problem:** A change to the time inputs, such as `step`, `min`, or a hint about the time zone, has to be made twice. Missing one copy makes create and edit behave differently. This is real but small.
    - **Fix:** A `BookingTimeAndTitleFields` component that takes `register` and `errors`. Only do this when the next field change comes.
    - **If we skip it:** About 25 duplicated lines.

12. **`response_status` is stored but never read** (`libs/backend-common/src/lib/entities/idempotency-key.entity.ts:12-13`, `apps/booking/src/booking/idempotent-booking.repository.ts:88`) — low [Verified]
    - **What this is:** Every idempotency row stores `201`. A replay never uses it: the gateway always answers `POST` with 201.
    - **Problem:** It is a column, an entity field and a write with no reader (grep found no other use).
    - **Fix:** Drop it, or use it in the replay path if replays are ever meant to return a different status.
    - **If we skip it:** Dead data, and readers may assume replay handles status codes.

13. **Idempotency rows and finished BullMQ jobs are kept forever** (`libs/backend-common/src/lib/database/migrations/1731200000003-create-idempotency-keys.ts`, `apps/booking/src/booking/confirmation-queue.producer.ts:25-33`) — low [Verified]
    - **What this is:** No expiry or cleanup for `idempotency_keys`, even though each row holds a full JSON copy of the booking. The queue sets neither `removeOnComplete` nor `removeOnFail`.
    - **Problem:** Both stores grow by one entry per booking with no limit. A key replayed months later returns 201 for a booking that may since have been edited or deleted.
    - **Fix:** Delete `idempotency_keys` older than 24 h (the sweeper from finding 3 can do it). Add `removeOnComplete: { age: 86400 }` to the job options. The `jobId` still stops duplicate jobs while the job is in the queue.
    - **If we skip it:** Fine at the assumed load for a long time. It becomes a cleanup task later.

14. **The fingerprint compares raw date strings, not instants** (`apps/booking/src/booking/booking-fingerprint.util.ts:4-9`) — low [Verified]
    - **What this is:** The request fingerprint hashes `startsAt`/`endsAt` exactly as the client sent them.
    - **Problem:** A client sends `...T09:00:00.000Z`, times out, and retries with the same key and `...T09:00:00Z`, the same instant. It gets `422 IDEMPOTENCY_KEY_REUSED` instead of a replay.
    - **Fix:** Hash `new Date(x).toISOString()` for both dates, after finding 2's check so the strings are known to be valid.
    - **If we skip it:** Rare: only clients that rebuild the body on retry hit it.

Left out (smaller): `CONFIRMATION_ENQUEUE_TIMEOUT_MS` is exported but used only inside its own file. `bookings-page.tsx:26` loads only the first 100 rooms (fine with 12 seeded). `PATCH {"title": null}` returns 200 without a change instead of 400. A concurrent request with a different body gets 422 even if the first request later rolls back. The create form shows no success message after a booking is created.

## Strengths

- Per-room transaction-scoped advisory lock, followed by a half-open overlap check in the same transaction, applied to both create and update. Back-to-back bookings are allowed (`apps/booking/src/booking/booking-overlap.query.ts:5-13`, `booking.repository.ts:86-100`, `idempotent-booking.repository.ts:59-62`).
- The idempotency claim is careful. Two non-blocking locks tell "same request still running" (409) apart from "key reused with another body" (422). The stored key is re-read under the lock, and the booking and key rows are written in one transaction (`apps/booking/src/booking/idempotent-booking.repository.ts:47-58,71-91`).
- All 11 raw `.query(` calls use bound parameters. No string concatenation reaches SQL, there is no `LIKE`, and no config is hardcoded (`booking-overlap.query.ts:16,26`, `booking.repository.ts:101,112`).
- Confirmation results that arrive late or out of order cannot overwrite a newer state, thanks to a conditional update (`PENDING` and `attempts <=`) (`apps/booking/src/booking/booking.repository.ts:119-128`). A deleted booking makes the worker job end quietly (`apps/worker/src/confirmation/confirmation.service.ts:17-20`).
- A Redis outage cannot hang booking creation, because the enqueue has a timeout (`apps/booking/src/booking/confirmation-queue.producer.ts:34`).
- Errors cross NATS correctly. `isErrorResponse` was moved into the lib and reused rather than copied (`libs/backend-common/src/lib/errors/error-response.guard.ts:3-13`). Room-service errors are wrapped again so their status survives the extra hop (`apps/booking/src/booking/room.client.ts:13-15`).
- Change 3 is a one-line fix with a test that walks every page and the page after the last one (`apps/room/src/room/room.repository.ts:19`, `room.repository.spec.ts:65-91`).
- The gateway spec boots the real HTTP app with the production pipes and filter and calls it with `fetch`, so it tests behaviour, not just mock calls (`apps/gateway/src/booking/booking.controller.spec.ts:46-51`). The web hook ignores responses that arrive after a newer request (`apps/web/src/views/bookings/use-bookings.ts:27-40`).

## Scorecard

| # | Area | Score (1–5) | Reason |
|---|------|:---:|--------|
| 1 | Code quality | 4 | Clear names, strict typing, consistent with the baseline helpers (`ExceptionHelper`, `NatsRequestUtil`). Marked down for the `null` handling gap (F1) and hand-mapped raw SQL (F8). |
| 2 | Code smells | 4 | Short functions, no narrative comments, named constants. Marked down for a dead column (F12), a redundant SQL guard (F8) and a hand-maintained column list. |
| 3 | Structure | 4 | Controller → service → repository is respected, transactions stay in repositories, and creation has its own service. Marked down because rules for the same thing sit in different layers for create and update (F9). |
| 4 | Duplication | 4 | Real but small: transaction boilerplate (F10) and form field blocks (F11). Baseline helpers are reused, not copied. |
| 5 | Potential bugs | 3 | Concurrency and idempotency are handled well. One high data-corruption path (F1) and four medium ones: time zones (F2), lost jobs (F3), client key release (F4), empty last page (F5). |
| 6 | Security | 4 | Bound parameters everywhere, no LIKE, no secrets or hardcoded config, UUID-checked key. Marked down for input-validation gaps (F1, F2). |
| 7 | Rule compliance | 5 | No R1–R11 violation found. No `interface` or `any`, explicit repository return types, no transaction in a service, every file under 200 lines, kebab-case names, one allowed constraint comment. |
| 8 | Tests | 3 | 182 cases with many behaviour-level UI and gateway tests. But locks and SQL are only mocked (F6), many backend specs assert mock calls, and the F1, F2, F4 and F5 cases are missing. |
| 9 | Maintainability / extensibility | 3 | A new page is easy (one view folder plus a 3-line route). A new field touches about 10 places, including the raw SQL list and the fingerprint list (F8, F14). A new booking rule must be added in two paths (F9). |
| 10 | Frontend | 3 | Clean small components, hook-based data fetching, loading and error states, labelled controls. Two real UX bugs: key release (F4) and the empty-page trap (F5). Repeated field blocks (F11). |

**Verdict:** Solid core. The race and idempotency design is right. Fix first, in this order: `PATCH null` → epoch (F1), date-times without an offset (F2), lost confirmation jobs (F3). Then add one real Postgres overlap test (F6).

**Lean:** -65 lines possible (F8 about -25, F10 about -24, F11 about -15 net, F12 about -3).

**Not checked:** Nothing was run: no build, lint, tests or real Postgres/Redis/NATS. Concurrency behaviour was reasoned from Postgres READ COMMITTED and advisory-lock rules, not executed. Not read: `main.ts` files and Nx/Next config, the baseline room service, room controller and gateway room module (only `room.repository.ts` and its spec), the baseline `rooms-page` beyond a skim, and the bodies of most web specs (only their test names). Kit documents (`specs/`, `.specify/`, `docs/`) were ignored as instructed, so the code was judged against the brief, not the kit's own requirements.
