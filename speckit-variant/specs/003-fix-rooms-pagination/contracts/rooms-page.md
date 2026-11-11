# Contract: `/rooms` Page

**Feature**: `specs/003-fix-rooms-pagination` | **Date**: 2026-11-10

No file under `apps/web` changes. The page already requests the selected page and rows-per-page and
shows the rooms it receives; its content becomes right because the API's answer does
([gateway-http-api.md](./gateway-http-api.md)).

## Behaviour

| Element | Behaviour | Status |
|---|---|---|
| Rows per page | options 5 and 10, default 10; choosing one returns to page 1 | unchanged |
| Request | `listRooms(selected page, rows per page)` on load and on every change | unchanged |
| Table "Rooms" | one row per room received, in the order received; "No rooms found." when none | unchanged |
| Pagination counter | from `total` | unchanged |
| Loading bar, error alert | as today | unchanged |

## What the user sees with the 12 seeded rooms

| Selection | Before | After |
|---|---|---|
| 10 per page, page 1 | `Room 01`–`Room 10` | same |
| 10 per page, page 2 | `Room 11`, `Room 12` | same |
| 5 per page, page 1 | `Room 01`–`Room 05` | same |
| 5 per page, page 2 | `Room 11`, `Room 12` | `Room 06`–`Room 10` |
| 5 per page, page 3 | "No rooms found." | `Room 11`, `Room 12` |
