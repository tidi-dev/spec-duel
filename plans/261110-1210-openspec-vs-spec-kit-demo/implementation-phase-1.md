# Phase 1: Workspace, infra and contract

**Status:** Done 2026-11-10 · **Runs:** me, sequentially · **Track:** S
**Why first:** everything else builds against the contract and the installed dependency set.
**Risk:** Nx 18.1.2 executors on Node 24 with a hand-written workspace. Mitigation: Task 1 ends with a build of an empty lib; if an executor fails, stop and report rather than change versions.
**Security:** `.env` is generated, gitignored and never read by an agent. No value from Acme is copied; only version strings.

All paths are under `/workspace/spec-duel/baseline/`.

### Task 1: Nx workspace and tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc` (`node-linker=hoisted`), `nx.json`, `tsconfig.base.json`, `jest.config.ts`, `jest.preset.js`, `.eslintrc.json`, `.eslintignore`, `.prettierrc`, `.gitignore`, `README.md`
- Create: `.claude/` (copy of `/workspace/spec-duel/.claude/`, minus `settings.local.json` and `worktrees/`)

**Interfaces:**
- Produces: path aliases `@roombook/contract` → `libs/contract/src/index.ts`, `@roombook/backend-common` → `libs/backend-common/src/index.ts`; root scripts `build`, `lint`, `test` (each `nx run-many -t <target>`), `stack:up`, `stack:down`, `stack:reset`, `migration:run`.

- [x] **Step 1:** `git init` in `baseline/` (branch `main`); write `.gitignore` covering `node_modules`, `dist`, `.next`, `.nx`, `.env`, `.env.*`, `*.tsbuildinfo`.
- [x] **Step 2:** Write `package.json` with every dependency the five apps need, versions copied from Acme's `package.json` (design §3, §10): the `@nx/*` 18.1.2 set (`js`, `nest`, `next`, `node`, `react`, `jest`, `linter`, `webpack`, `eslint-plugin`, `workspace`), `@nestjs/{common,core,microservices,platform-express,config,typeorm,terminus,bullmq,testing}`, `nats`, `typeorm`, `pg`, `bullmq` pinned to `5.79.1`, `ioredis`, `joi`, `class-validator`, `class-transformer`, `rxjs`, `reflect-metadata`, `next`, `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `react-hook-form`, `@hookform/resolvers`, `yup`, `axios`, `uuid`, and the dev set (`typescript`, `jest`, `ts-jest`, `babel-jest`, `jest-environment-jsdom`, `@testing-library/react`, `@types/*`, `eslint` and its plugins, `prettier`, `ts-node`, `webpack-cli`, `@swc/core`, `@swc/helpers`, `@babel/preset-react`).
- [x] **Step 3:** `nx.json` with `targetDefaults` (`build` depends on `^build`) and no `plugins` array; `.prettierrc` with `singleQuote`, `trailingComma: all`, `printWidth: 120`; `.eslintrc.json` with `plugin:@nx/typescript`, `@typescript-eslint/no-explicit-any: error` and a `no-restricted-syntax` rule banning `TSInterfaceDeclaration`.
- [x] **Step 4:** Run `pnpm install`. Expected: exit 0. Record the lockfile's package count in the project log.
- [x] **Step 5:** Commit `chore: scaffold nx workspace`.

### Task 2: Local infra and scripts

**Files:**
- Create: `docker-compose.yml`, `scripts/make-local-env.sh`, `scripts/stack-up.sh`, `scripts/stack-down.sh`, `scripts/stack-reset.sh`, `docs/local-setup.md`

**Interfaces:**
- Produces: env names `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `REDIS_HOST`, `REDIS_PORT`, `NATS_URL`, `GATEWAY_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `COMPOSE_PROJECT_NAME`, `PORT_OFFSET`.
- `scripts/stack-up.sh`: creates `.env` if missing, starts compose, waits for health, runs migrations, builds and starts the four Nest apps and `web` in the background with logs under `tmp/logs/`, and exits 0 only when `GET /api/health/gateway` answers 200. `stack-reset.sh` drops volumes and runs `stack-up.sh`.

- [x] **Step 1:** `docker-compose.yml` with `postgres:15`, `redis:7.2`, `nats:2.10-alpine`, each with a healthcheck, host ports `5432+PORT_OFFSET`, `6379+PORT_OFFSET`, `4222+PORT_OFFSET`, and credentials read from the environment (`${DB_PASSWORD:?}`), never literal.
- [x] **Step 2:** `scripts/make-local-env.sh` writes `.env` with a random throwaway `DB_PASSWORD` (`openssl rand -hex 12`) and defaults for the other names; `PORT_OFFSET` defaults to 0 (gateway 3100, web 4200).
- [x] **Step 3:** Run `docker compose config -q` → exit 0. Run `docker compose up -d --wait` then `docker compose down` → both exit 0.
- [x] **Step 4:** `docs/local-setup.md` lists the env names (no values) and the three stack scripts.
- [x] **Step 5:** Commit `chore: add local infra and stack scripts`.

### Task 3: `libs/contract`

**Files:**
- Create: `libs/contract/project.json`, `tsconfig*.json`, `jest.config.ts`, `.eslintrc.json`, `src/index.ts`
- Create under `libs/contract/src/lib/`: `api-route.enum.ts`, `message-pattern.enum.ts`, `queue.enum.ts`, `error-code.enum.ts`, `confirmation-status.enum.ts`, `contract.constants.ts`, `dto/page-query.dto.ts`, `dto/room.dto.ts`, `dto/booking.dto.ts`, `dto/create-booking.dto.ts`, `dto/update-booking.dto.ts`, `dto/list-bookings-query.dto.ts`, `dto/booking-message.dto.ts`, `dto/confirmation.dto.ts`, `dto/error-response.dto.ts`
- Test: `libs/contract/src/lib/dto/*.spec.ts`, `contract.constants.spec.ts`

**Interfaces (produced; every later task uses these exact names):**
- `ApiRouteEnum { HEALTH = 'health', ROOMS = 'rooms', BOOKINGS = 'bookings' }`
- `ServiceNameEnum { GATEWAY = 'gateway', BOOKING = 'booking', ROOM = 'room', WORKER = 'worker' }`
- `HealthPatternEnum { BOOKING = 'health:booking', ROOM = 'health:room', WORKER = 'health:worker' }`
- `RoomPatternEnum { LIST = 'room:listRooms', FIND_BY_ID = 'room:findRoomById' }`
- `BookingPatternEnum { CREATE = 'booking:createBooking', LIST = 'booking:listBookings', FIND_BY_ID = 'booking:findBookingById', UPDATE = 'booking:updateBooking', DELETE = 'booking:deleteBooking', RECORD_CONFIRMATION = 'booking:recordConfirmationResult' }`
- `QueueEnum { BOOKING_CONFIRMATION = 'booking-confirmation' }`
- `ConfirmationStatusEnum { PENDING, SENT, FAILED }` (string values equal to the names)
- `ErrorCodeEnum { VALIDATION = 'BAD_REQUEST.VALIDATION', IDEMPOTENCY_KEY_INVALID = 'BAD_REQUEST.IDEMPOTENCY_KEY', ROOM_NOT_FOUND = 'NOT_FOUND.ROOM', BOOKING_NOT_FOUND = 'NOT_FOUND.BOOKING', IDEMPOTENCY_IN_PROGRESS = 'CONFLICT.IDEMPOTENCY_IN_PROGRESS', IDEMPOTENCY_KEY_REUSED = 'UNPROCESSABLE.IDEMPOTENCY_KEY_REUSED', SERVICE_UNAVAILABLE = 'UNAVAILABLE.SERVICE' }`
- Constants: `IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'`, `IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed'`, `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 100`, `CONFIRMATION_JOB_ATTEMPTS = 3`, `CONFIRMATION_BACKOFF_MS = 1000`, `RETRY_EMAIL_DOMAIN = 'retry.example'`, `BOUNCE_EMAIL_DOMAIN = 'bounce.example'`, `confirmationJobId(bookingId: string): string` returning `confirmation-<bookingId>`.
- DTO classes (class-validator decorated): `PageQueryDto { page = 1; limit = DEFAULT_PAGE_SIZE }` (`@Type(() => Number) @IsInt() @Min(1)`, `limit` also `@Max(MAX_PAGE_SIZE)`); `RoomDto { id; name; capacity }`; `PagedRoomsDto { items: RoomDto[]; total; page; limit }`; `RoomIdMessageDto { id }`; `CreateBookingDto { roomId (uuid); title (1–120 chars); organizerEmail (email); startsAt; endsAt (ISO 8601) }`; `UpdateBookingDto { title?; startsAt?; endsAt? }`; `ListBookingsQueryDto extends PageQueryDto { roomId? }`; `BookingDto` (fields of design §5.3); `PagedBookingsDto`; `CreateBookingMessageDto { idempotencyKey; booking: CreateBookingDto }`; `CreateBookingResultDto { booking: BookingDto; replayed: boolean }`; `UpdateBookingMessageDto { id; changes: UpdateBookingDto }`; `BookingIdMessageDto { id }`; `ConfirmationJobDto { bookingId }`; `RecordConfirmationResultDto { bookingId; status: ConfirmationStatusEnum; attempts: number }`; `ErrorResponseDto { statusCode; errorCode; message }`.
- Not in the baseline: `CONFLICT.BOOKING_OVERLAP` (change 2 adds it).
- Two codes go beyond design §5.3 because the baseline itself needs them: `BAD_REQUEST.VALIDATION` (gateway validation errors) and `UNAVAILABLE.SERVICE` (a service that does not answer).

- [x] **Step 1: Write the failing specs.** `page-query.dto.spec.ts`: `plainToInstance` + `validate` accepts `{}` as page 1, limit 10; rejects `page: 0`, `limit: 101`, `limit: 'abc'`. `create-booking.dto.spec.ts`: accepts a valid body; rejects a non-uuid `roomId`, an empty `title`, a bad email, a non-ISO `startsAt`. `contract.constants.spec.ts`: `confirmationJobId('abc')` equals `'confirmation-abc'`.
- [x] **Step 2:** Run `pnpm nx test contract` → FAIL (modules not found).
- [x] **Step 3:** Implement the files above. `endsAt`-after-`startsAt` is a business rule checked in the booking service, not in the DTO.
- [x] **Step 4:** Run `pnpm nx test contract`, `pnpm nx lint contract`, `pnpm nx build contract` → all pass.
- [x] **Step 5:** Commit `feat: add shared contract lib`.

**Success criteria:** `pnpm install`, `docker compose config -q` and the three `contract` targets all exit 0; three commits on `main`.
**Next:** Phase 2 tracks B and F and Phase 3 track A start in parallel.
