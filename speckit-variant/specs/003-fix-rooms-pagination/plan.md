# Implementation Plan: Rooms List Shows the Right Rooms on Every Page

**Branch**: none — no branch hook is installed; the work stays on `main` (feature directory `specs/003-fix-rooms-pagination`) | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-rooms-pagination/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

The rooms list returns the wrong rooms for any page after the first when the page size is not 10.

1. **Cause** — `RoomRepository.findPage` in `apps/room` skips `(page − 1) × DEFAULT_PAGE_SIZE` rooms
   instead of `(page − 1) × limit`. The full analysis, including why no existing test fails, is in
   [research.md](./research.md) and was written before any code change (FR-007).
2. **Regression test** — new cases in `room.repository.spec.ts`, written first and seen to fail:
   the reported case (page 2 at 5 per page), further offsets, and a walk over all pages at page
   sizes 1, 5, 10, 12 and 100.
3. **Fix** — one expression in `room.repository.ts`, plus the removal of the import it no longer
   needs.

Two files change, both in `apps/room`. No route, DTO, constant, error code, table, migration or
dependency is added or changed, and the web app is not edited.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 or newer

**Primary Dependencies**: NestJS 11 (NATS microservice `room`), TypeORM 0.3 — already installed; no dependency is added

**Storage**: PostgreSQL 15, table `rooms` as it is, read only; no schema change and no migration

**Testing**: Jest 29 through Nx (`pnpm run test`, `pnpm exec nx test room`); `@nestjs/testing` with the TypeORM repository mocked, as the existing room specs do; the end-to-end path is proven against the running stack (quickstart)

**Target Platform**: Node services and a browser frontend, run locally through `pnpm run stack:up` (Docker for Postgres, Redis and NATS)

**Project Type**: Web application in an Nx monorepo — HTTP gateway, NATS services, queue worker, Next.js frontend

**Performance Goals**: none; the query keeps its shape (one ordered, limited read with a count)

**Constraints**: fix limited to the defect (FR-009); response shape, ordering, defaults and input rejection unchanged (FR-005, FR-006); analysis committed before the code change (SC-003); failing test before the fix; no new dependency; every code file under 200 lines; `.env` files are never read

**Scale/Scope**: a demo system with 12 seeded rooms; 1 edited source file and 1 edited spec in `apps/room`; everything else untouched

No item needs clarification.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0.

| Principle | Gate | Result |
|---|---|---|
| I. Contract as Source of Truth | Nothing is added to or changed in `@roombook/contract`. The fix uses the `limit` field of the existing `PageQueryDto`; the repository stops using `DEFAULT_PAGE_SIZE`, which stays the DTO's default. No error path changes. | PASS |
| II. Layered Architecture | No controller or service changes. The offset is data access and stays in the repository. No transaction, module registration, configuration value or deployable changes. | PASS |
| III. Strict TypeScript | No `interface`, no `any`, no inline object parameter type; `findPage` keeps its explicit return type; named imports only. | PASS |
| IV. Small, Self-Describing Files | No new file. `room.repository.ts` stays at 30 lines; `room.repository.spec.ts` grows from 62 lines to well under 200. No comment is added. | PASS |
| V. Test-First | The new spec cases are written and run before the repository is edited, and must fail. `RoomService` is not modified and keeps its spec. | PASS |
| Safety Constraints | `.env` files are not read; git stays local; no dependency is added. | PASS |
| Quality Gates | `pnpm run build`, `pnpm run lint` and `pnpm run test` are the completion check (quickstart, "Automated gates"). | PASS |

**Initial gate**: PASS — no violation, nothing to justify.

**Post-design re-check** (after research, data model and contracts): PASS. Points checked again
because the design touched them:

- The contracts documents restate the existing route and page; they define nothing new, so
  `libs/contract` stays the only source of truth (Principle I).
- Removing the `DEFAULT_PAGE_SIZE` import from the repository is required by the lint gate once the
  expression no longer uses it; the constant itself is not removed.
- The walk test gives the mocked `findAndCount` an implementation that slices 12 in-memory rooms.
  That is test data inside the spec, not a replacement for real code (Principle V).

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-rooms-pagination/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output: the root-cause analysis (FR-007) and decisions
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── gateway-http-api.md
│   └── rooms-page.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/room/src/room/
├── room.repository.spec.ts   (edit, first: page 2 at 5 per page, further offsets, walk over all pages)
└── room.repository.ts        (edit: skip = (page − 1) × limit; drop the unused DEFAULT_PAGE_SIZE import)
```

Not touched: the rest of `apps/room/**` (controller, service, module and their specs),
`apps/gateway/**`, `apps/booking/**`, `apps/worker/**`, `apps/web/**`, `libs/contract/**`,
`libs/backend-common/**`, `package.json`, `docker-compose.yml`, `scripts/**`, `specs/001-*/**`,
`specs/002-*/**`.

**Structure Decision**: The existing Nx layout is kept. The defect and its test live in the `room`
service's feature folder; nothing is added.

## Design Overview

| Concern | Where | Reference |
|---|---|---|
| Where the defect is, why, why tests missed it | — | research "Root-cause analysis" |
| Correct offset | `room.repository.ts` | research R1, data-model "The corrected rule" |
| Regression test that fails without the fix | `room.repository.spec.ts` | research R2 |
| API answers before and after | — | contracts/gateway-http-api |
| `/rooms` page follows the API, no edit | — | research R3, contracts/rooms-page |
| End-to-end proof and each-room-once check | — | research R4, quickstart scenarios 1–5 |
| Analysis before code in the history | local commits | research R5, quickstart "Order check" |

## Order of work

1. Commit this feature folder locally (specification and planning documents).
2. Add the new cases to `room.repository.spec.ts`; run `pnpm exec nx test room`; see them fail.
3. Edit `room.repository.ts`; run the same command; see it pass.
4. Run the three gates and the quickstart.

## Assumptions made in this plan

These fill gaps the specification leaves open; each takes the simplest option.

1. The specification says the change is in "the service behind the API". The defect is in that
   service's repository (`apps/room`), not in the `RoomService` class, which only delegates and is
   not edited.
2. The regression test is a unit test with the database mocked, as every existing spec in the
   repository is; no database-backed test harness is introduced. SC-002 is covered twice: by the
   walk in the spec against in-memory rooms and by quickstart scenario 4 against the seeded
   database.
3. The cause was established by reading the code and working the arithmetic for each reported
   observation; the stack was not started during planning. Quickstart scenario 1 states what the
   reported request returns before and after.
4. No test is added to `apps/web` or `apps/gateway`: their existing specs already cover requesting
   and forwarding page 2 at 5 per page, and neither can observe the defect.
5. `rooms-page.spec.tsx` keeps its helper that models a correct backend.
6. Planning itself creates no commit; the first step of the implementation commits this folder so
   that the analysis predates the code change (SC-003).
7. The bookings list was checked and does not have the defect; nothing is recorded for a follow-up.

## Complexity Tracking

No constitution violation; nothing to justify.
