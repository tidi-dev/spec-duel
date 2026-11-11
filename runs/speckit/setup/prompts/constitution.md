/speckit-constitution # Project rules for the roombook repository

These rules apply to every change in this repository.

## Source of truth
- `libs/contract` (`@roombook/contract`) is the source of truth for routes, message patterns, queue names, DTO classes, error codes and job payloads. Use what it exports. Do not invent a route, pattern, field or error code.
- Errors cross service boundaries as `{ statusCode, errorCode, message }`, with `errorCode` taken from `ErrorCodeEnum`.

## Architecture
- Controllers are thin: at most five statements, all delegating to a service. No logic in controllers.
- Every POST, PUT and PATCH handler takes a DTO class with class-validator decorators as its body.
- Services hold business rules and delegate data access to repositories.
- Database transactions live in repositories only, never in services.
- The gateway holds no database access and no business rules; it validates input and forwards over NATS.
- Every controller, service and provider is registered in exactly one module.
- No literal ports, hosts, URLs or secrets in source files; configuration comes from environment variables read through the config module.
- Every deployable service has a health endpoint: a health message pattern on each NATS service, exposed by the gateway as `GET /api/health/<service>`.

## TypeScript
- Never use `interface`; use `class` for DTOs and `type` for everything else.
- Never use `any`.
- Never use an inline object type as a function parameter; define a named DTO class.
- Every repository method has an explicit return type.
- Named imports only; no `import * as`.

## Files and style
- File names are kebab-case and describe their purpose.
- Keep every code file under 200 lines; split by concern.
- No comments that restate what the code does. A comment is allowed only for a non-obvious constraint, one short line.

## Tests
- Every new or modified service has at least one unit test in a `*.spec.ts` file next to it.
- Write the failing test before the implementation.
- A change is finished only when `pnpm run build`, `pnpm run lint` and `pnpm run test` all pass.

## Safety
- Never read `.env` or `.env.*` files; refer to configuration by variable name.
- Git is local only: no remote, no push, no pull request.
- Do not add dependencies.
