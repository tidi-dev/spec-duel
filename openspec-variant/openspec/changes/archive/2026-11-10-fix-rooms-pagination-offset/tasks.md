# Tasks

## 1. Regression test and fix in the room repository

- [x] 1.1 In `apps/room/src/room/room.repository.spec.ts`, add an `it.each` case set for `findPage` with the `page`/`limit` pairs from design.md decision 2 (`2/5 → skip 5`, `3/5 → skip 10`, `2/1 → skip 1`, `2/100 → skip 100`), each asserting `findAndCount` is called with that `skip`, `take` equal to `limit` and `order: { name: 'ASC' }`; leave the two existing paging tests unchanged. Verify by running `pnpm nx test room` before touching the repository: the four new cases fail (received `skip` 10, 20, 10, 10) and every other test passes.
- [x] 1.2 In `apps/room/src/room/room.repository.ts`, change the `findPage` offset to `(query.page - 1) * query.limit` and remove the now unused `DEFAULT_PAGE_SIZE` import. Verify with `pnpm nx test room`: all tests pass, including the four from 1.1.

## 2. Integration checks

- [x] 2.1 Run `pnpm run build`, `pnpm run lint` and `pnpm run test` from the repository root and verify all three exit with code 0.
- [ ] 2.2 Start the stack with `pnpm run stack:up` (it prints the gateway port; do not read `.env`) and request `GET /api/rooms` on the gateway with `page=2&limit=5`, `page=3&limit=5` and `page=2&limit=10`. Verify the item names are `Room 06` to `Room 10`, then `Room 11` and `Room 12`, then `Room 11` and `Room 12`, each with `total` 12; stop the stack with `pnpm run stack:down`. If Docker is not available, record that this check was not run instead of marking it done.
