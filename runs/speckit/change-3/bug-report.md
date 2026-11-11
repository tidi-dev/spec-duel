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

---
(Above: the kit's own research.md. Below: its spec.md.)

# Feature Specification: Rooms List Shows the Right Rooms on Every Page

**Feature Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/003-fix-rooms-pagination`)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Bug report: the rooms page shows the wrong rooms on page 2." On the `/rooms` page with 5 rooms per page, page 2 shows `Room 11` and `Room 12`; `GET /api/rooms?page=2&limit=5` returns the same. Expected: with 12 rooms ordered by name and 5 per page, page 2 shows `Room 06` to `Room 10` and page 3 shows `Room 11` and `Room 12`; paging must be right for every page and every allowed page size. Known: page 1 looks right at every page size, and page 2 is right at the default 10 per page. Asked: (1) analyse the bug and write up the cause before changing any code — where it is, why it happens, why the existing tests did not catch it; (2) fix it; (3) add a regression test that fails without the fix. Done when `GET /api/rooms?page=2&limit=5` returns `Room 06` to `Room 10` and `pnpm run build`, `pnpm run lint` and `pnpm run test` pass.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse every room at any page size (Priority: P1)

Someone looking for a meeting room opens the rooms list, picks how many rooms they want per page and walks through the pages. Each page shows the next rooms in name order, so that after the last page they have seen every room exactly once. Today, at any page size other than 10, the pages after the first show the wrong rooms: some rooms are never shown and the last rooms appear too early.

**Why this priority**: This is the reported defect. Rooms that never appear cannot be found or booked from the list, and the list contradicts its own page counter.

**Independent Test**: With the 12 seeded rooms, request the rooms list at 5 per page and walk pages 1 to 3, on the `/rooms` page and through `GET /api/rooms`; compare the rooms on each page with the expected slice of the name-ordered list.

**Acceptance Scenarios**:

1. **Given** 12 rooms named `Room 01` to `Room 12`, **When** page 2 is requested with 5 rooms per page, **Then** the result is `Room 06`, `Room 07`, `Room 08`, `Room 09`, `Room 10`, in that order.
2. **Given** the same 12 rooms, **When** page 3 is requested with 5 rooms per page, **Then** the result is `Room 11` and `Room 12`.
3. **Given** the same 12 rooms, **When** page 1 is requested with 5 rooms per page, **Then** the result is `Room 01` to `Room 05` (unchanged).
4. **Given** the same 12 rooms, **When** page 2 is requested with the default 10 rooms per page, **Then** the result is `Room 11` and `Room 12` (unchanged).
5. **Given** the same 12 rooms and any allowed page size, **When** every page from 1 to the last is read in turn, **Then** each room appears exactly once and the rooms are in name order across the pages.
6. **Given** the `/rooms` page, **When** the user chooses 5 rooms per page and goes to page 2, **Then** the table shows `Room 06` to `Room 10`.

---

### User Story 2 - The cause is written down before the fix (Priority: P2)

The owner of the system wants to know why the defect happened and why it shipped unnoticed, before any code is changed. A written analysis names where the defect is, why it produces the observed rooms, and why the existing tests passed in spite of it.

**Why this priority**: The fix is small, but the test gap that let it through is the lasting risk; the analysis is what makes the regression test target the right thing.

**Independent Test**: Read the analysis and check that it explains all four reported observations (page 1 right at every size, page 2 right at 10 per page, page 2 wrong at 5 per page, page 2 at 5 per page showing exactly `Room 11` and `Room 12`), and that the change history shows it was written before the code change.

**Acceptance Scenarios**:

1. **Given** the bug report, **When** the analysis is finished, **Then** it states where the defect is, why it happens, and why the existing tests did not catch it, and no code has been changed yet.
2. **Given** the analysis, **When** its explanation is checked against the four reported observations, **Then** it accounts for each of them.

---

### User Story 3 - The defect cannot come back unnoticed (Priority: P3)

A developer who later changes the rooms list is told by the automated tests if paging breaks again for a page size other than the default.

**Why this priority**: Without it the same defect can return silently, as the existing tests only exercise the default page size beyond page 1.

**Independent Test**: Run the new regression test against the code as it is today and see it fail; run it again after the fix and see it pass.

**Acceptance Scenarios**:

1. **Given** the code before the fix, **When** the regression test runs, **Then** it fails.
2. **Given** the code after the fix, **When** the full test suite runs, **Then** the regression test and all existing tests pass.

---

### Edge Cases

- A page past the last one (for example page 4 at 5 per page): the result has no rooms and still reports the total of 12, as today.
- The last page is partly filled (page 3 at 5 per page holds 2 rooms).
- The page size equals or exceeds the number of rooms (12 or more per page): page 1 holds all rooms and page 2 is empty.
- The smallest allowed page size (1 per page): page N holds exactly the Nth room in name order.
- No page or page size is given: page 1 with 10 rooms per page, as today.
- A page or page size outside the allowed range is still rejected as invalid input, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For page number P and page size L, the rooms list MUST return the rooms at positions (P − 1) × L + 1 through P × L of all rooms ordered by name ascending, or as many of them as exist.
- **FR-002**: FR-001 MUST hold for every allowed page number (1 and above) and every allowed page size (1 to 100), not only the default page size.
- **FR-003**: Reading every page in turn at a fixed page size MUST show each room exactly once, with no room skipped or repeated.
- **FR-004**: The `/rooms` page MUST show the rooms defined by FR-001 for the page and rows-per-page the user selected.
- **FR-005**: The result MUST keep reporting the total number of rooms, the requested page and the requested page size, as today.
- **FR-006**: Everything else about the rooms list MUST stay as it is: ordering by name, the default of page 1 with 10 per page, rejection of out-of-range input, and the shape of the response.
- **FR-007**: A written root-cause analysis MUST exist before any code is changed, covering where the defect is, why it happens, and why the existing tests did not catch it.
- **FR-008**: A regression test MUST be added that fails against the code before the fix and passes after it, and that exercises a page beyond the first at a page size other than the default.
- **FR-009**: The fix MUST be limited to the defect: no new routes, fields, error codes or dependencies, and no change to bookings.

### Key Entities

- **Room**: a bookable meeting room; the list is ordered by its name. Twelve rooms, `Room 01` to `Room 12`, are seeded.
- **Page of rooms**: one slice of the name-ordered room list, together with the total number of rooms, the page number and the page size it was requested with.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Requesting page 2 at 5 rooms per page returns exactly `Room 06` to `Room 10`, through the API and on the `/rooms` page.
- **SC-002**: For the 12 seeded rooms and each of the page sizes 1, 5, 10, 12 and 100, walking all pages yields all 12 rooms exactly once in name order: 0 rooms missing, 0 duplicated.
- **SC-003**: The root-cause analysis explains 4 out of 4 reported observations and predates the code change in the change history.
- **SC-004**: The regression test fails before the fix and passes after it.
- **SC-005**: The project's three quality gates (build, lint, test) all pass with the fix in place.

## Assumptions

- "Allowed page size" means the range the system already accepts: 1 to 100, default 10. Page numbers start at 1. These limits are not changed.
- A page past the last one returns an empty list with the correct total rather than an error; this is today's behaviour and is kept.
- Room names are unique and sort as text, so `Room 01` to `Room 12` have one well-defined order.
- The bookings list is out of scope: the report concerns rooms only. If the analysis finds the same defect elsewhere, it is recorded in the analysis and not fixed in this change.
- The `/rooms` page shows whatever the API returns for the selected page and page size; if the analysis confirms this, the frontend needs no change, only the service behind the API.
- The root-cause analysis is written during planning as the feature's research document (`specs/003-fix-rooms-pagination/research.md`), before the implementation step; this specification does not state the cause.
- Verification uses the 12 seeded rooms; no data migration or new seed data is needed.
