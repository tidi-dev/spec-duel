# Quickstart: Validating the Overlap Rule

**Feature**: `specs/002-prevent-booking-overlap` | **Date**: 2026-11-10

A run guide that proves the change end to end. Answers and codes are in
[contracts/gateway-http-api.md](./contracts/gateway-http-api.md); page behaviour is in
[contracts/bookings-page.md](./contracts/bookings-page.md); the rule and its outcomes are in
[data-model.md](./data-model.md).

## Prerequisites

- Node 22 or newer, pnpm, Docker (see `docs/local-setup.md`).
- `curl`, `jq` and `uuidgen` for the HTTP scenarios.

## Automated gates

```bash
pnpm run build
pnpm run lint
pnpm run test
```

All three must pass (FR-025).

Scope check (FR-015, FR-021, FR-022, SC-007):

```bash
git status --porcelain -- apps/room apps/web/src/views/rooms apps/web/src/pages/rooms apps/web/src/services/room.service.ts libs/backend-common/src/lib/database
git diff --stat -- libs/contract
```

The first must print nothing. The second must show one file, `error-code.enum.ts`, with one added
line.

## Start the stack

```bash
pnpm run stack:reset    # fresh data: no stored bookings overlap when the change is first used
```

The shell needs the gateway and web ports, by name `GATEWAY_PORT` and `WEB_PORT`:

```bash
API="http://localhost:${GATEWAY_PORT}/api"
ROOM_R=$(curl -s "$API/rooms?limit=2" | jq -r '.items[0].id')
ROOM_S=$(curl -s "$API/rooms?limit=2" | jq -r '.items[1].id')

book() {  # book <roomId> <start> <end> [key] → prints the status and the body
  jq -n --arg r "$1" --arg s "$2" --arg e "$3" \
    '{roomId:$r,title:"Overlap check",organizerEmail:"qa.user+overlap@example.com",startsAt:$s,endsAt:$e}' |
  curl -s -w '\n%{http_code}\n' -X POST "$API/bookings" -H 'Content-Type: application/json' \
    -H "Idempotency-Key: ${4:-$(uuidgen)}" -d @-
}
```

## Scenarios

All times are on 2031-03-03, UTC. `D=2031-03-03T`.

### 1. Create (User Story 1)

Start with `book $ROOM_R ${D}10:00:00.000Z ${D}11:00:00.000Z` → 201. Keep its `id` as `A`.

| Request | Expected |
|---|---|
| room R, 10:30–11:30 | 409 `CONFLICT.BOOKING_OVERLAP`, a `message` saying the room is already booked |
| room R, 10:00–11:00 | 409 `CONFLICT.BOOKING_OVERLAP` |
| room R, 10:15–10:45 | 409 `CONFLICT.BOOKING_OVERLAP` |
| room R, 09:00–12:00 | 409 `CONFLICT.BOOKING_OVERLAP` |
| room R, 10:59:59.999–12:00 | 409 `CONFLICT.BOOKING_OVERLAP` |
| room R, 11:00–12:00 | 201 (touching at the end) |
| room R, 09:00–10:00 | 201 (touching at the start) |
| room S, 10:00–11:00 | 201 (another room) |

`GET $API/bookings?roomId=$ROOM_R` then shows three bookings (09–10, 10–11, 11–12), none overlapping.

Deleted bookings block nothing: `DELETE $API/bookings/$A`, then room R, 10:00–11:00 → 201.

### 2. Order of checks on create (FR-008)

Each would also overlap the 10:00–11:00 booking of room R:

| Request | Expected |
|---|---|
| no `Idempotency-Key` | 400 `BAD_REQUEST.IDEMPOTENCY_KEY` |
| `title` removed | 400 `BAD_REQUEST.VALIDATION` |
| `endsAt` equal to `startsAt` | 400 `BAD_REQUEST.VALIDATION` |
| `roomId` a random UUID | 404 `NOT_FOUND.ROOM` |

### 3. A rejected create and its key (User Story 1, scenarios 7–10)

```bash
KEY=$(uuidgen)
book $ROOM_R ${D}10:30:00.000Z ${D}11:30:00.000Z $KEY   # 409 CONFLICT.BOOKING_OVERLAP
book $ROOM_R ${D}10:30:00.000Z ${D}11:30:00.000Z $KEY   # 409 again; add -i to see no Idempotency-Replayed header
book $ROOM_R ${D}14:00:00.000Z ${D}15:00:00.000Z $KEY   # 201: the key was never stored, so no 422
book $ROOM_R ${D}14:00:00.000Z ${D}15:00:00.000Z $KEY   # 201 replayed, header Idempotency-Replayed: true
```

After the first two, the list shows no booking for 10:30–11:30.

### 4. Update (User Story 2)

On a fresh `pnpm run stack:reset`, create in room R: `A` 10:00–11:00 and `B` 12:00–13:00; in room
S: `C` 10:00–11:00.

| `PATCH` | Expected |
|---|---|
| `B` with `{"startsAt":"…T10:30:00.000Z"}` | 409 `CONFLICT.BOOKING_OVERLAP`; `GET` shows `B` unchanged |
| `A` with `{"endsAt":"…T12:30:00.000Z"}` | 409 `CONFLICT.BOOKING_OVERLAP`; `A` unchanged |
| `A` with `{"endsAt":"…T12:00:00.000Z"}` | 200 (now ends when `B` starts) |
| `A` with `{"title":"Renamed"}` | 200 |
| `A` with `{"startsAt":"…T10:15:00.000Z","endsAt":"…T10:45:00.000Z"}` | 200 (inside its own span) |
| `A` with `{"startsAt":"…T10:30:00.000Z","endsAt":"…T11:30:00.000Z"}` | 200 (overlaps only its own previous span) |
| `A` with `{}` | 200, unchanged |
| `C` with `{"startsAt":"…T12:00:00.000Z","endsAt":"…T13:00:00.000Z"}` | 200 (room S; `B` is in room R) |
| `B` with `{"endsAt":"…T11:00:00.000Z"}` | 400 `BAD_REQUEST.VALIDATION` (invalid pair wins) |
| a random UUID with `{"startsAt":"…T10:30:00.000Z"}` | 404 `NOT_FOUND.BOOKING` |

### 5. Two creates at the same moment (User Story 3, SC-003)

One hundred rounds, each on its own day so rounds do not affect each other:

```bash
for i in $(seq 1 100); do
  DAY=$(date -u -j -v+"${i}"d -f '%Y-%m-%d' 2031-06-01 '+%Y-%m-%d' 2>/dev/null || date -u -d "2031-06-01 +${i} day" '+%Y-%m-%d')
  ( book $ROOM_R ${DAY}T10:00:00.000Z ${DAY}T11:00:00.000Z | tail -1 & \
    book $ROOM_R ${DAY}T10:30:00.000Z ${DAY}T11:30:00.000Z | tail -1 & wait ) | sort | tr '\n' ' '; echo
done | sort | uniq -c
```

Expected: one line, `100 201 409`.

Then:

| Check | Expected |
|---|---|
| `curl -s "$API/bookings?roomId=$ROOM_R&limit=100" \| jq '.total'` (after a fresh reset) | 100 — one booking per round |
| the same bookings read 10 seconds later | every one `SENT` with 1 attempt: one confirmation job per stored booking |
| `tmp/logs/worker.log` | no job for a booking that does not exist |

A rejected request has no booking id, so no job id can exist for it; with BullMQ's default key
prefix, `docker compose exec redis redis-cli ZCARD bull:booking-confirmation:completed` equals the
number of bookings created since the reset.

Variations, a few rounds each:

| Two simultaneous creates | Expected |
|---|---|
| room R and room S, same span | `201 201` |
| room R, 10:00–11:00 and 11:00–12:00 | `201 201` |
| the same key and body twice | one booking; answers are 201 and either a replayed 201 or 409 `CONFLICT.IDEMPOTENCY_IN_PROGRESS` — never `CONFLICT.BOOKING_OVERLAP` |

### 6. An update racing with a create (FR-013)

With `A` 10:00–11:00 in room R and 11:00–12:00 free, send at the same moment a `PATCH` of `A` with
`{"endsAt":"…T11:30:00.000Z"}` and a create for room R 11:00–12:00; repeat about 20 times, restoring
the starting state between rounds. Expected every round: exactly one of the two succeeds, the other
is 409 `CONFLICT.BOOKING_OVERLAP`, and the room's bookings never overlap.

### 7. Bookings page (User Story 4)

Open `http://localhost:${WEB_PORT}/bookings` with one booking of room R, 10:00–11:00 local time.

| Step | Expected |
|---|---|
| Fill the create form for room R, 10:30–11:30, submit | the API's message appears inside the form; all five fields keep their values; the table is unchanged |
| Change the times to a free span, submit | the message disappears, the form is cleared, the new booking is in the table; the network panel shows a different `Idempotency-Key` on the two requests |
| Create a second booking of room R, 12:00–13:00; edit it to start at 10:30, save | the message appears inside the edit dialog; the dialog stays open with the typed values; the row behind it shows the stored values |
| Change the start back to a free time, save | the dialog closes and the row shows the new values |
| Submit a create with the end before the start | the field error, as before; no request |

### 8. Nothing else changed (FR-020, SC-006)

Run scenarios 1 to 10 of `specs/001-room-bookings/quickstart.md` on a fresh reset, using a different
time span for each booking it creates in the same room. Every expected outcome there still holds.

## Clean up

```bash
pnpm run stack:down
```

The bookings created above are synthetic and live only in the local database; `pnpm run stack:reset`
removes them.
