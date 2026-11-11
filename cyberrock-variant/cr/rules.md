# Project rules: roombook

The only project-specific file of the kit. Skills and agents read it first. The shared engineering rules loaded from the parent `.claude/rules/` folder also apply: `RULES.md` R1–R11 and the code standards of `be-development-rules.md` and `fe-development-rules.md`.

## Stack

- Nx 18.1.2 monorepo with explicit targets in each `project.json`, pnpm, TypeScript 5.9, Jest 29.
- Backend: NestJS 11.0.20. `apps/gateway` (HTTP under `/api`), `apps/booking` and `apps/room` (NATS request/reply through `@nestjs/microservices`, one queue group per service, no JetStream), `apps/worker` (BullMQ 5.79.1 through `@nestjs/bullmq` on Redis 7), `libs/backend-common` (config, entities, migrations, errors, NATS client).
- Database: TypeORM 0.3.22 on Postgres 15. `synchronize` is off; schema changes are migrations in `libs/backend-common`.
- Frontend: `apps/web`, Next 15.5 Pages Router (`src/pages`, no App Router, no Server Components), React 18.2, MUI 5 with Emotion, `react-hook-form` with `yup`, axios through the API client in `src/services`, Jest with Testing Library.
- Validation: class-validator 0.14 and class-transformer for DTOs; Joi for config.

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

## Conventions

- Backend feature folder: `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, each with a `*.spec.ts` next to it. Repositories are `@Injectable` classes that inject `Repository<Entity>` and `DataSource`.
- Domain code throws through the exception helper in `@roombook/backend-common`; never return an error as a normal payload.
- Entities and migrations live in `libs/backend-common`: explicit snake_case names, uuid primary keys, `timestamp with time zone`.
- Queues: `BullModule.registerQueue({ name: QueueEnum.X })`, producers with `@InjectQueue`, processors extending `WorkerHost`.
- Web: a file under `src/pages/<feature>/` is the route; its components live in `src/views/<feature>/`; one function per endpoint in `src/services/<entity>.service.ts`; per-path MUI imports; specs mock the service layer, not axios; branch on `errorCode`, never on message text. Never import `@roombook/backend-common` in the web app.

## Tests

- Every new or modified service has at least one unit test in a `*.spec.ts` file next to it.
- Write the failing test before the implementation.
- A change is finished only when `pnpm run build`, `pnpm run lint` and `pnpm run test` all pass.
- Integration specs against the real database are named `*.int.spec.ts`, so the build excludes them like any spec. Each one skips itself when the database is not configured, which keeps the unit run green without the stack: `const describeWithDatabase = process.env.DB_HOST ? describe : describe.skip;`. They use the exported `dataSource` of `@roombook/backend-common` (or a `DataSource` built from `process.env`), run the real repository code, and delete the rows they create. Run them with the Integration command below: it loads the configuration into the process, so you never read the file.

## Commands

Shell is for these commands only, one per call. Anything else is denied and wastes a turn.

| Purpose | Command |
|---|---|
| Kit | `node cr/bin/cr.mjs validate [<id>]`, `node cr/bin/cr.mjs tick <id> <T..>`, `node cr/bin/cr.mjs archive <id>` |
| One project | `pnpm nx lint <project>`, `pnpm nx test <project>`, `pnpm nx build <project>` |
| Everything | `pnpm run build`, `pnpm run lint`, `pnpm run test` |
| One spec file | `npx jest -c <project>/jest.config.ts <path>` |
| Integration specs | `scripts/stack-up.sh` once, then `node --env-file=.env node_modules/jest/bin/jest.js -c <project>/jest.config.ts --testMatch "**/*.int.spec.ts" --runInBand` |
| Types | `npx tsc --noEmit -p <project>/tsconfig.app.json` |
| Git, read-only | `git status`, `git diff`, `git log` |
| Listing | `ls <path>` |

`curl`, `cd`, pipes, `&&`, `;`, loops, redirects, heredocs, `sed`, `perl` and `python` are not available. Read with Read, Grep and Glob; change files with Edit and Write.

## Safety

- Never read `.env` or `.env.*` files; refer to configuration by variable name.
- Git is local only: no remote, no push, no pull request. Commit only when told to.
- Do not add dependencies.
