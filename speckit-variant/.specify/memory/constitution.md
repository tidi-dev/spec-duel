<!--
Sync Impact Report
- Version change: (unratified template) → 1.0.0
- Modified principles: none renamed; the five template slots are filled for the first time
  - I. Contract as Source of Truth
  - II. Layered Architecture
  - III. Strict TypeScript
  - IV. Small, Self-Describing Files
  - V. Test-First (NON-NEGOTIABLE)
- Added sections: Safety Constraints; Quality Gates; Governance
- Removed sections: none
- Assumptions:
  - The "Tests" rules are split: the two test-writing rules form Principle V, the
    build/lint/test completion rule forms the Quality Gates section.
  - Governance rules (amendment, versioning, compliance review) were not supplied and are
    the simplest set that satisfies the template.
  - Ratification date is the date of first adoption, 2026-11-10.
- Follow-up TODOs: none
-->

# roombook Constitution

These rules apply to every change in this repository.

## Core Principles

### I. Contract as Source of Truth

- `libs/contract` (`@roombook/contract`) is the source of truth for routes, message patterns,
  queue names, DTO classes, error codes and job payloads.
- Code MUST use what `@roombook/contract` exports. A route, pattern, field or error code
  MUST NOT be invented outside it.
- Errors MUST cross service boundaries as `{ statusCode, errorCode, message }`, with
  `errorCode` taken from `ErrorCodeEnum`.

Rationale: the gateway, the NATS services, the worker and the frontend stay compatible only
when they all read the same definitions.

### II. Layered Architecture

- Controllers MUST be thin: at most five statements, all delegating to a service. Controllers
  MUST NOT contain logic.
- Every POST, PUT and PATCH handler MUST take a DTO class with class-validator decorators as
  its body.
- Services hold business rules and MUST delegate data access to repositories.
- Database transactions MUST live in repositories only, never in services.
- The gateway MUST NOT hold database access or business rules; it validates input and forwards
  over NATS.
- Every controller, service and provider MUST be registered in exactly one module.
- Source files MUST NOT contain literal ports, hosts, URLs or secrets; configuration comes from
  environment variables read through the config module.
- Every deployable service MUST have a health endpoint: a health message pattern on each NATS
  service, exposed by the gateway as `GET /api/health/<service>`.

Rationale: each layer has one responsibility, so a rule has one place to live and one place
to be tested.

### III. Strict TypeScript

- `interface` MUST NOT be used; use `class` for DTOs and `type` for everything else.
- `any` MUST NOT be used.
- An inline object type MUST NOT be used as a function parameter; define a named DTO class.
- Every repository method MUST have an explicit return type.
- Imports MUST be named imports; `import * as` MUST NOT be used.

Rationale: explicit, named types keep the contract visible at every boundary and stop
untyped data from leaking between layers.

### IV. Small, Self-Describing Files

- File names MUST be kebab-case and describe their purpose.
- Every code file MUST stay under 200 lines; split by concern.
- Comments MUST NOT restate what the code does. A comment is allowed only for a non-obvious
  constraint, in one short line.

Rationale: a file whose name and size reveal its purpose can be found and understood without
opening its neighbours.

### V. Test-First (NON-NEGOTIABLE)

- Every new or modified service MUST have at least one unit test in a `*.spec.ts` file next
  to it.
- The failing test MUST be written before the implementation.

Rationale: a test written first proves the behaviour was missing and that the change added it.

## Safety Constraints

- `.env` and `.env.*` files MUST NOT be read; refer to configuration by variable name.
- Git is local only: no remote, no push, no pull request.
- Dependencies MUST NOT be added.

## Quality Gates

A change is finished only when all three commands pass:

- `pnpm run build`
- `pnpm run lint`
- `pnpm run test`

## Governance

- This constitution supersedes any other practice in this repository. Where another document
  conflicts with it, the constitution wins.
- Amendments are made by editing this file through `/speckit-constitution`, with the change
  recorded in a local commit.
- Versions follow semantic versioning: MAJOR for removing or redefining a principle, MINOR for
  adding a principle or section or materially expanding guidance, PATCH for clarifications and
  wording.
- Every specification, plan, task list and implementation MUST be checked against these
  principles. A violation MUST be fixed, or justified in writing in the plan, before the
  change is considered finished.

**Version**: 1.0.0 | **Ratified**: 2026-11-10 | **Last Amended**: 2026-11-10
