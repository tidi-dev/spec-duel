# Research: Rooms List Shows the Right Rooms on Every Page

**Feature**: `specs/003-fix-rooms-pagination` | **Date**: 2026-11-10

This document is the root-cause analysis asked for by FR-007. It was written before any code was
changed: at the time of writing, `git status` shows only this feature's `specs/` folder as new and no
source file as modified.

Method: the request was traced by reading the code from the page to the database call. The stack was
not started for this analysis; the cause is a deterministic calculation, and its result is worked
out below for every reported observation. The live reproduction is scenario 1 of
[quickstart.md](./quickstart.md).

## Root-cause analysis

### Where the defect is

`apps/room/src/room/room.repository.ts`, line 19, in `RoomRepository.findPage`:

```ts
skip: (query.page - 1) * DEFAULT_PAGE_SIZE,
take: query.limit,
```

The number of rooms to skip is computed with the constant `DEFAULT_PAGE_SIZE` (10, from
`@roombook/contract`) instead of the requested page size `query.limit`. The number of rooms to take
uses `query.limit` correctly. The line has been there since the room list was first added (commit
`3a97c50`).

Nothing else on the path changes the page or the page size:

| Step | File | What it does with `page` and `limit` |
|---|---|---|
| Page | `apps/web/src/views/rooms/rooms-page.tsx` | calls `listRooms(pageIndex + 1, rowsPerPage)` and renders `result.items` as received |
| Web client | `apps/web/src/services/room.service.ts` | sends them as query parameters |
| Gateway | `apps/gateway/src/room/room.controller.ts` | validates them as `PageQueryDto` and forwards them over NATS |
| Room controller | `apps/room/src/room/room.controller.ts` | passes them to the service |
| Room service | `apps/room/src/room/room.service.ts` | passes them to the repository |
| Room repository | `apps/room/src/room/room.repository.ts` | **computes `skip` with the wrong factor** |

### Why it happens

The rooms skipped are `(page − 1) × 10` whatever page size was asked for, where FR-001 requires
`(page − 1) × limit`. The two agree only when `page` is 1 (both are 0) or `limit` is 10.

With the 12 seeded rooms in name order:

| Reported observation | Request | Skipped today | Taken | Result today | Explained |
|---|---|---|---|---|---|
| Page 1 is right at every page size | page 1, any limit | (1 − 1) × 10 = 0 | limit | the first `limit` rooms | the factor is multiplied by 0 |
| Page 2 is right at 10 per page | page 2, limit 10 | (2 − 1) × 10 = 10 | 10 | `Room 11`, `Room 12` | the constant equals the limit |
| Page 2 is wrong at 5 per page | page 2, limit 5 | 10, should be 5 | 5 | not `Room 06`–`Room 10` | the constant differs from the limit |
| Page 2 at 5 per page shows exactly `Room 11` and `Room 12` | page 2, limit 5 | 10 | 5 | the 2 rooms left after the first 10 | 12 − 10 = 2 rooms remain |

Consequences at 5 per page: `Room 06` to `Room 10` are never shown, and page 3 skips 20 rooms and is
empty while the page counter still reports 12 rooms.

### Why the existing tests did not catch it

No test asks the code that computes `skip` for a page after the first at a page size other than 10,
which is the only combination where the wrong and the right formula differ.

| Test | What it checks | Why it passes with the defect |
|---|---|---|
| `apps/room/src/room/room.repository.spec.ts` | `findPage({ page: 1, limit: 10 })` → `skip: 0`; `findPage({ page: 2, limit: 10 })` → `skip: 10` | both cases use the default page size, where `(page − 1) × 10` equals `(page − 1) × limit` |
| `apps/room/src/room/room.service.spec.ts` | the service passes the query to a mocked repository | the repository is replaced, so `skip` is never computed |
| `apps/gateway/src/room/room.controller.spec.ts` | the query is validated and forwarded; its non-default case is `page=1&limit=5` | NATS is mocked; no room is selected |
| `libs/contract/src/lib/dto/page-query.dto.spec.ts` | `page` and `limit` are parsed and range-checked | it has no paging arithmetic |
| `apps/web/src/services/room.service.spec.ts` | the client sends `page` and `limit` | the HTTP client is mocked |
| `apps/web/src/views/rooms/rooms-page.spec.tsx` | choosing 5 per page and going to page 2 requests `(2, 5)` and shows `Room 06` | `listRooms` is replaced by a test helper that slices the rooms correctly itself (`(page − 1) × limit`), so the test shows the page is right and says nothing about the backend |

No automated test runs the room list against a database, and the quickstarts of features 001 and 002
only call `GET /api/rooms` for page 1.

The defect was seen once before: `specs/001-room-bookings/research.md` ("Observation outside this
feature") recorded the same line, and left it because `apps/room` was frozen for that feature.

### The same defect elsewhere

Checked and not present. `apps/booking/src/booking/booking.repository.ts` uses
`skip: (query.page - 1) * query.limit`, and its spec covers page 3 at 5 per page (`skip: 10`).
`RoomRepository.findPage` is the only other paged query. Bookings stay out of scope (FR-009).

## Decisions

### R1. The fix

- **Decision**: In `RoomRepository.findPage`, compute `skip` as `(query.page - 1) * query.limit`, and
  remove the `DEFAULT_PAGE_SIZE` import from that file, which is then unused.
- **Rationale**: It is the formula of FR-001 and the one the bookings list already uses. `take`,
  the ordering, the total and the returned `page` and `limit` are already right, so nothing else
  changes (FR-005, FR-006).
- **Alternatives considered**: computing the offset in `RoomService` — rejected, paging is data
  access and the service only delegates; a shared paging helper for both repositories — rejected, two
  one-line expressions do not justify an abstraction and bookings are out of scope (FR-009).

### R2. The regression test

- **Decision**: Extend `apps/room/src/room/room.repository.spec.ts`, written first and seen to fail:
  1. `findPage({ page: 2, limit: 5 })` calls the database with `skip: 5, take: 5` — the reported
     case (FR-008). Today it is called with `skip: 10`.
  2. A table of further offsets: page 3 at 5 → 10, page 4 at 5 → 15, page 3 at 1 → 2, page 2 at
     12 → 12, page 2 at 100 → 100.
  3. A walk: the mocked `findAndCount` answers from 12 rooms `Room 01`–`Room 12` by applying the
     `skip` and `take` it receives; for each page size 1, 5, 10, 12 and 100, reading pages 1 to the
     last returns all 12 names once, in order (SC-002), and the page after the last is empty with
     `total` 12.
- **Rationale**: The repository is where `skip` is computed, so its spec is the smallest test that
  fails without the fix. The existing spec already mocks `findAndCount`; the walk needs no database
  and no new dependency.
- **Alternatives considered**: a test against a real Postgres — rejected, the repository has no such
  harness and adding one is outside a defect fix; a test in the web or gateway spec — rejected, both
  mock everything below them and could not fail on this defect.

### R3. No change outside the room repository

- **Decision**: `apps/web`, `apps/gateway`, `apps/booking`, `apps/worker`, `libs/contract` and
  `libs/backend-common` are not edited. `room.service.ts` and its spec are not edited.
- **Rationale**: The path table above shows every other step passes `page` and `limit` through
  unchanged; the page renders what the API returns (FR-004 is met by fixing the API). The contract's
  routes, DTOs and constants are correct as they are.
- **Alternatives considered**: changing the mock in `rooms-page.spec.tsx` — rejected, it models a
  correct backend, which is what a page test should assume.

### R4. Proof against the running stack

- **Decision**: SC-001 and User Story 1, scenario 6, are checked by hand with the quickstart: the
  API at 5 per page for pages 1 to 4, and the `/rooms` page.
- **Rationale**: Same approach as features 001 and 002: unit tests with the database mocked, the
  end-to-end path proven in the quickstart.

### R5. Order of work in the change history

- **Decision**: This folder (spec, plan, research and the other planning documents) is committed
  locally before the first source edit; the failing test and the fix follow.
- **Rationale**: SC-003 asks that the analysis predates the code change in the history.

## Open questions

None. No item in the Technical Context needs clarification.
