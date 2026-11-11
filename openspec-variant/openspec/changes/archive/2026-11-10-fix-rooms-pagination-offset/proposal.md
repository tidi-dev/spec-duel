# Proposal

## Why

The room list answers the wrong rooms for every page after the first whenever the page size is not 10: `GET /api/rooms?page=2&limit=5` answers `Room 11` and `Room 12` instead of `Room 06` to `Room 10`, and the `/rooms` page shows the same. The rooms `Room 06` to `Room 10` cannot be reached at all with 5 per page, so the page size selector on `/rooms` is broken.

## What Changes

- Fix the room list so that page `p` with page size `n` starts after the first `(p - 1) × n` rooms in name order, for every page and every allowed page size. Today the start is computed from the default page size (10) instead of the requested one.
- Add a regression test at the layer that owns the bug (the room service's repository), covering a page size other than the default. It must fail on the current code.
- Write down the room list behaviour as a spec. No spec covers rooms today, which is part of why the wrong behaviour had no stated expectation to be checked against.
- No change to the request or answer shape, to the validation rules, to the web app code or to the bookings list (its paging is already correct).

Root-cause analysis (where the fault is, why it happens, why the tests missed it) is in `design.md`.

## Capabilities

### New Capabilities
- `rooms-api`: the HTTP contract for listing meeting rooms on the gateway: name order, paging by `page` and `limit`, and the paged answer shape.

### Modified Capabilities

None. `bookings-page` uses the room list only as page 1 with the maximum page size, which already works, and its requirements do not change.

## Impact

- Code: `apps/room/src/room/room.repository.ts` (one expression) and `apps/room/src/room/room.repository.spec.ts` (new cases).
- API: `GET /api/rooms` answers different, now correct, items for `page > 1` when `limit` is not 10. Requests with `page = 1` or `limit = 10` answer exactly what they answer today. Not a breaking change: the shape is unchanged and the old answers were wrong.
- Web: `/rooms` shows the right rows with 5 per page without any frontend change.
- No dependency, schema, migration, contract or configuration change.
