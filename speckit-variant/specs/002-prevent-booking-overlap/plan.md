# Implementation Plan: No Overlapping Bookings for the Same Room

**Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/002-prevent-booking-overlap`) | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-prevent-booking-overlap/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Bookings of the same room may no longer overlap. A create or an update whose span overlaps another
booking of the room is answered 409 `CONFLICT.BOOKING_OVERLAP`, also when requests race.

1. **Contract** — one error code is added to `ErrorCodeEnum`.
2. **Create** — the existing claim transaction in the `booking` service takes a per-room advisory
   lock, checks the span and returns a new outcome `OVERLAP` before anything is inserted, so a
   rejected create leaves no booking, no idempotency row and no job.
3. **Update** — the repository's update becomes one transaction under the same room lock that
   returns an outcome (updated, not found, invalid time pair, overlap); the service maps it to the
   answer.
4. **Bookings page** — the page already shows the API's message inside the form and keeps the
   input for any answered error; the change adds tests that pin this for the overlap rejection.

No table, migration, dependency, route or message pattern is added. Design decisions and their
reasons are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 or newer

**Primary Dependencies**: NestJS 11 (HTTP gateway, NATS microservices), TypeORM 0.3, class-validator / class-transformer, Next.js 15 (pages router) with React 18 and MUI 5, react-hook-form with yup — all already installed; no dependency is added

**Storage**: PostgreSQL 15, table `bookings` as it is; transaction-scoped advisory locks; no schema change and no migration

**Testing**: Jest 29 through Nx (`pnpm run test`); `@nestjs/testing` with the database mocked for the backend, Testing Library with the service layer mocked for the web page; races are proven against the running stack (quickstart)

**Target Platform**: Node services and a browser frontend, run locally through `pnpm run stack:up` (Docker for Postgres, Redis and NATS)

**Project Type**: Web application in an Nx monorepo — HTTP gateway, NATS services, queue worker, Next.js frontend

**Performance Goals**: no throughput target; a writer waits only for another writer of the same room, for the length of one short transaction, well inside the gateway's 5-second NATS timeout

**Constraints**: the only contract change is the added error code (FR-015); `apps/room` and the `/rooms` page are not changed (FR-021); no data migration (FR-022); no new dependency; transactions only in repositories; every code file under 200 lines; `.env` files are never read

**Scale/Scope**: a demo system with synthetic data; 1 contract line, 3 new source files and 5 edited ones in `apps/booking` (with their specs), 3 edited specs in `apps/web`; `apps/gateway`, `apps/worker`, `apps/room` and `libs/backend-common` untouched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

| Principle | Gate | Result |
|---|---|---|
| I. Contract as Source of Truth | The new error code is added to `ErrorCodeEnum` in `@roombook/contract` and used from there; it is not invented elsewhere. The rejection crosses service boundaries as `{ statusCode, errorCode, message }` through the existing `ExceptionHelper.conflict`. No route, pattern, DTO or field is added. | PASS |
| II. Layered Architecture | No controller changes. The rule's answer is chosen in the `booking` services; the lock, the check and both transactions are in repositories. The gateway gains no logic and no database access. The new files are plain functions and classes, not providers, so module registration is unchanged. No literal port, host, URL or secret; no new environment variable; no new deployable. | PASS |
| III. Strict TypeScript | No `interface`, no `any`, no inline object parameter types; the new repository method and the two query functions have explicit return types; named imports only. The update outcome is a named class with an enum. | PASS |
| IV. Small, Self-Describing Files | New files are kebab-case and named for their purpose; the shared lock and check go in their own file so both repositories stay well under 200 lines; no narrative comments. | PASS |
| V. Test-First | Every new or modified service, repository and function in `apps/booking` gets its failing spec first. | PASS |
| Safety Constraints | `.env` files are not read; git stays local; no dependency is added. | PASS |
| Quality Gates | `pnpm run build`, `pnpm run lint` and `pnpm run test` are the completion check (quickstart, "Automated gates"). | PASS |

**Initial gate**: PASS — no violation, nothing to justify.

**Post-design re-check** (after research, data model and contracts): PASS. Points checked again
because the design touched them:

- The outcomes `OVERLAP` (claim) and `UpdateBookingOutcomeEnum` are values inside the `booking`
  service; they never cross a service boundary, so they are not contract items (Principle I).
- `BookingRepository` gains a transaction. It is in a repository, and `BookingService` only maps the
  outcome (Principle II).
- `booking-overlap.query.ts` holds SQL outside a class. It is data access called only by the two
  repositories with their transaction's `EntityManager`; no service imports it (Principle II).
- The web tests are expected to pass when first written, because the page already has the
  behaviour (research R6). Principle V orders the test before the implementation; here there is no
  implementation to follow, so the principle is not broken, and the fact is stated rather than
  hidden. If a case fails, the component is fixed after it.

## Project Structure

### Documentation (this feature)

```text
specs/002-prevent-booking-overlap/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── gateway-http-api.md
│   └── bookings-page.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

`(new)` or `(edit)`. Every source file listed has its `*.spec.ts` next to it, new or edited with it,
except the two `*.dto.ts` files, which hold no logic and are covered through their users' specs.

```text
libs/contract/src/lib/
└── error-code.enum.ts                      (edit: BOOKING_OVERLAP = 'CONFLICT.BOOKING_OVERLAP')

apps/booking/src/booking/
├── booking-overlap.query.ts                (new: take the room lock; does a span overlap in a room)
├── booking-overlap.error.ts                (new: raise 409 CONFLICT.BOOKING_OVERLAP with its message)
├── update-booking-result.dto.ts            (new: update outcome and its booking)
├── claim-booking-result.dto.ts             (edit: outcome OVERLAP)
├── idempotent-booking.repository.ts        (edit: room lock and check before the insert)
├── create-booking.service.ts               (edit: OVERLAP → 409, nothing enqueued)
├── booking.repository.ts                   (edit: update in one transaction, returns an outcome)
└── booking.service.ts                      (edit: map the update outcome to 200 / 404 / 400 / 409)

apps/web/src/views/bookings/
├── booking-create-form.spec.tsx            (edit: overlap message shown, input kept, new key, clears on success)
├── booking-edit-dialog.spec.tsx            (edit: overlap message shown, dialog open, input kept)
└── bookings-page.spec.tsx                  (edit: row keeps stored values after a rejected edit)
```

Not touched: `apps/room/**`, `apps/gateway/**`, `apps/worker/**`, `libs/backend-common/**`
(entities, migrations, `ExceptionHelper`), the rest of `libs/contract/**`, the components under
`apps/web/src/views/bookings/` (unless a new test fails), `apps/web/src/views/rooms/**`,
`apps/web/src/pages/**`, `apps/web/src/services/**`, `package.json`, `docker-compose.yml`,
`scripts/**`, `specs/001-room-bookings/**`.

**Structure Decision**: The existing Nx layout is kept. All behaviour lands in the `booking`
service's feature folder next to the code it changes; the shared contract gets its one line; the
web app gets tests only.

## Design Overview

Details are in the Phase 0 and Phase 1 documents; this is the map.

| Concern | Where | Reference |
|---|---|---|
| Writers of one room take turns | room advisory lock in both repository transactions | research R1, data-model "Room lock" |
| Half-open overlap predicate, own id excluded | `booking-overlap.query.ts` | research R2, data-model "New rule" |
| Create: check last, nothing stored on rejection | `IdempotentBookingRepository`, `CreateBookingService` | research R3, data-model "Claim outcomes" |
| Update: resulting span, 404 → 400 → 409 | `BookingRepository`, `BookingService` | research R4, data-model "Update outcomes" |
| Error code and message | `libs/contract`, `booking-overlap.error.ts` | research R5, contracts/gateway-http-api |
| Page shows the message and keeps the input | existing components, new test cases | research R6, contracts/bookings-page |
| Proof of the race | — | research R7, quickstart scenarios 5 and 6 |

## Assumptions made in this plan

These fill gaps the specification leaves open; each takes the simplest option.

1. The rule is enforced by the `booking` service under a per-room lock, not by a database
   constraint. The service is the only writer of `bookings`.
2. No schema change is made, so there is no migration at all — stricter than FR-022, which forbids
   only migrating existing data.
3. The message is `The room is already booked for that time`, the same on create and update.
4. `BOOKING_OVERLAP` is placed after `IDEMPOTENCY_IN_PROGRESS` in the enum, next to the other
   `CONFLICT.*` code.
5. Every update that changes something goes through the lock and the check, including a
   title-only update; an empty update still returns the stored booking without a transaction.
6. `updateIfTimeRangeValid` is replaced, not kept beside the new method; `BookingService` is its
   only caller.
7. A writer waits for the room lock without a timeout of its own; the wait is bounded by the other
   writer's short transaction.
8. Deletes take no lock.
9. The race (SC-003) is proven against the running stack in the quickstart; unit tests cover each
   outcome and the order of statements with the database mocked, as in `specs/001-room-bookings`.
10. No production code in `apps/web` changes, because the page already meets FR-017 to FR-019; if a
    new test shows otherwise, the component is fixed.
11. The gateway needs no new test: it forwards the rejection through the same path as every other
    error, which its existing specs cover.

## Complexity Tracking

No constitution violation; nothing to justify.
