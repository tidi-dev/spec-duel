# Data Model: Rooms List Shows the Right Rooms on Every Page

**Feature**: `specs/003-fix-rooms-pagination` | **Date**: 2026-11-10

This change corrects a calculation, not data. No table, column, constraint, index, migration, seed
row, DTO or constant is added or changed.

## Room — table `rooms` (unchanged)

| Field | Use in this change |
|---|---|
| `id` | returned as is |
| `name` | the ordering key of the list, ascending |
| `capacity` | returned as is |

Twelve rooms, `Room 01` to `Room 12`, are seeded by the existing migration and are the verification
data.

## Page query — `PageQueryDto` (unchanged)

| Field | Rule | Default |
|---|---|---|
| `page` | integer, 1 or more | 1 |
| `limit` | integer, 1 to `MAX_PAGE_SIZE` (100) | `DEFAULT_PAGE_SIZE` (10) |

## Page of rooms — `PagedRoomsDto` (shape unchanged)

| Field | Value |
|---|---|
| `items` | the rooms at positions `(page − 1) × limit + 1` to `page × limit` of all rooms ordered by `name` ascending, or as many as exist (FR-001) |
| `total` | the number of all rooms, whatever the page |
| `page` | the requested page |
| `limit` | the requested page size |

### The corrected rule

| | Rooms skipped before `items` | Rooms taken |
|---|---|---|
| Before | `(page − 1) × DEFAULT_PAGE_SIZE` | `limit` |
| After | `(page − 1) × limit` | `limit` |

Derived properties (FR-003): at a fixed `limit`, the pages 1 to `ceil(total / limit)` are disjoint
and together hold every room once; any later page has no items.

## State transitions

None.

## Migrations

None.
