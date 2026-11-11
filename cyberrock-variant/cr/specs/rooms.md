# rooms

## ROOM-001: Rooms list paging
The system SHALL answer the rooms list ordered by name, skipping `(page - 1) * limit` rooms and returning at most `limit` rooms, with the total count.
- Scenario: reported case. WHEN 12 rooms exist and `GET /api/rooms?page=2&limit=5` THEN items are `Room 06` to `Room 10`, total 12
- Scenario: last page. WHEN 12 rooms exist and `page=3&limit=5` THEN items are `Room 11`, `Room 12`
- Scenario: past the end. WHEN 12 rooms exist and `page=4&limit=5` THEN items are empty, total 12
- Scenario: default size. WHEN 12 rooms exist and `page=2&limit=10` THEN items are `Room 11`, `Room 12`
