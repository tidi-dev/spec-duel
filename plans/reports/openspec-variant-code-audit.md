# Code audit: openspec-variant (kit-written code, `baseline-v1..HEAD`)

Scope: `apps/` and `libs/` of `openspec-variant`, kit-written diff only (89 files). Unchanged baseline code read only where new code calls it (`NatsRequestUtil`, `ExceptionHelper`, `RpcExceptionFilter`, `configure-gateway-app.ts`, `api-client.ts`, contract DTOs). `libs/contract` is not scored as kit work. All paths below are relative to `openspec-variant/`.

**What this code does:** The kit added bookings end to end. The gateway takes HTTP calls on `/api/bookings` (with an `Idempotency-Key` header on create), validates them and forwards them over NATS to the booking service. The booking service checks the room through the room service, then in one Postgres transaction takes advisory locks (a key lock that fails fast, then a per-room lock that waits), checks for an overlapping booking, saves the booking and the idempotency key, and queues a confirmation job in BullMQ. The worker sends a simulated email, retries it, and reports the result back over NATS. The Next.js `/bookings` page lists, filters, creates, edits and deletes bookings. Change 3 fixed the rooms list `skip`, which used the default page size instead of the requested one.

**Assumed load:** a small team. A few people book at once, sometimes the same room at the same minute. One instance of each service and one worker. Thousands of bookings, not millions.

## Findings

### Should fix

1. **A partial PATCH can silently undo another user's change** (`apps/booking/src/booking/booking.service.ts:67-73`, `apps/booking/src/booking/booking.repository.ts:60-75`) — medium [Verified]
   - **What this is:** `updateBooking` reads the booking outside any transaction, fills in missing fields from that read (`changes.startsAt ?? stored.startsAt`), and sends a full `{ title, startsAt, endsAt }` to the repository. The repository then locks the room and writes all three fields.
   - **Problem:** Client A sends `PATCH {title:"Retro"}` while client B sends `PATCH {startsAt, endsAt}` to move the same booking. Both read the old times first. B commits the move, then A writes the new title together with the old times it read. B gets 200, but its move is undone. If someone booked the old slot in between, A gets a 409 overlap for what was only a title change.
   - **Fix:** Pass the partial `changes` to `updateLocked`. Merge them there with the row read inside the transaction, after the room lock (or read the row with `lock: { mode: 'pessimistic_write' }`), and check the time order on the merged values.
   - **If we skip it:** API clients that send only the changed fields (which the PATCH contract allows) lose updates without any error. The web dialog always sends all three fields, so it only hides the problem.

2. **When enqueueing fails, the booking stays PENDING forever** (`apps/booking/src/booking/confirmation-queue.producer.ts:18-31`, `apps/booking/src/booking/booking.service.ts:98-100`) — medium [Verified]
   - **What this is:** The booking is committed first. Then `enqueue` adds the confirmation job, and any error from it is caught and only logged.
   - **Problem:** If Redis is down for a moment, or the process dies between the commit and `queue.add`, no job exists. A retry with the same key goes through `replay` (`booking.service.ts:113-121`), which never enqueues. Nothing ever moves the booking out of `PENDING`. `confirmation-queue.producer.spec.ts:36` asserts the swallow, so the spec locks the gap in. (My judgement, not verified: with ioredis's offline queue, `add` may wait instead of failing. In that case the 5 s NATS timeout returns 503 to the client for a booking that was in fact saved.)
   - **Fix:** On replay of a booking whose `confirmationStatus` is `PENDING` and `confirmationAttempts` is `0`, call `enqueue` again. The fixed `jobId` (`confirmationJobId`) makes a second add a no-op. That is about 3 lines.
   - **If we skip it:** Organizers silently get no confirmation, and the UI shows PENDING forever with no way to retry.

3. **No test runs the locks or the overlap rule against Postgres** (`apps/booking/src/booking/idempotent-booking.repository.spec.ts:93-112`, `apps/booking/src/booking/booking.repository.update.spec.ts:68-75`, `apps/booking/src/booking/booking-overlap.query.spec.ts:23-31`) — medium [Verified]
   - **What this is:** Change 2's whole guarantee (no double booking under concurrent create or update, back-to-back slots allowed) depends on advisory-lock order, READ COMMITTED visibility and `<`/`>` bounds. The specs mock `EntityManager` and check SQL strings and `invocationCallOrder`.
   - **Problem:** The specs would still pass if the lock SQL were wrong, if the transaction ran at REPEATABLE READ (the second create's snapshot would miss the first insert and both would commit), or if `LessThan` became `LessThanOrEqual` in both the code and the spec. Finding 1 also gets past every spec.
   - **Fix:** Add one spec against the docker-compose Postgres, `apps/booking/src/booking/booking-overlap.integration.spec.ts`. It should cover: two parallel creates for the same room and slot (exactly one succeeds), a back-to-back create (succeeds), a parallel update and create into the same slot (one fails), and a parallel title-only and time-only PATCH (both changes kept, which is finding 1).
   - **If we skip it:** The most important rule in the feature is protected only by assertions on mock calls.

4. **Overlap is enforced only by app-level locks; the database allows it** (`apps/booking/src/booking/booking-overlap.query.ts:9-17`, `libs/backend-common/src/lib/database/migrations/1731200000002-create-bookings.ts:7-23`) — medium [Judgement]
   - **What this is:** Every write path must remember to call `BookingOverlapQuery.existsLocked` inside a transaction. The table has CHECK constraints for time order and status, but nothing for overlap.
   - **Problem:** Any future write path that skips the helper can store overlapping rows: a bulk import, a "change room" feature, a seed script or manual SQL. Postgres will not object.
   - **Fix:** Add `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` (needs `btree_gist`) and map error `23P01` to `CONFLICT.BOOKING_OVERLAP`. The room lock can stay as a fast path or be removed.
   - **If we skip it:** The rule holds only as long as every future developer knows about the helper.

5. **The create form and the edit dialog copy the same fields and rules** (`apps/web/src/views/bookings/booking-create-form.tsx:86-135`, `apps/web/src/views/bookings/booking-edit-dialog.tsx:59-94`) — medium [Verified]
   - **What this is:** The Title, Start (UTC) and End (UTC) `TextField`s are duplicated, each with its `required` messages, `maxLength`, the `isEndAfterStart` validate rule and the `SHRUNK_LABEL` constant. This is most of the 7.9% the clone finder flagged.
   - **Problem:** Suppose a new rule arrives, such as a maximum booking length or a working-hours limit. It must be added in both files, and forgetting one lets the create form and the edit dialog accept different input.
   - **Fix:** Extract one `BookingTimeAndTitleFields` component that takes `register` and `errors`, and use it in both. That saves about 30 lines.
   - **If we skip it:** The two forms drift apart the next time a field or rule changes.

### Nice to have

6. **Editing only the title moves a booking that has seconds** (`apps/web/src/views/bookings/booking-time-format.ts:1-3`, `apps/web/src/views/bookings/booking-edit-dialog.tsx:28-44`) — low [Verified]
   - **What this is:** `isoToInputValue` cuts the ISO string to `YYYY-MM-DDTHH:mm`, and the dialog always sends both times back.
   - **Problem:** Take a booking created through the API for `10:00:30Z`–`11:00:30Z`. Rename it in the UI, and it is saved as `10:00Z`–`11:00Z`. That can even fail with 409 if a booking ends at `10:00:15`.
   - **Fix:** Send only the dirty fields (`formState.dirtyFields`). That also removes the dialog's part in finding 1.
   - **If we skip it:** A title edit silently changes the time.

7. **The bookings page loads only the first 100 rooms** (`apps/web/src/views/bookings/bookings-page.tsx:35`) — low [Verified]
   - **What this is:** `listRooms(1, MAX_PAGE_SIZE)` fills both the room select and the room-name lookup.
   - **Problem:** With 101 rooms, the last room (by name) cannot be chosen in the create form or the filter, and its bookings show a raw UUID in the Room column.
   - **Fix:** Fetch the remaining pages while `items.length < total`.
   - **If we skip it:** No problem with the 12 seeded rooms. It breaks quietly as rooms are added.

8. **The idempotency fingerprint hashes the raw strings, not the parsed values** (`apps/booking/src/booking/booking-fingerprint.util.ts:5-7`) — low [Verified]
   - **What this is:** The fingerprint is a SHA-256 of `[roomId, title, email, startsAt, endsAt]` exactly as sent.
   - **Problem:** A client retries with the same key and the same instant written differently (`2030-01-01T10:00:00Z` the first time, `2030-01-01T10:00:00.000Z` after re-serialising). It gets 422 `IDEMPOTENCY_KEY_REUSED` instead of the replay. The web client always sends `toISOString()`, so it is not affected.
   - **Fix:** Hash `startsAt.toISOString()` and `endsAt.toISOString()` (the service already parses them on lines 37-38) and the lower-cased email.
   - **If we skip it:** Only non-web clients that re-serialise are affected.

9. **Idempotency keys and finished BullMQ jobs are never cleaned up** (`apps/booking/src/booking/idempotent-booking.repository.ts:50-55`, `apps/booking/src/booking/confirmation-queue.producer.ts:20-28`) — low [Verified]
   - **What this is:** Nothing deletes `idempotency_keys` rows, and jobs are added without `removeOnComplete` or `removeOnFail` (grep finds none in `apps` or `libs`).
   - **Problem:** Both stores gain one entry per booking for ever. A key reused a year later still replays the year-old booking.
   - **Fix:** Delete keys older than 24 h (a single `DELETE ... WHERE created_at < now() - interval '24 hours'` on a schedule). Add `removeOnComplete: { age: 86400 }` to the job options.
   - **If we skip it:** Harmless at the assumed load. It becomes a slow leak.

10. **The `response_status` column is written but never read** (`libs/backend-common/src/lib/entities/idempotency-key.entity.ts:12-13`, `apps/booking/src/booking/idempotent-booking.repository.ts:53`) — low [Verified]
    - **What this is:** Every key row stores `201`. Grep across `apps` and `libs` finds no reader. The gateway always answers 201 from the route default.
    - **Problem:** It is dead schema: one column, one entity field, one write and two spec fixtures that each change must carry.
    - **Fix:** Drop it from the entity, the migration (not yet shipped) and the specs.
    - **If we skip it:** It is only clutter.

11. **The worker can leave a booking PENDING, or send the email twice, when reporting fails** (`apps/worker/src/confirmation/confirmation.service.ts:18-26`) — low [Judgement]
    - **What this is:** The worker delivers first, then reports over NATS. A failed report throws, and BullMQ retries the job.
    - **Problem:** Delivery succeeds on attempt 1, then the report times out, so attempt 2 sends a second email. If the report fails on attempt 3, no retry is left and the booking stays PENDING with `confirmationAttempts` < 3.
    - **Fix:** Accept at-least-once delivery (it is simulated today), but write that limit down as a `shortcut:` note, or move the report into a separate retried step.
    - **If we skip it:** Rare duplicate or stuck confirmations once a real sender is plugged in.

Left out: about 4 smaller items. These are a spec title that says "six columns" for a seven-column table (`bookings-table.spec.tsx:24`), `room.repository.ts:4` import spacing (lint will flag it), the status literals repeated in the entity CHECK and the migration, and whitespace-only titles being accepted.

**About the clone-finder hits:** `booking.fixture.ts` (Nest entity and DTO builders, plus an `RpcException` unwrapper) and `apps/web/.../booking-test-data.ts` (paged DTO builders for RTL) live in different apps with different test runners. Sharing them would make the web app import backend test code, so this duplication is fine. The only real duplication is finding 5.

**Checked and clean:**
- The 2 `.transaction(` calls are both in repositories (`booking.repository.ts:40`, `idempotent-booking.repository.ts:27`), none in a service.
- All 7 `.query(` calls are parameterised (`$1` with constant SQL) or static DDL in the migration.
- Error mapping across NATS works for every code: `RpcException` → plain object → `isErrorResponse` → HTTP status. This is covered by the gateway spec table at `apps/gateway/src/booking/booking.controller.spec.ts:169-180`.
- Overlap uses an exclusive end, so back-to-back slots are allowed.
- The lock order (key lock, then room lock; the update path takes the room lock only) cannot deadlock.
- The change-3 fix (`skip = (page-1)*limit`) is correct for the last page and for pages beyond the range (empty `items`, correct `total`). The limit is capped at 100 by `PageQueryDto`, and the order is stable because `name` is unique.
- The worker's `attemptsMade + 1` and the stale-report guard (`confirmationAttempts <= attempts`) are correct.

## Strengths

- Both transactions live in repositories. The overlap check is one helper shared by create and update, and it takes the room lock before it reads (`apps/booking/src/booking/booking-overlap.query.ts:9-17`, `apps/booking/src/booking/idempotent-booking.repository.ts:30-57`).
- Repositories return typed outcome unions, and the service maps them to error codes in one `switch` with no exceptions used as control flow (`apps/booking/src/booking/booking.service.ts:74-81`, `:97-110`).
- Recording a confirmation is guarded against stale or out-of-order results by matching only `PENDING` and `attempts <= n` (`apps/booking/src/booking/booking.repository.ts:48-58`).
- `isErrorResponse` was moved from the filter into `libs/backend-common` and reused, not copied (`libs/backend-common/src/lib/errors/error-response.guard.ts:3`, used at `apps/booking/src/booking/room-lookup.client.ts:15` and `apps/worker/src/confirmation/booking.client.ts:22`).
- The gateway spec runs real HTTP with a mocked NATS client and checks every error code end to end (`apps/gateway/src/booking/booking.controller.spec.ts:169-180`).
- The web create form keeps one idempotency key across retries of an unchanged form and drops it on any edit or success (`apps/web/src/views/bookings/booking-create-form.tsx:29-53`).
- The bookings page ignores late responses after a page or filter change, and steps back a page after deleting the last row (`apps/web/src/views/bookings/bookings-page.tsx:43-54`, `:77`).
- The change-3 fix is one line plus a regression table (`apps/room/src/room/room.repository.ts:19`, `apps/room/src/room/room.repository.spec.ts:46-55`).

## Scorecard

| # | Area | Score (1-5) | Reason |
|---|---|:---:|---|
| 1 | Code quality | 4 | Clear names, typed outcomes, consistent with the baseline helpers; one dead column (#10). |
| 2 | Code smells | 4 | Short single-purpose functions, only constraint comments, no magic values; small dead code (#10). |
| 3 | Structure | 5 | Controller → service → repository is respected, transactions sit in repositories, the gateway stays thin and the overlap rule lives in one place. |
| 4 | Duplication | 3 | Shared helpers are reused well, but the create and edit forms copy their fields and rules (#5). |
| 5 | Potential bugs | 3 | No critical bug, but a lost update on partial PATCH (#1), a lost confirmation job (#2), seconds truncation (#6) and fingerprint strictness (#8). |
| 6 | Security | 5 | DTO validation with whitelist, UUID-checked ids and keys, parameterised SQL, no LIKE, no hardcoded config. |
| 7 | Rule compliance | 5 | R1–R11 and the TypeScript/architecture rules pass; no transaction in a service. |
| 8 | Tests | 3 | Broad, and behaviour-level in the gateway and web; but the backend repository specs assert mock call order, there is no Postgres test of the locks (#3), and one spec enshrines the swallowed error (#2). |
| 9 | Maintainability | 4 | A new overlap-style rule has one home. A new field touches entity, migration, DTO, mapper, fingerprint and two copied forms (#5); the missing DB constraint (#4) leaves the rule open to new write paths. |
| 10 | Frontend | 4 | Small components, loading, error and empty states, stale-response guard, labelled controls; seconds truncation (#6), 100-room cap (#7), copied fields (#5). |

**Findings by severity:** critical 0, high 0, medium 5, low 6.

**Verdict:** Healthy. Fix the partial-PATCH stale merge (#1) and re-enqueue on replay (#2) first, then add the Postgres concurrency spec (#3).

**Lean:** -35 lines possible (#5 about -30, #10 about -5).

**Not checked:**
- Build, lint and tests were not run, on instruction.
- No Postgres or Redis was running, so the lock and visibility behaviour was traced by reading, not executed.
- BullMQ and ioredis internals (`attemptsMade` semantics, offline-queue behaviour when Redis is down) were not confirmed in `node_modules`.
- These specs were only skimmed: the booking controller, mapper, time-util and fingerprint specs, and the web spec bodies beyond their test names.
- The kit's `openspec/` documents were not read, so the code was not checked against the kit's own requirements.
