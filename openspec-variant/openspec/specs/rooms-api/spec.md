# rooms-api Specification

## Purpose

Defines the HTTP contract for listing meeting rooms on the gateway: the order of the rooms, how `page` and `limit` select a slice of them, and the paged answer clients and the web app rely on.

## Requirements

### Requirement: Room list answer
The system SHALL answer `GET /api/rooms` with 200 and a body holding `items`, `total`, `page` and `limit`. Each item SHALL be a room with `id`, `name` and `capacity`. `items` SHALL be in ascending `name` order, `total` SHALL be the number of all rooms regardless of paging, and `page` and `limit` SHALL echo the values used for the answer.

#### Scenario: Defaults
- **WHEN** a client requests `GET /api/rooms` with 12 rooms named `Room 01` to `Room 12`
- **THEN** the answer is 200 with `items` `Room 01` to `Room 10` in that order, `total` 12, `page` 1 and `limit` 10

#### Scenario: Total does not depend on the page
- **WHEN** a client requests `GET /api/rooms?page=3&limit=5` with 12 rooms
- **THEN** `total` is 12, `page` is 3 and `limit` is 5

### Requirement: Room list paging
The system SHALL select the items of a room list answer by `page` (integer, at least 1, default 1) and `limit` (integer from 1 to 100, default 10): the answer SHALL hold the rooms at positions `(page - 1) × limit + 1` to `page × limit` of the name-ordered list, for every allowed `page` and `limit`. A page that reaches past the last room SHALL hold only the rooms that exist, and a page that starts past the last room SHALL hold no items.

#### Scenario: Second page with a non-default page size
- **WHEN** a client requests `GET /api/rooms?page=2&limit=5` with 12 rooms named `Room 01` to `Room 12`
- **THEN** `items` are `Room 06`, `Room 07`, `Room 08`, `Room 09` and `Room 10`

#### Scenario: Last partial page with a non-default page size
- **WHEN** a client requests `GET /api/rooms?page=3&limit=5` with the same 12 rooms
- **THEN** `items` are `Room 11` and `Room 12`

#### Scenario: Second page with the default page size
- **WHEN** a client requests `GET /api/rooms?page=2` with the same 12 rooms
- **THEN** `items` are `Room 11` and `Room 12`

#### Scenario: Page size larger than the default
- **WHEN** a client requests `GET /api/rooms?page=2&limit=100` with the same 12 rooms
- **THEN** `items` is empty and `total` is 12

#### Scenario: Pages do not overlap or leave gaps
- **WHEN** a client reads pages 1, 2 and 3 with `limit=5` over the same 12 rooms
- **THEN** the three answers together hold each of the 12 rooms exactly once, in name order

#### Scenario: Page or limit out of range
- **WHEN** a client requests `GET /api/rooms` with `page=0`, `limit=0`, `limit=101` or a value that is not an integer
- **THEN** the answer is 400 with `BAD_REQUEST.VALIDATION`
