<!-- Copy of the kit's own write-up, unedited. Source: cyberrock-variant/cr/changes/archive/fix-rooms-page-offset/change.md at tag change-3-done -->
# fix-rooms-page-offset: Rooms list skips by the default page size instead of the requested limit

Tier: fix
Why this tier: `GET /api/rooms?page=2&limit=5` returns `Room 11`, `Room 12`; the contract's `page`/`limit` mean page 2 is rows 6 to 10. Nothing new is asked.

## Cause
- Where: `apps/room/src/room/room.repository.ts:19`, `skip: (query.page - 1) * DEFAULT_PAGE_SIZE`, while line 20 takes `query.limit`.
- Why: the offset is computed with the constant 10, not the requested limit. Page 2 with limit 5 skips 10 rows and takes 5, so it returns rows 11 to 12. Correct is `skip = (page - 1) * limit`, as `apps/booking/src/booking/booking.repository.ts:53` does.
- Why it hides: page 1 skips 0 at any limit, and at limit 10 the constant equals the limit.
- Why the tests missed it: `room.repository.spec.ts` only calls `findPage` with `limit: 10` (pages 1 and 2), where both formulas give the same skip. The gateway spec uses `limit=5` only with `page=1`. `rooms-page.spec.tsx` mocks `listRooms` with a correct slicing fake, so it only proves the request is `(2, 5)`. No integration spec reads rooms from the real database.
- Assumption: no spec in `cr/specs` covers the rooms list, so the correct behaviour is added as ROOM-001.

## Requirements
### ADDED rooms
#### ROOM-001: Rooms list paging
The system SHALL answer the rooms list ordered by name, skipping `(page - 1) * limit` rooms and returning at most `limit` rooms, with the total count.
- Scenario: reported case. WHEN 12 rooms exist and `GET /api/rooms?page=2&limit=5` THEN items are `Room 06` to `Room 10`, total 12
- Scenario: last page. WHEN 12 rooms exist and `page=3&limit=5` THEN items are `Room 11`, `Room 12`
- Scenario: past the end. WHEN 12 rooms exist and `page=4&limit=5` THEN items are empty, total 12
- Scenario: default size. WHEN 12 rooms exist and `page=2&limit=10` THEN items are `Room 11`, `Room 12`

## Tasks
- [x] T01 @be [regression, ROOM-001] Failing spec: a fake `findAndCount` slices 12 named rooms by `skip`/`take`; assert the items for limit 5 pages 1 to 4, limit 10 page 2, limit 1 page 12, limit 100 page 1 | apps/room/src/room/room.repository.spec.ts
- [x] T02 @be [regression, ROOM-001] Compute the offset from `query.limit` and drop the unused `DEFAULT_PAGE_SIZE` import | apps/room/src/room/room.repository.ts
- [x] T03 @main [verify] Build, lint, test
