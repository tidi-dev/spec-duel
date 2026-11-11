# Quickstart: Validating Meeting-Room Bookings

**Feature**: `specs/001-room-bookings` | **Date**: 2026-11-10

A run guide that proves the feature end to end. Shapes and error codes are in
[contracts/gateway-http-api.md](./contracts/gateway-http-api.md); stored data and state rules are in
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

All three must pass (FR-035). The unit tests cover the services, repositories, gateway and page with
their neighbours mocked; they do not need the stack.

Scope check (FR-033, SC-007) — must print nothing:

```bash
git status --porcelain -- libs/contract apps/room apps/web/src/views/rooms apps/web/src/pages/rooms apps/web/src/services/room.service.ts
git diff --stat main -- libs/contract apps/room apps/web/src/views/rooms apps/web/src/pages/rooms apps/web/src/services/room.service.ts
```

## Start the stack

```bash
pnpm run stack:reset    # fresh data, runs the two new migrations, builds and starts all five apps
```

`stack:reset` and `stack:up` load the local configuration themselves. For the commands below, the
shell needs the gateway and web ports, by name `GATEWAY_PORT` and `WEB_PORT`:

```bash
API="http://localhost:${GATEWAY_PORT}/api"
ROOM_ID=$(curl -s "$API/rooms?limit=1" | jq -r '.items[0].id')
```

Health, unchanged — each answers `{ "status": "ok", ... }`:

```bash
curl -s "$API/health/booking"; curl -s "$API/health/room"; curl -s "$API/health/worker"
```

## Scenarios

Each scenario states the expected outcome. `-i` shows the status line and headers.

### 1. Create, list, read, update, delete (User Story 1)

```bash
KEY=$(uuidgen)
BODY=$(jq -n --arg r "$ROOM_ID" '{roomId:$r,title:"Planning",organizerEmail:"qa.user+s1@example.com",startsAt:"2030-01-07T09:00:00.000Z",endsAt:"2030-01-07T10:00:00.000Z"}')
curl -si -X POST "$API/bookings" -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY"
```

Expected: `201`; `confirmationStatus` `PENDING`, `confirmationAttempts` 0; no `Idempotency-Replayed`
header. Keep the returned `id` as `BOOKING_ID`.

| Request | Expected |
|---|---|
| `GET $API/bookings` | 200, `{ items, total, page: 1, limit: 10 }`, ordered by `startsAt` |
| `GET $API/bookings?roomId=$ROOM_ID` | 200, only that room's bookings in `items` and `total` |
| `GET $API/bookings/$BOOKING_ID` | 200, the booking |
| `PATCH $API/bookings/$BOOKING_ID` with `{"endsAt":"2030-01-07T11:00:00.000Z"}` | 200, new `endsAt`, later `updatedAt` |
| `PATCH` with `{}` | 200, booking unchanged |
| `PATCH` with `{"endsAt":"2030-01-07T08:00:00.000Z"}` | 400 `BAD_REQUEST.VALIDATION`; booking unchanged |
| `PATCH` with `{"roomId":"…"}` or `{"organizerEmail":"…"}` | 400 `BAD_REQUEST.VALIDATION` |
| `GET $API/bookings/not-a-uuid` | 400 `BAD_REQUEST.VALIDATION` |
| `GET $API/bookings?limit=101` | 400 `BAD_REQUEST.VALIDATION` |
| `DELETE $API/bookings/$BOOKING_ID` | 204 |
| `GET $API/bookings/$BOOKING_ID` afterwards | 404 `NOT_FOUND.BOOKING` |

### 2. Create validation (User Story 1)

Each with a fresh key:

| Body change | Expected |
|---|---|
| `title` removed | 400 `BAD_REQUEST.VALIDATION` |
| `endsAt` equal to `startsAt` | 400 `BAD_REQUEST.VALIDATION` |
| `roomId` a random UUID | 404 `NOT_FOUND.ROOM` |

After each, `GET $API/bookings` shows no new booking.

### 3. Idempotency key header (User Story 2)

| Request | Expected |
|---|---|
| `POST` without `Idempotency-Key` | 400 `BAD_REQUEST.IDEMPOTENCY_KEY` |
| `POST` with `Idempotency-Key: abc` | 400 `BAD_REQUEST.IDEMPOTENCY_KEY` |
| `POST` with `Idempotency-Key: abc` and an invalid body | 400 `BAD_REQUEST.IDEMPOTENCY_KEY` (the key is checked first) |

### 4. Replay and reuse (User Story 2)

Send the request from scenario 1 twice with one new key.

- Second answer: `201`, the same body byte for byte, header `Idempotency-Replayed: true`.
- `GET $API/bookings` shows one booking for that title, not two.
- `PATCH` the booking's title, then send the same request a third time: the answer still carries the
  original title (replay is a snapshot). Delete the booking and repeat: same answer.
- Same key with a different `title`: 422 `UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED`.

### 5. A failed create leaves the key usable (User Story 2)

With one new key: send a body whose `roomId` is a random UUID (404 `NOT_FOUND.ROOM`), then the same
key with the real `ROOM_ID`. Expected: 201 and a booking, not 422.

### 6. Same request at the same moment (User Story 2)

```bash
KEY=$(uuidgen)
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/bookings" -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY" &
done; wait
```

Expected: every line is `201` or `409`, at least one is `201`, and the list shows exactly one booking
for that request.

### 7. Confirmation outcomes (User Story 3)

Create three bookings with organizer addresses `qa.user+ok@example.com`, `qa.user@retry.example` and
`qa.user@bounce.example`. Wait 10 seconds, then read each:

| Address | Expected |
|---|---|
| `…@example.com` | `SENT`, 1 attempt |
| `…@retry.example` | `SENT`, 3 attempts |
| `…@bounce.example` | `FAILED`, 3 attempts |

Reading the retry booking during the wait may show `PENDING` with 1 or 2 attempts.

### 8. Deleted before confirmation finishes (User Story 3)

Create a booking for `qa.user@bounce.example` and delete it at once. Expected: `tmp/logs/worker.log`
shows no further retries for that booking and no error loop; `tmp/logs/booking.log` shows no error for
the late report.

### 9. Queue unreachable (edge case)

Stop Redis (`docker compose stop redis`), create a booking, start Redis again
(`docker compose start redis`). Expected: the create answers `201` within the gateway's timeout and the
booking stays `PENDING` with 0 attempts. This also verifies the open point in research R6.

### 10. Bookings page (User Story 4)

Open `http://localhost:${WEB_PORT}/bookings`.

| Step | Expected |
|---|---|
| Look at the navigation | a "Bookings" link next to "Rooms"; `/rooms` works as before |
| Page loads | the table shows title, room name, organizer, start, end, confirmation |
| Choose a room in the filter | only that room's bookings; "All rooms" shows all again |
| Choose a room with no bookings | "No bookings found." |
| Fill and submit the form | the new booking appears in the table; the form is cleared |
| Submit with the end before the start | a field error; no request is sent |
| Edit a row's title and end, save | the row shows the new values |
| Delete a row, confirm | the row disappears |
| Stop the `booking` service, reload | an error alert with the API's message "No service answered booking:listBookings" |
| Stop the gateway, submit the form, start the gateway, submit again without editing | the browser's network panel shows the same `Idempotency-Key` on both requests, and one booking is created |
| After that answered submit, submit a new booking | a different `Idempotency-Key` |

## Clean up

```bash
pnpm run stack:down
```

The bookings created above are synthetic and live only in the local database; `pnpm run stack:reset`
removes them.
