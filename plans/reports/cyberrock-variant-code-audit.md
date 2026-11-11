# Code audit: cyberrock-variant (kit-written code, `baseline-v1..HEAD`)

Scope: the 84 files changed since the tag `baseline-v1` under `apps/` and `libs/` (45 source files, 39 spec files). In depth: `apps/booking/src/booking/`, `apps/gateway/src/booking/`, `apps/worker/src/confirmation/`, `apps/web/src/views/bookings/`, `apps/web/src/services/booking.service.ts`, the two new entities and two new migrations in `libs/backend-common/src/lib/`, and the one-line fix in `apps/room/src/room/room.repository.ts`. Unchanged baseline code was read only where the new code calls it (`ExceptionHelper`, `NatsRequestUtil`, `RpcExceptionFilter`, `configure-gateway-app.ts`, the room service, `api-client.ts`). `libs/contract` is a fixed contract and is not scored. Requirements were taken from the three briefs and `project-rules.md`.

**What this code does:** It adds meeting-room bookings to roombook. The gateway validates HTTP requests and forwards them over NATS to the `booking` service, which stores bookings in Postgres, makes `POST /api/bookings` idempotent (one booking per `Idempotency-Key`), refuses two bookings of one room that overlap in time, and puts one confirmation job per booking on a BullMQ queue. The `worker` service "sends" the confirmation (simulated) and reports the result back over NATS. The web app gets a `/bookings` page with a table, a room filter, a create form and edit/delete. The third change fixes the room list paging (`skip` used the default page size instead of the requested one).

**Assumed load:** a small office tool. Tens of users, a few bookings per minute at peak, thousands to tens of thousands of bookings in total. Each service may run as more than one process (NATS queue groups, several BullMQ workers), with one Postgres and one Redis. Deploys and short Redis or service restarts happen while the system is in use.

## Findings

No critical or high finding. The two hard guarantees (one booking per key, no overlap in a room) hold under concurrent use as far as the code can be traced. The medium findings are about what happens around failures.

### Should fix

1. **A booking can be stored while the client is told it failed, and its confirmation is then never sent** (`apps/booking/src/booking/booking.service.ts:58-65`, `apps/booking/src/booking/confirmation.producer.ts:36-42`) — medium [Verified]
   - **What this is:** Create commits the booking and the key in Postgres first, then adds the confirmation job to Redis. If the add fails or takes more than 2 seconds, the service answers 503.
   - **Problem:** Redis is unreachable for a few seconds, or the process dies between the commit and the add. The booking exists and holds the room, the client sees 503 (or a timeout), and no job exists. Only a repeat of the exact same request with the same key repairs it (the replay adds the job again). If the user gives up or edits the form, the booking stays `PENDING` with 0 attempts for ever. Nothing in the system looks for such bookings.
   - **Fix:** Add a small sweep in the booking service that re-adds the job for bookings still `PENDING` with 0 attempts after a minute (the fixed job id keeps this safe). That is less code than an outbox table and closes both the crash and the Redis case.
   - **If we skip it:** After every Redis hiccup there are bookings that block a room, were reported as failed, and never get a confirmation.

2. **Transport errors use up the three send attempts, so a booking can stay `PENDING` for ever** (`apps/worker/src/confirmation/confirmation.processor.ts:39-78`, `apps/booking/src/booking/confirmation.producer.ts:31-33`) — medium [Verified]
   - **What this is:** The worker asks the booking service for the booking, "sends", and reports the result, all over NATS. Any NATS error fails the job run, and BullMQ counts it as one of the 3 attempts.
   - **Problem:** The booking service is unreachable for three runs in a row (about 3 seconds if NATS answers "nobody listening" at once, about 18 seconds with the 5-second timeout), for example during a restart. The job fails for good. The booking stays `PENDING` (never `FAILED`), with 0 or a stale attempt count. Because failed jobs are kept and the job id is fixed, the replay path of finding 1 cannot add a new job either. One failed read also shifts the count: a plain address then ends as `SENT` with 2 attempts, not 1 as the brief says.
   - **Fix:** When the read or the report fails for a transport reason, put the job back without spending an attempt (BullMQ: `job.moveToDelayed(...)` then throw `DelayedError`). Only a failed send should count.
   - **If we skip it:** Each restart of the booking service can strand the confirmations that were in flight. `confirmation.processor.spec.ts:122-141` pins the current behaviour, so the suite stays green.

3. **The booking service refuses valid ISO 8601 UTC times that the contract accepts** (`apps/booking/src/booking/booking-instant.ts:1-2`, `apps/booking/src/booking/booking-input.ts:19-21`) — medium [Verified]
   - **What this is:** The gateway checks times with `@IsISO8601({ strict: true })`. The booking service then parses them again with its own stricter pattern: seconds are required and at most three fraction digits are allowed.
   - **Problem:** `"2030-01-07T09:00Z"` and `"2030-01-07T09:00:00.123456Z"` pass the gateway and get 400 `BAD_REQUEST.VALIDATION` from the service. The second form is what Python, Go and Java clients send by default. The brief only says "ISO 8601 in UTC". The same rule is applied differently in two places.
   - **Fix:** Widen the pattern: optional seconds, any number of fraction digits cut to milliseconds. Keep the "must carry `Z` or an offset" rule, which is the part that protects against time-zone mistakes. Update `booking-input.spec.ts:69,100` and `booking-instant.spec.ts:55-78`, which assert the rejection.
   - **If we skip it:** Non-browser clients get a 400 on every create until someone finds out that microseconds are not allowed.

4. **The only real proofs of the two concurrency guarantees are skipped silently when `DB_HOST` is not set** (`apps/booking/src/booking/booking-overlap.concurrency.int.spec.ts:11`, `apps/booking/src/booking/booking-repositories.int.spec.ts:11`, and line 11 or 5 of the four other `*.int.spec.ts` files) — medium [Verified]
   - **What this is:** Six integration specs run against a real Postgres. Each starts with `process.env['DB_HOST'] ? describe : describe.skip`.
   - **Problem:** Run `pnpm run test` in a shell or CI job without the database variables. All six files are skipped and the run is green. What is left are unit specs that mock TypeORM and only check which calls were made, so a wrong lock statement or a wrong overlap query would pass. "Ten identical requests create one booking" and "two overlapping creates, one wins" are then unproven.
   - **Fix:** Fail instead of skip when the run is meant to be complete (for example when `CI` is set), or move the six files to their own `test:int` target that the done-check runs with the stack up. One shared helper, a few lines.
   - **If we skip it:** A later change can break the locking and still pass build, lint and test.

### Nice to have

5. **After an error with an unknown outcome the list is not reloaded** (`apps/web/src/views/bookings/create-booking-form.tsx:42-51`) — low [Verified]
   - **What this is:** On any create error the form shows the message and returns. The list is reloaded only on success.
   - **Problem:** The request times out or gets a 503, but the server did store the booking (finding 1). The user changes the title and submits again. The form now sends a new key and gets "The room is already booked in that time span". The table still does not show the user's own first booking, so the message makes no sense to them.
   - **Fix:** Call `onCreated()` (the refetch) in the error path too, at least for errors that are not a final 4xx answer.
   - **If we skip it:** Confusing overlap errors after a network problem.

6. **A title can pass validation and still be too long for the column, which answers 500** (`apps/booking/src/booking/booking-input.ts:26-35`, `libs/backend-common/src/lib/entities/booking.entity.ts:18`, `apps/booking/src/booking/booking.repository.ts:33-42`) — low [Judgement]
   - **What this is:** The service checks that a title can be stored (it rejects a NUL character). Length is left to the gateway's `@Length(1, 120)`; the column is `varchar(120)`.
   - **Problem:** validator.js does not count emoji variation selectors (U+FE0F) in `isLength`; Postgres does. A title of 120 times "❤️" counts as 120 at the gateway and 240 in Postgres. The insert fails with "value too long", which is not mapped, so the API answers 500. Not run here: this rests on how validator.js counts, taken from its source as I know it. Only reachable through the API; the web form counts UTF-16 units and blocks it.
   - **Fix:** In `requireStorableTitle`, also reject `[...title].length > BOOKING_TITLE_MAX_LENGTH` with the existing 400.
   - **If we skip it:** A rare 500 with no error code for bad input.

7. **Business rules run inside the repository, and failures are signalled in two different ways** (`apps/booking/src/booking/booking.repository.ts:84-91`, `apps/booking/src/booking/booking-overlap.ts:14-27`, `apps/booking/src/booking/booking.service.ts:77-80`) — low [Judgement]
   - **What this is:** For an update, "end after start", "what counts as a change" and "no overlap" are all decided inside `BookingRepository.update`, which also throws the 400 and 409 `RpcException`s. `BookingService.updateBooking` is one pass-through line. For create, the repository returns an outcome (`created`, `replayed`, `reused`, `in-progress`) and the service maps it, but overlap is thrown from inside.
   - **Problem:** The project rule says services hold business rules. To add an update rule (say "not in the past") you edit code that runs inside the repository transaction, and its unit test has to mock the `EntityManager` (`booking.repository.update.spec.ts:94-106`). The rule functions are pure and in their own files, which limits the damage.
   - **Fix:** Let the repositories return `overlap` and `invalid-span` as outcome kinds, like the other create outcomes, and map all of them to errors in the service.
   - **If we skip it:** No wrong behaviour. The next rule is harder to place and to test.

8. **About 400 lines of unit specs only check which TypeORM calls were made** (`apps/booking/src/booking/booking.repository.spec.ts:55-109`, `booking.repository.update.spec.ts:56-106`, `booking.repository.update.overlap.spec.ts`, `booking-overlap.spec.ts`, `booking.controller.spec.ts`) — low [Judgement]
   - **What this is:** These specs mock the repository or the `EntityManager` and assert call arguments and call order (`existsBy` called with `LessThan(...)`, `query` called before `save`).
   - **Problem:** They pass when the SQL is wrong and fail on a harmless refactor (for example replacing `existsBy` with a query builder). The integration specs already prove the same behaviour for real. `booking.controller.spec.ts` (100 lines) tests six one-line delegations.
   - **Fix:** Once finding 4 is fixed, delete the call-shape cases and keep the unit cases that the database cannot easily trigger (constraint-name mapping, pass-through of unknown errors).
   - **If we skip it:** A 2.27 spec-to-source ratio where a good share of the weight proves nothing and slows every refactor.

9. **The integration specs copy the same setup four times** (`apps/booking/src/booking/booking-overlap.int.spec.ts:30-101`, `booking-overlap.concurrency.int.spec.ts:21-100`, `booking-repositories.int.spec.ts:34-68`, `booking-repositories.update.int.spec.ts:24-67`) — low [Verified]
   - **What this is:** Each file builds its own `DataSource` from the same five variables and repeats `commandFor`, `create`, `removeRows`, `errorOf`, `expectOverlap` and the `OVERLAP` constant.
   - **Problem:** A change to the connection, to the entity list or to the overlap message must be made in four to six files.
   - **Fix:** One `booking-int-spec-database.ts` helper next to them (it is also the natural place for the gate of finding 4).
   - **If we skip it:** About 100 duplicated lines that must change together.

10. **The confirmation column goes stale** (`apps/web/src/views/bookings/use-bookings-list.ts:17-39`, `apps/web/src/views/bookings/bookings-page.tsx:54-58`) — low [Verified]
    - **What this is:** The list is fetched on page, filter, create, edit and delete. There is no timer and no refresh button.
    - **Problem:** Create a booking. The list reloads at once and shows `PENDING`. The worker sets `SENT` a moment later (3 seconds later for a retry address), but the row keeps saying `PENDING` until the user does something else or reloads the browser.
    - **Fix:** Refetch once or twice after a create while a row is `PENDING`, or add a "Refresh" button that calls the existing `refetch`.
    - **If we skip it:** Users read a wrong status for most new bookings.

11. **A delete error stays on screen** (`apps/web/src/views/bookings/bookings-page.tsx:25-37,58`) — low [Verified]
    - **What this is:** `deleteError` is cleared only at the start of the next delete.
    - **Problem:** A delete fails with 404 (someone else removed the row). The list reloads and is correct, but the red alert stays while the user pages, filters, creates and edits.
    - **Fix:** Clear it in `handleSaved` and when the list is refetched for another reason, or make the alert closable.
    - **If we skip it:** An old error message next to current data.

12. **Delete is one click with no question and no undo** (`apps/web/src/views/bookings/bookings-table.tsx:54-62`, `apps/web/src/views/bookings/bookings-page.tsx:27-37`) — low [Judgement]
    - **What this is:** "Delete" sits next to "Edit" in every row and calls the API directly.
    - **Problem:** A mis-click removes the booking for good; the room slot is free for others at once.
    - **Fix:** A `window.confirm` with the booking title before the call.
    - **If we skip it:** Lost bookings by accident.

13. **The fingerprint lists the fields by hand** (`apps/booking/src/booking/booking-fingerprint.ts:7-13`) — low [Judgement]
    - **What this is:** The request fingerprint hashes five named fields of the normalised booking.
    - **Problem:** Add a sixth field to the booking (say `notes`) and forget this file. Two requests with one key that differ only in `notes` then get the same fingerprint, and the second is answered as a replay instead of 422. No spec fails.
    - **Fix:** Hash every entry of the normalised object in sorted key order, with dates as epoch milliseconds.
    - **If we skip it:** A silent hole the next time a field is added. Adding a field already touches about twelve places.

14. **Finished and failed jobs are kept in Redis for ever** (`apps/booking/src/booking/confirmation.producer.ts:31-33`) — low [Judgement]
    - **What this is:** `removeOnComplete: false` and `removeOnFail: false`, with a comment that the kept job id is what blocks a second job on a replay.
    - **Problem:** One job record per booking stays in Redis memory with no limit. The comment gives the reason but no limit. Fine at the assumed load; at a million bookings it is on the order of a gigabyte.
    - **Fix:** Skip the enqueue for a replay instead (a replay never needs a new job once finding 1 has a sweep), then let BullMQ remove completed jobs by age.
    - **If we skip it:** Redis memory only grows.

15. **`IdempotencyKeyPipe` is not used as a pipe** (`apps/gateway/src/booking/idempotency-key.pipe.ts:7-24`) — low [Verified]
    - **What this is:** An `@Injectable()` class that implements `PipeTransform`, created with `new` inside a parameter decorator. It is not registered in any module and never runs as a pipe.
    - **Problem:** The file name and the class say "pipe"; the thing in use is the `@IdempotencyKey()` decorator. A reader looks for where the pipe is bound and finds nothing.
    - **Fix:** Make it a plain function `requireIdempotencyKey(value)` in `idempotency-key.decorator.ts`. About 10 lines less.
    - **If we skip it:** A small naming trap.

16. **The gateway service receives the HTTP response object** (`apps/gateway/src/booking/booking.controller.ts:32-38`, `apps/gateway/src/booking/booking.service.ts:23-33`) — low [Judgement]
    - **What this is:** The controller passes `ServerResponse` into `BookingService.createBooking`, which sets the `Idempotency-Replayed` header.
    - **Problem:** The service now knows about HTTP, and its spec has to fake `setHeader`. This was done to keep the controller free of an `if`.
    - **Fix:** Return `CreateBookingResultDto` from the service and set the header in a small interceptor on the route.
    - **If we skip it:** Nothing breaks; the layer boundary is a little blurred.

17. **The room list for the filter and the form is loaded ten rooms at a time** (`apps/web/src/views/bookings/use-all-rooms.ts:7-14`) — low [Verified]
    - **What this is:** `loadEveryRoom` pages through `/rooms` with `DEFAULT_PAGE_SIZE` (10), one request after the other.
    - **Problem:** With the 12 seeded rooms the page makes two requests in a row before the room select is filled. The contract allows 100 per page.
    - **Fix:** Use `MAX_PAGE_SIZE`.
    - **If we skip it:** One extra round trip per page load now, more as rooms are added.

18. **One spec file is over the 200-line limit** (`apps/booking/src/booking/idempotent-booking.repository.spec.ts`, 201 lines) — low [Verified]
    - **What this is:** The project rule caps every code file at 200 lines.
    - **Problem:** 201 lines.
    - **Fix:** Finding 8 removes several of its cases.
    - **If we skip it:** A rule check keeps flagging it.

Smaller points left out (8): `CONFIRMATION_ENQUEUE_TIMEOUT_MS` is exported but used in one file; two formatting slips (`requireSpan =(`, `startsAtRef =ref`); no index for `ORDER BY starts_at` (fine at the assumed load); times are typed as UTC only (labelled, a product choice); the list starts at the oldest booking and has no date filter (the contract has none); no success notice when a new booking lands on another page; `ReturnType<typeof userEvent.setup>` as a parameter type in a spec; a replay also needs Redis and answers 503 when it is down.

## Strengths
- Overlap is stopped twice: a per-room transaction lock with a half-open check, and a Postgres exclusion constraint behind it, both mapped to the same 409 (`apps/booking/src/booking/booking-overlap.ts:17-27`, `libs/backend-common/src/lib/entities/booking.entity.ts:10`, `apps/booking/src/booking/booking.repository.ts:33-42`).
- Key claim, booking insert and stored response are one transaction; a second request with the same key gets "in progress" at once from a try-lock instead of waiting (`apps/booking/src/booking/idempotent-booking.repository.ts:31-53`).
- No network call happens inside a database transaction: the room lookup is before it, the queue add after it (`apps/booking/src/booking/booking.service.ts:56-64`).
- Updates lock the row, check the merged span and write only the columns that changed, so a title edit and a confirmation result that arrive together both survive (`apps/booking/src/booking/booking.repository.ts:77-96`).
- Confirmation results can only move forward: never away from `SENT`, never to a lower attempt count (`apps/booking/src/booking/booking.repository.ts:98-108`).
- The guarantees are tested against a real Postgres with real concurrency: ten identical creates, two overlapping creates, two updates into each other (`apps/booking/src/booking/booking-repositories.int.spec.ts:70-83`, `apps/booking/src/booking/booking-overlap.concurrency.int.spec.ts:129-157`).
- The gateway spec goes over real HTTP with the real validation pipe and error filter, not through mocked controllers (`apps/gateway/src/booking/booking.controller.spec.ts:45-55`).
- The web client keeps the idempotency key only while the outcome is unknown (network error, 5xx, in progress), sends only the fields an edit changed, and handles late responses and an emptied last page (`apps/web/src/views/bookings/use-idempotency-key.ts:13-29`, `apps/web/src/views/bookings/edit-booking-dialog.tsx:25-29`, `apps/web/src/views/bookings/use-bookings-list.ts:22-27`).

## Scorecard

| # | Area | Score (1-5) | Reason |
|---|---|:---:|---|
| 1 | Code quality | 4 | Small, well-named functions; typed outcomes; no `any`, no `interface`. A few over-careful branches and two formatting slips. |
| 2 | Code smells | 4 | A pipe that is not a pipe, an HTTP response inside a service, exceptions thrown from repository helpers (15, 16, 7). |
| 3 | Structure | 4 | Clear controller → service → repository in all three services; rules live in pure modules but are run and turned into errors inside the repository (7). |
| 4 | Duplication | 4 | Source is 2.1% duplicated; span and overlap rules are shared by create and update. Spec setup is copied four times (9). |
| 5 | Potential bugs | 3 | No race found in the core guarantees. Real gaps around failures: lost confirmations (1, 2) and valid times refused (3). |
| 6 | Security | 4 | All HTTP input validated and whitelisted, UUID checks on ids and key, no LIKE, no hardcoded config. One unmapped 500 on a crafted title (6); NATS payloads are trusted. |
| 7 | Rule compliance | 4 | R1–R11 hold. One file at 201 lines (18), rules run in the repository (7), an unused export. |
| 8 | Tests | 4 | Behaviour tests on every layer and real-database concurrency specs. They can be skipped silently (4), a good share is call-shape checking (8), and three specs pin the behaviours of findings 1–3. |
| 9 | Maintainability | 4 | One place per booking rule, three places per page. A new field touches about twelve places, one of them silently (13); the spec weight slows refactors. |
| 10 | Frontend | 4 | Clean split into page, hooks, table, form, dialog and schema; loading, empty and error states; edit sends a diff. Stale status, sticky delete error, no delete question (10, 11, 12, 5). |

**Findings by severity:** critical 0, high 0, medium 4, low 14.

**Verdict:** Healthy core: the two hard guarantees are enforced in Postgres and tested against a real database; fix the two ways a confirmation can be lost for good (1, 2) first, then make the integration specs impossible to skip (4).

**Lean:** -510 lines possible (finding 8: about -400 spec lines; finding 9: about -100 spec lines; finding 15: about -10 source lines).

**Not checked:**
- Nothing was run: no build, no lint, no tests, no Docker, no stack. Every finding was traced by reading the code.
- Whether the six integration specs ran in the operator's green test run (they skip without `DB_HOST`).
- Library internals (`node_modules` was off limits): BullMQ's handling of a duplicate job id and of `DelayedError`, how the Redis client behaves while Redis is down, how validator.js counts length, how Nest reports "no NATS subscriber". These are taken from knowledge of the libraries; finding 6 depends on one of them and is tagged accordingly.
- No flow was exercised across processes (gateway → NATS → booking → Postgres → Redis → worker), and the page was not opened in a browser.
- Spec files: the integration specs and the repository, producer, processor and idempotency-key specs were read in full; the other backend specs and most web specs were read by test title plus samples.
- Unchanged baseline code beyond what the new code calls. `libs/contract` was not scored. Authentication does not exist in the baseline and is not in the briefs, so it was not assessed.
