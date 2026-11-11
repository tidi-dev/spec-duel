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
