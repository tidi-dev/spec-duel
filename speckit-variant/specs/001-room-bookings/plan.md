# Implementation Plan: Meeting-Room Bookings

**Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/001-room-bookings`) | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-room-bookings/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add bookings to roombook in four parts, all on the existing stack and the existing shared contract:

1. **Bookings API** — five routes under `/api/bookings` on the gateway, which validates and forwards
   over NATS; the `booking` service owns the rules and two new tables.
2. **Idempotent create** — the key is checked by a gateway guard; the `booking` repository claims the
   key and inserts the booking in one transaction, using two transaction-scoped advisory locks to
   answer "in progress" (409) and "key reused" (422) without a stored in-progress state.
3. **Confirmation job** — the `booking` service enqueues one BullMQ job per created booking; the
   `worker` reads the booking over NATS, runs a simulated sender and reports each attempt; the
   `booking` service records it with one conditional update.
4. **Bookings page** — `/bookings` in `apps/web` with a table, room filter, create form, edit and
   delete dialogs, and an idempotency key that survives only a network error.

Design decisions and their reasons are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 or newer

**Primary Dependencies**: NestJS 11 (HTTP gateway, NATS microservices), TypeORM 0.3, BullMQ 5 with `@nestjs/bullmq`, class-validator / class-transformer, Next.js 15 (pages router) with React 18 and MUI 5, react-hook-form with yup, axios, uuid — all already installed; no dependency is added

**Storage**: PostgreSQL 15 (two new tables: `bookings`, `idempotency_keys`); Redis 7.2 for the `booking-confirmation` queue

**Testing**: Jest 29 through Nx (`pnpm run test`); `@nestjs/testing` with mocked neighbours for the backend, Testing Library with the service layer mocked for the web page

**Target Platform**: Node services and a browser frontend, run locally through `pnpm run stack:up` (Docker for Postgres, Redis and NATS)

**Project Type**: Web application in an Nx monorepo — HTTP gateway, NATS services, queue worker, Next.js frontend

**Performance Goals**: every booking reaches its final confirmation state within 10 seconds of creation (SC-004); no throughput target

**Constraints**: `libs/contract`, `apps/room` and the `/rooms` page are not changed (FR-033); no new dependency; the worker has no database access; transactions only in repositories; every code file under 200 lines; `.env` files are never read

**Scale/Scope**: a demo system with synthetic data and no sign-in; 5 HTTP routes, 6 NATS handlers, 1 queue, 2 tables, 1 page; about 45 new source files (specs included) across `apps/gateway`, `apps/booking`, `apps/worker`, `apps/web` and `libs/backend-common`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

| Principle | Gate | Result |
|---|---|---|
| I. Contract as Source of Truth | Routes, patterns, queue name, DTO classes, error codes, header names and constants all come from `@roombook/contract`. Where the contract defines no answer class (`deleteBooking`, `recordConfirmationResult`) or no job name, an existing contract export is reused; nothing is added to or changed in the contract. Errors cross boundaries as `{ statusCode, errorCode, message }` through `ExceptionHelper`. | PASS |
| II. Layered Architecture | Gateway handlers are one forwarding statement each, following the existing `RoomController`; the key check is a guard and the replay header an interceptor. `POST` takes `CreateBookingDto`, `PATCH` takes `UpdateBookingDto`. Rules live in `booking` services, data access in repositories, and the only transaction is in `IdempotentBookingRepository`. The gateway and the worker have no database access. Each new class is registered in one module. No literal port, host, URL or secret is added; no new environment variable is needed. Health patterns for all services already exist and no deployable is added. | PASS |
| III. Strict TypeScript | No `interface`, no `any`, no inline object parameter types, explicit return types on every repository method, named imports only. Internal shapes (claim result, sender decision) are named classes or `type`s. | PASS |
| IV. Small, Self-Describing Files | Kebab-case names that state their purpose; the booking create flow, the other booking operations, the two repositories and the page's parts are split so each file stays under 200 lines; no narrative comments. | PASS |
| V. Test-First | Every new or modified service, repository, controller, guard, interceptor, processor, hook and component gets a `*.spec.ts(x)` next to it, written and failing before the implementation. | PASS |
| Safety Constraints | `.env` files are not read (configuration is referred to by name); git stays local; no dependency is added. | PASS |
| Quality Gates | `pnpm run build`, `pnpm run lint` and `pnpm run test` are the completion check (quickstart, "Automated gates"). | PASS |

**Initial gate**: PASS — no violation, nothing to justify.

**Post-design re-check** (after research, data model and contracts): PASS. Points that were checked
again because the design touched them:

- The internal claim outcome (`CREATED`, `REPLAYED`, `KEY_REUSED`, `IN_PROGRESS`) is a value inside the
  `booking` service; it never crosses a service boundary, so it is not a contract item (Principle I).
- The conditional updates for the time pair and the confirmation outcome are single statements in the
  repository; the service still decides the answer and its error code (Principle II).
- Moving `isErrorResponse` to its own exported file changes `libs/backend-common`, which is not a
  frozen area, and keeps the filter's behaviour (its spec stays green).

## Project Structure

### Documentation (this feature)

```text
specs/001-room-bookings/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── gateway-http-api.md
│   ├── service-messages.md
│   └── bookings-page.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

New files unless marked `(edit)`. Every source file has a `*.spec.ts` / `*.spec.tsx` next to it; specs
are left out of the tree for readability, except where an existing spec is edited.

```text
libs/backend-common/src/
├── index.ts                                          (edit: export the new entities and the guard)
└── lib/
    ├── entities/
    │   ├── booking.entity.ts
    │   └── idempotency-key.entity.ts
    ├── errors/
    │   ├── error-response.guard.ts                   (isErrorResponse, moved out of the filter)
    │   └── rpc-exception.filter.ts                   (edit: import the guard)
    └── database/
        ├── data-source.ts                            (edit: register the entities)
        └── migrations/
            ├── 1731200000002-create-bookings.ts
            ├── 1731200000003-create-idempotency-keys.ts
            └── index.ts                              (edit)

apps/gateway/src/
├── app/app.module.ts                                 (edit: import BookingModule)
└── booking/
    ├── booking.module.ts
    ├── booking.controller.ts                         (5 routes, each forwards over NATS)
    ├── idempotency-key.guard.ts                      (header is a UUID, else 400)
    └── idempotency-replay.interceptor.ts             (sets Idempotency-Replayed, unwraps the booking)

apps/booking/src/
├── app/app.module.ts                                 (edit: NatsClientModule, BookingModule)
└── booking/
    ├── booking.module.ts                             (entities, queue registration, providers)
    ├── booking.controller.ts                         (6 message patterns)
    ├── booking.service.ts                            (list, find, update, delete, record confirmation)
    ├── create-booking.service.ts                     (idempotent create flow, then enqueue)
    ├── booking.repository.ts                         (page, find, conditional update, delete, record outcome)
    ├── idempotent-booking.repository.ts              (find key; claim key + insert booking in one transaction)
    ├── claim-booking-result.dto.ts                   (claim outcome and its booking)
    ├── booking.mapper.ts                             (entity → BookingDto)
    ├── booking-fingerprint.util.ts                   (sha256 of the five create fields)
    ├── booking-time-range.util.ts                    (instants parse, end later than start)
    ├── room.client.ts                                (room:findRoomById over NATS)
    └── confirmation-queue.producer.ts                (bounded queue.add with the contract's job options)

apps/worker/src/
├── app/app.module.ts                                 (edit: NatsClientModule, ConfirmationModule)
└── confirmation/
    ├── confirmation.module.ts
    ├── confirmation.processor.ts                     (BullMQ processor; delegates)
    ├── confirmation.service.ts                       (one attempt: read, decide, report)
    ├── simulated-confirmation-sender.ts              (rule by address domain and attempt)
    └── booking.client.ts                             (find booking, record result over NATS)

apps/web/src/
├── layouts/
│   ├── app-layout.tsx                                (edit: "Bookings" navigation item)
│   └── app-layout.spec.tsx                           (edit)
├── pages/bookings/index.tsx
├── services/booking.service.ts                       (list, create with key, update, delete)
└── views/bookings/
    ├── bookings-page.tsx                             (composition and states)
    ├── use-bookings.ts                               (list loading, paging, filter, reload)
    ├── bookings-table.tsx
    ├── booking-room-filter.tsx
    ├── booking-create-form.tsx
    ├── booking-edit-dialog.tsx
    ├── booking-delete-dialog.tsx
    ├── booking-form.schema.ts                        (yup rules for create and edit)
    ├── booking-date.util.ts                          (local input value ↔ UTC ISO, display)
    └── use-idempotency-key.ts                        (key kept only across a network error)
```

Not touched: `libs/contract/**`, `apps/room/**`, `apps/web/src/views/rooms/**`,
`apps/web/src/pages/rooms/**`, `apps/web/src/services/room.service.ts`, `package.json`,
`docker-compose.yml`, `scripts/**`.

**Structure Decision**: The existing Nx layout is kept: one feature folder per app
(`apps/<app>/src/booking` or `confirmation`, `apps/web/src/views/bookings`), mirroring how `room` is
laid out today, with shared entities and migrations in `libs/backend-common` next to `RoomEntity`.

## Design Overview

Details are in the Phase 0 and Phase 1 documents; this is the map.

| Concern | Where | Reference |
|---|---|---|
| Key format check before the body | `apps/gateway` guard | research R1 |
| Replay header | `apps/gateway` interceptor | research R2 |
| Claim + insert in one transaction, 409 and 422 | `IdempotentBookingRepository` | research R3, data-model "Claim outcomes" |
| Order of checks on create | `CreateBookingService` | research R4 |
| Fingerprint | `booking-fingerprint.util.ts` | research R5 |
| Enqueue with job id, attempts, backoff | `ConfirmationQueueProducer` | research R6 |
| One confirmation attempt | `apps/worker` `ConfirmationService` | research R7, contracts/service-messages |
| Idempotent outcome recording | `BookingRepository` | research R8, data-model "Confirmation state" |
| Update keeps `endsAt` later than `startsAt` | `BookingRepository` + `BookingService` | research R9 |
| HTTP surface | `apps/gateway` | contracts/gateway-http-api |
| Page behaviour and key rule | `apps/web/src/views/bookings` | contracts/bookings-page |
| End-to-end validation | — | quickstart |

## Assumptions made in this plan

These fill gaps the specification leaves open; each takes the simplest option.

1. "In progress" means the claim transaction is open. Two same-key requests that overlap only while
   the room is being checked are answered as create plus replay (or 409), which the spec allows.
2. The idempotency table has no status column; a row exists only for a completed create.
3. Bodies are "the same" when the five values are the same strings; the key is compared
   case-insensitively.
4. A replay is always answered 201, the only status ever stored.
5. Any unknown field on `PATCH` answers 400; unknown fields on `POST` are dropped.
6. A time without an offset is read by JavaScript's rules; clients are expected to send `Z` or an
   offset.
7. A recorded confirmation outcome sets `updatedAt`, like any other change to the row.
8. `booking:deleteBooking` answers the deleted booking and `booking:recordConfirmationResult` answers
   the stored booking or `null`; the gateway still answers 204 with no body.
9. The BullMQ job name is the queue name.
10. The enqueue call is bounded at 2 seconds; that limit is a code constant, not configuration.
11. Concurrency (SC-002) is proven against the running stack in the quickstart; unit tests cover each
    claim outcome with the database mocked, as the existing repository specs do.
12. The page's table has a fixed page size of 10 and reloads the list after each change.

## Complexity Tracking

No constitution violation; nothing to justify.
