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

---
(Above: the kit's own proposal.md. Below: its design.md.)

# Design

## Context

See `proposal.md` for the symptom. This document holds the root-cause analysis asked for in the bug report, then the fix.

The analysis comes from reading the code and tests. The bug was not reproduced against a running stack during planning; the arithmetic below reproduces every observation in the report exactly, and task 1.1 confirms it with a failing test before any code is changed.

### Request path

`/rooms` page (`apps/web/src/views/rooms/rooms-page.tsx`) → `listRooms(page, limit)` (`apps/web/src/services/room.service.ts`) → gateway `GET /api/rooms` (`apps/gateway/src/room/room.controller.ts`, validates `PageQueryDto`, forwards over NATS) → room service controller → `RoomService.listRooms` → `RoomRepository.findPage` (`apps/room/src/room/room.repository.ts`).

Every hop up to the repository passes `page` and `limit` through unchanged. The web page sends `page=2&limit=5` correctly, and resets to page 1 when the page size changes.

### Where the fault is

`apps/room/src/room/room.repository.ts`, line 19, in `findPage`:

```ts
skip: (query.page - 1) * DEFAULT_PAGE_SIZE,
take: query.limit,
```

The number of rows to skip is computed from the constant `DEFAULT_PAGE_SIZE` (10, from `@roombook/contract`) instead of the requested `query.limit`. The number of rows to take does use `query.limit`. The two halves of the window disagree whenever `limit` is not 10.

### Why it gives the reported symptoms

| Request | Skip today | Skip expected | Answer today | Expected |
|---|---|---|---|---|
| any `limit`, `page=1` | 0 | 0 | right | right |
| `page=2&limit=10` | 10 | 10 | `Room 11`, `Room 12` | same |
| `page=2&limit=5` | 10 | 5 | `Room 11`, `Room 12` | `Room 06` to `Room 10` |
| `page=3&limit=5` | 20 | 10 | no rooms | `Room 11`, `Room 12` |

- Page 1 is right at every page size because `(1 - 1) × anything` is 0.
- The default page size is right on every page because then `limit` equals the constant.
- With `limit` below 10, rooms are skipped and unreachable (`Room 06` to `Room 10` at 5 per page). With `limit` above 10, pages overlap (at `limit=20`, page 2 would start at the 11th room instead of the 21st). The second case cannot be seen with the 12 seeded rooms on the `/rooms` page, which offers only 5 and 10, but the API allows `limit` up to 100.

### Why the existing tests did not catch it

- `apps/room/src/room/room.repository.spec.ts` is the only test that asserts `skip`. Both paging cases use `limit: 10`, the one value at which the faulty and the correct formula give the same number (`skip: 0` for page 1, `skip: 10` for page 2). No case combines `page > 1` with a non-default `limit`.
- `apps/room/src/room/room.service.spec.ts` and `apps/room/src/room/room.controller.spec.ts` replace the layer below with a mock and only check that the query is passed on.
- `apps/gateway/src/room/room.controller.spec.ts` mocks the NATS client. Its one `limit=5` case uses `page=1` and only checks what is forwarded.
- `apps/web/src/views/rooms/rooms-page.spec.tsx` does exercise "5 per page, next page" and expects `Room 06`, but it mocks `listRooms` with an in-test helper (`pageOf`) that slices correctly. It proves the page asks for `(2, 5)` and renders what comes back; it cannot see what the backend would answer.
- No test runs the room list against a real database, so nothing checks the answered rows end to end.

For comparison, `apps/booking/src/booking/booking.repository.ts` computes `(query.page - 1) * query.limit`, and its spec has a `page 2, limit 5 → skip 5` case. The bookings list is not affected.

## Goals / Non-Goals

**Goals:**
- The room list window follows the requested `limit` on every page (see `specs/rooms-api/spec.md`).
- A regression test that fails on today's code and pins the formula at page sizes below, at and above the default.

**Non-Goals:**
- No shared paging helper across the booking and room repositories. Two one-line expressions do not justify an abstraction.
- No database-backed or end-to-end test harness. The repository has none today and adding one is a larger decision than this fix.
- No change to `apps/web`, the gateway, the contract library or the bookings list.
- No change to how an out-of-range page is answered (empty `items`, 200).

## Decisions

**1. Fix the expression in place: `skip: (query.page - 1) * query.limit`.**
This is the whole fix and matches the bookings repository. The `DEFAULT_PAGE_SIZE` import in `room.repository.ts` becomes unused and is removed (lint would flag it). Alternative considered: compute the offset in `RoomService` or in a contract helper. Rejected: the offset is a data-access detail, the repository already owns it, and a helper for one multiplication is over-engineering.

**2. Put the regression test in `room.repository.spec.ts`, next to the existing paging cases.**
The fault is in the repository, and this is the only existing test layer that sees `skip`. The test calls `findPage` and asserts the options given to `findAndCount`, in the same style as the existing cases. It is table-driven (`it.each`) over `page`/`limit` pairs chosen so that the faulty formula gives a different number in each:

| `page` | `limit` | expected `skip` | faulty `skip` |
|---|---|---|---|
| 2 | 5 | 5 | 10 |
| 3 | 5 | 10 | 20 |
| 2 | 1 | 1 | 10 |
| 2 | 100 | 100 | 10 |

Each case also asserts `take` equals `limit`. Alternative considered: strengthen the web page test. Rejected: it mocks the API client, so it cannot fail for a backend fault whatever it asserts. Alternative considered: an integration test with a real Postgres. Rejected under Non-Goals; the live check in task 2.2 covers the end-to-end acceptance once.

**3. Keep the existing two paging tests unchanged.**
They stay valid after the fix (`limit: 10`) and guard the default path. Test expectations that are already correct are not rewritten.

**4. Introduce a `rooms-api` spec instead of opting out of specs.**
The fix changes externally observable answers, and no spec states what the room list must answer. Recording the paging rule as a requirement gives future changes something to be checked against. The spec only describes behaviour that the contract and the gateway already implement (name order, `page`/`limit` bounds, answer shape); nothing new is invented.

## Risks / Trade-offs

- [The regression test asserts the query options, not the rows a database returns] → That is the layer where the fault lives and how the repository is already tested; task 2.2 checks the real answer once against the running stack with the seeded rooms.
- [A client may have adapted to the wrong offsets] → The only client is `apps/web`, which sends standard `page`/`limit` and expects the standard window. No adaptation exists to break.
- [Ordering by name alone could be unstable across pages] → Not possible: room names are unique (`UQ_rooms_name`), so name order is a total order.

## Migration Plan

Code-only change in the room service. Deploy by restarting it; roll back by reverting the commit. No data or contract migration.
