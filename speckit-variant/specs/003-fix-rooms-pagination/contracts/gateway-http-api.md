# Contract: Gateway HTTP API — `GET /api/rooms`

**Feature**: `specs/003-fix-rooms-pagination` | **Date**: 2026-11-10

The route, its parameters, its response shape and its errors are unchanged. This document states the
paging rule the route is meant to follow and which answers change because the implementation now
follows it. Nothing is added to `@roombook/contract`.

## Request

`GET /api/rooms?page=<page>&limit=<limit>`

| Parameter | Rule | Default |
|---|---|---|
| `page` | integer, 1 or more | 1 |
| `limit` | integer, 1 to 100 | 10 |

Unknown parameters are dropped. A value outside its rule is answered 400 `BAD_REQUEST.VALIDATION`,
as today.

## Response — 200, `PagedRoomsDto`

```json
{ "items": [{ "id": "<uuid>", "name": "Room 06", "capacity": 12 }], "total": 12, "page": 2, "limit": 5 }
```

- `items`: positions `(page − 1) × limit + 1` to `page × limit` of all rooms ordered by `name`
  ascending, or as many as exist; empty for a page after the last.
- `total`, `page`, `limit`: as today.

## Answers with the 12 seeded rooms

| Request | `items` before | `items` after |
|---|---|---|
| no parameters | `Room 01`–`Room 10` | same |
| `page=2` | `Room 11`, `Room 12` | same |
| `page=1&limit=5` | `Room 01`–`Room 05` | same |
| `page=2&limit=5` | `Room 11`, `Room 12` | `Room 06`–`Room 10` |
| `page=3&limit=5` | none | `Room 11`, `Room 12` |
| `page=4&limit=5` | none | none |
| `page=3&limit=1` | none | `Room 03` |
| `page=2&limit=12` | `Room 11`, `Room 12` | none |
| `page=2&limit=100` | `Room 11`, `Room 12` | none |

`total` is 12 in every row.

## Message pattern

`RoomPatternEnum.LIST` with a `PageQueryDto` payload answers the same `PagedRoomsDto`; the table
above applies to it as well.

## Unchanged

Every other route, `RoomPatternEnum.FIND_BY_ID`, all error codes and all DTO classes.
