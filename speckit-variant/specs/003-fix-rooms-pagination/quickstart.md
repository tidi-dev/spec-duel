# Quickstart: Validating the Rooms Paging Fix

**Feature**: `specs/003-fix-rooms-pagination` | **Date**: 2026-11-10

A run guide that proves the change end to end. Expected answers are in
[contracts/gateway-http-api.md](./contracts/gateway-http-api.md) and
[contracts/rooms-page.md](./contracts/rooms-page.md); the rule is in
[data-model.md](./data-model.md); the cause is in [research.md](./research.md).

## Prerequisites

- Node 22 or newer, pnpm, Docker (see `docs/local-setup.md`).
- `curl` and `jq` for the HTTP scenarios.

## The regression test fails first (SC-004)

With the new cases added to `apps/room/src/room/room.repository.spec.ts` and the repository not yet
changed:

```bash
pnpm exec nx test room
```

Expected: the new cases fail (for page 2 at 5 per page the database is asked for `skip: 10` where
`skip: 5` is expected); the cases that existed before still pass. After the fix the same command
passes.

## Automated gates

```bash
pnpm run build
pnpm run lint
pnpm run test
```

All three must pass (SC-005).

Scope check (FR-009):

```bash
git status --porcelain -- apps libs package.json
```

Expected: exactly two modified files, `apps/room/src/room/room.repository.ts` and
`apps/room/src/room/room.repository.spec.ts`.

Order check (SC-003):

```bash
git log --oneline -- specs/003-fix-rooms-pagination/research.md apps/room/src/room/room.repository.ts
```

Expected: the commit that adds `research.md` is older than the commit that changes the repository.

## Start the stack

```bash
pnpm run stack:reset    # fresh data: the 12 seeded rooms
```

The shell needs the gateway and web ports, by name `GATEWAY_PORT` and `WEB_PORT`:

```bash
API="http://localhost:${GATEWAY_PORT}/api"
names() { curl -s "$API/rooms?$1" | jq -c '{names: [.items[].name], total, page, limit}'; }
```

## Scenarios

### 1. The reported case (SC-001)

```bash
names 'page=2&limit=5'
```

Expected: `Room 06`, `Room 07`, `Room 08`, `Room 09`, `Room 10`; `total` 12, `page` 2, `limit` 5.
Before the fix the same command shows `Room 11` and `Room 12`.

### 2. Every page at 5 per page

| Command | Expected names |
|---|---|
| `names 'page=1&limit=5'` | `Room 01`–`Room 05` |
| `names 'page=3&limit=5'` | `Room 11`, `Room 12` |
| `names 'page=4&limit=5'` | none, `total` 12 |

### 3. Unchanged answers

| Command | Expected |
|---|---|
| `names ''` | `Room 01`–`Room 10`, `page` 1, `limit` 10 |
| `names 'page=2'` | `Room 11`, `Room 12` |
| `curl -s -o /dev/null -w '%{http_code}\n' "$API/rooms?page=0"` | 400 |
| `curl -s -o /dev/null -w '%{http_code}\n' "$API/rooms?limit=101"` | 400 |

### 4. Each room once at every page size (SC-002)

```bash
for limit in 1 5 10 12 100; do
  pages=$(( (12 + limit - 1) / limit ))
  for page in $(seq 1 "$pages"); do curl -s "$API/rooms?page=$page&limit=$limit" | jq -r '.items[].name'; done > "/tmp/rooms-$limit.txt"
  sort -c "/tmp/rooms-$limit.txt" && echo "limit $limit: $(sort -u "/tmp/rooms-$limit.txt" | wc -l | tr -d ' ') distinct of $(wc -l < "/tmp/rooms-$limit.txt" | tr -d ' ') rows"
done
```

Expected for each of the five page sizes: `12 distinct of 12 rows`, and no "disorder" message from
`sort -c`.

### 5. The `/rooms` page (User Story 1, scenario 6)

Open `http://localhost:${WEB_PORT}/rooms`.

| Step | Expected |
|---|---|
| Page loads | `Room 01`–`Room 10`, "1–10 of 12" |
| Next page | `Room 11`, `Room 12` |
| Choose 5 rows per page | back on page 1: `Room 01`–`Room 05` |
| Next page | `Room 06`–`Room 10`, "6–10 of 12" |
| Next page | `Room 11`, `Room 12`, "11–12 of 12" |

## Stop

```bash
pnpm run stack:down
rm -f /tmp/rooms-*.txt
```
