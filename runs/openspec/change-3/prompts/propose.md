/opsx:propose # Bug report: the rooms page shows the wrong rooms on page 2

## What happens

On the `/rooms` page, choose 5 rooms per page and go to page 2. The page shows `Room 11` and `Room 12`.

The same through the API: `GET /api/rooms?page=2&limit=5` returns `Room 11` and `Room 12`.

## What should happen

With 12 rooms ordered by name and 5 per page, page 2 shows `Room 06` to `Room 10`, and page 3 shows `Room 11` and `Room 12`. Paging must be right for every page and every allowed page size.

## What is known

- Page 1 looks right at every page size.
- With the default 10 per page, page 2 is right (`Room 11`, `Room 12`).

## What is asked

1. Analyse the bug and write up the cause before changing any code: where it is, why it happens, and why the existing tests did not catch it.
2. Fix it.
3. Add a regression test that fails without the fix.

## Done when

- `GET /api/rooms?page=2&limit=5` returns `Room 06` to `Room 10`.
- `pnpm run build`, `pnpm run lint` and `pnpm run test` pass.
