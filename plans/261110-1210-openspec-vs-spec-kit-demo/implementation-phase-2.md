# Phase 2: Baseline apps, integration and tag

**Status:** Done 2026-11-10 · **Tracks:** B (`nestjs-expert`) ∥ F (`nextjs-fe-developer`), then joined by me
**Depends on:** Phase 1 complete. Runs alongside Phase 3 Task 1.
**Risk:** an agent wanders outside its files. Mitigation: ownership is stated in each prompt and checked with `git status` before merging; a file outside the track's folders is reverted and reported.
**Security:** agents never read `.env`; no package installs (all dependencies came in Phase 1).

All paths are under `baseline/`. Tasks 1 to 3 are track B and run in order. Task 4 is track F and runs at the same time as Tasks 1 to 3. Each task ends with lint, test and build of its projects, reported with real output. Wall time per track is logged with `runs/tools/log.mjs`.

### Task 1 (B): `libs/backend-common`

**Files:**
- Create under `libs/backend-common/src/lib/`: `config/database-env.schema.ts`, `config/typeorm-config.service.ts`, `config/redis-connection.config.ts`, `config/nats-options.ts`, `nats/nats-client.module.ts`, `nats/nats-request.util.ts`, `errors/exception.helper.ts`, `errors/rpc-exception.filter.ts`, `health/health.service.ts`, `entities/room.entity.ts`, `database/data-source.ts`, `database/migrations/index.ts`, `database/migrations/1731200000000-create-rooms.ts`, `database/migrations/1731200000001-seed-rooms.ts`; plus `project.json` (with `migration:run` and `migration:revert` run-commands targets), `src/index.ts`
- Test: a `*.spec.ts` next to `exception.helper.ts`, `rpc-exception.filter.ts`, `nats-request.util.ts`

**Interfaces:**
- Consumes: `ErrorCodeEnum`, `ServiceNameEnum` from `@roombook/contract`.
- Produces:
  - `NATS_CLIENT = 'NATS'` injection token; `NatsClientModule` (global) registering it with `ClientsModule` and `Transport.NATS`.
  - `natsServerOptions(service: ServiceNameEnum): MicroserviceOptions` (queue group = service name).
  - `NatsRequestUtil.send<TResult, TInput>(client: ClientProxy, pattern: string, data: TInput): Promise<TResult>`: `lastValueFrom` with a 5 s timeout and **no retry**; a timeout or a missing responder becomes `ExceptionHelper.serviceUnavailable(ErrorCodeEnum.SERVICE_UNAVAILABLE, …)` (503).
  - `ExceptionHelper.badRequest | notFound | conflict | unprocessable | serviceUnavailable(errorCode: ErrorCodeEnum, message: string): never`, each throwing `RpcException` with `{ statusCode, errorCode, message }`.
  - `RpcExceptionFilter` (gateway): answers `statusCode` with the `ErrorResponseDto` body; an unknown error becomes 500.
  - `TypeOrmConfigService`, `redisConnectionConfig(config: ConfigService)`, `HealthService.check(): { status: 'ok'; service: string }`.
  - `RoomEntity` (`rooms`: `id` uuid, `name` unique, `capacity` int, `created_at`). The seed inserts 12 rooms named `Room 01` to `Room 12`, capacities 2 to 24.

- [x] **Step 1:** Write failing specs: `ExceptionHelper.notFound(ErrorCodeEnum.ROOM_NOT_FOUND, 'x')` throws an `RpcException` whose error is `{ statusCode: 404, errorCode: 'NOT_FOUND.ROOM', message: 'x' }`; the filter writes that status and body, and 500 for a plain `Error`; `NatsRequestUtil.send` rejects with a 503 `UNAVAILABLE.SERVICE` when the observable times out (use fake timers and `NEVER`).
- [x] **Step 2:** Run `pnpm nx test backend-common` → FAIL.
- [x] **Step 3:** Implement. Config reads names only (design: Phase 1 Task 2 list).
- [x] **Step 4:** Run test, lint, build for `backend-common` → pass. With the compose stack up, run `pnpm run migration:run` → the `rooms` table holds 12 rows.
- [x] **Step 5:** Commit `feat: add backend common lib with rooms schema`.

### Task 2 (B): `apps/room`, `apps/booking`, `apps/worker` skeletons and the gateway shell

**Files:**
- Create per NATS app (`room`, `booking`, `worker`): `project.json`, `webpack.config.js`, `tsconfig*.json`, `jest.config.ts`, `src/main.ts`, `src/app/app.module.ts`, `src/app/app.controller.ts`, `src/app/app.controller.spec.ts`
- Create for `gateway`: the same plus `src/health/health.controller.ts` and its spec
- `apps/booking` imports TypeORM (no entity yet) and `BullModule.forRootAsync`; `apps/worker` imports `BullModule.forRootAsync` and has no database.

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: each NATS app answers its `HealthPatternEnum` pattern with `HealthService.check()`. Gateway: global prefix `api`, global `ValidationPipe({ transform: true, whitelist: true })`, global `RpcExceptionFilter`, CORS for the web origin from config; `GET /api/health/gateway` answers directly, `GET /api/health/{booking,room,worker}` proxies the pattern through `NatsRequestUtil.send`.

- [x] **Step 1:** Write failing specs: each `app.controller.spec.ts` asserts the health handler returns `{ status: 'ok', service: '<name>' }`; `health.controller.spec.ts` asserts the proxy calls `send` with the right pattern and (Review Focus 2) that a rejected `send` surfaces as the 503 exception.
- [x] **Step 2:** Run `pnpm nx run-many -t test -p room booking worker gateway` → FAIL.
- [x] **Step 3:** Implement the four apps. Targets per app: `build` (`@nx/webpack:webpack`, `target: node`, `compiler: tsc`), `serve` (`@nx/js:node`), `lint`, `test`.
- [x] **Step 4:** Run lint, test, build for the four apps → pass.
- [x] **Step 5:** Commit `feat: add service skeletons with health endpoints`.

### Task 3 (B): room list with the planted bug

**Files:**
- Create: `apps/room/src/room/room.module.ts`, `room.controller.ts`, `room.service.ts`, `room.repository.ts` and a spec for each; `apps/gateway/src/room/room.module.ts`, `room.controller.ts`, `room.controller.spec.ts`

**Interfaces:**
- Produces: `RoomRepository.findPage(query: PageQueryDto): Promise<PagedRoomsDto>` and `findById(id: string): Promise<RoomDto | null>`; patterns `RoomPatternEnum.LIST` and `FIND_BY_ID` (not found → `ExceptionHelper.notFound(ErrorCodeEnum.ROOM_NOT_FOUND, …)`); `GET /api/rooms` taking `PageQueryDto` as query.

- [x] **Step 1:** Write failing specs. Repository spec (mocked `Repository<RoomEntity>`): `findPage({ page: 1, limit: 10 })` calls `findAndCount` with `skip: 0, take: 10, order: { name: 'ASC' }`; `findPage({ page: 2, limit: 10 })` uses `skip: 10`. **Do not add a case with a non-default limit on page 2.** Gateway controller spec: forwards the query to `RoomPatternEnum.LIST`. Review Focus 1: an e2e-style spec on the gateway controller with the real `ValidationPipe` rejects `page=0`, `limit=101`, `limit=abc` with 400.
- [x] **Step 2:** Run the room and gateway tests → FAIL.
- [x] **Step 3:** Implement. **The planted bug (design §6.3), exactly this line in `room.repository.ts`:** `skip: (query.page - 1) * DEFAULT_PAGE_SIZE`. Leave no comment or hint about it anywhere in the repo.
- [x] **Step 4:** Run lint, test, build for `room` and `gateway` → pass.
- [x] **Step 5:** Commit `feat: add room list`.

### Task 4 (F): `apps/web`

**Files:**
- Create: `apps/web/project.json`, `next.config.js`, `tsconfig*.json`, `jest.config.ts`, `.eslintrc.json`, `src/pages/_app.tsx`, `_document.tsx`, `index.tsx`, `src/pages/rooms/index.tsx`, `src/views/rooms/rooms-table.tsx`, `src/services/api-client.ts`, `src/services/room.service.ts`, `src/layouts/app-layout.tsx`, and specs for `rooms-table`, `rooms/index` and `room.service`

**Interfaces:**
- Consumes: `PagedRoomsDto`, `RoomDto`, `ApiRouteEnum`, `ErrorResponseDto` from `@roombook/contract`.
- Produces: `apiClient` (axios instance, `baseURL` from `NEXT_PUBLIC_API_URL`); `ApiError` class `{ statusCode; errorCode; message }` thrown by the client for error responses; `listRooms(page: number, limit: number): Promise<PagedRoomsDto>`; `AppLayout` with a nav holding "Rooms" (a "Bookings" link is added by the kits); the `/rooms` page: an MUI table (name, capacity), pager, and a rows-per-page select offering 5 and 10, default 10.

- [x] **Step 1:** Write failing specs with the service layer mocked: the page renders the 10 rows returned for page 1; choosing 5 per page then "next" calls `listRooms(2, 5)`; a rejected call shows the `ApiError` message.
- [x] **Step 2:** Run `pnpm nx test web` → FAIL.
- [x] **Step 3:** Implement. Targets: `build` (`@nx/next:build`), `serve` (`@nx/next:server`), `lint`, `test`.
- [x] **Step 4:** Run `pnpm nx lint web`, `pnpm nx test web`, `pnpm nx build web` → pass.
- [x] **Step 5:** Commit `feat: add web app with rooms page`.

### Task 5 (join): integrate, verify, tag

- [x] **Step 1:** `git status` shows nothing outside the two tracks' folders. Run `pnpm run build`, `pnpm run lint`, `pnpm run test` → all exit 0; record the counts.
- [x] **Step 2:** Run `scripts/stack-reset.sh` → exit 0. `curl` each of the four health routes → 200.
- [x] **Step 3:** In the browser, open `/rooms`: page 1 shows `Room 01` to `Room 10`; with 5 per page, page 2 shows `Room 11` and `Room 12` (the bug, visible as designed).
- [x] **Step 4:** Run the acceptance suite (Phase 3 Task 1) against the gateway. Expected baseline state, exactly: `baseline/` group all pass; `change-3/` fails; `change-1/` and `change-2/` fail with 404s. Any other result is a defect to fix in the baseline or the suite **before** the tag.
- [x] **Step 5:** Confirm the briefs (Phase 3 Task 3) exist. Then `git tag baseline-v1`, and record the commit hash, the test counts and the acceptance result in `runs/baseline.json`. From here the briefs and `acceptance/` are frozen.
- [ ] **Step 6:** Present the baseline to the owner (owner review gate) before Phase 4.

**Success criteria:** all three root targets green; the tag exists; `runs/baseline.json` written; the bug reproduces in the browser and in `change-3/`.
