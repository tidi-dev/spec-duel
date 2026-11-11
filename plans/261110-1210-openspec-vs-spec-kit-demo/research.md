# Research: OpenSpec vs GitHub Spec Kit demo on a mini Acme-shaped repo

**Date:** 2026-11-10
**Method:** read-only. Nothing was installed, built or executed from either kit. Both kit repos were shallow-cloned at their release tags (git hooks disabled) into the session scratchpad and read. Acme was read for structure only; no `.env*`, key or credential file was opened and no business logic was copied.
**Reused, not repeated:** the security audit in `/workspace/main-product/plans/261109-1640-acme-1-openspec-evaluation/research.md` (called "the audit" below).

**Provenance of the tags.** `[Verified]` means the cited file, command output or page was read in this session. Most reads were done by four research subagents; where I re-checked a claim myself it is marked `[Verified, re-checked]`. `[Assumption]` names what would verify it. File paths in section 3.2 and 3.3 are relative to the kit's release tag; paths in section 2 are relative to `/workspace/main-product`.

---

## 1. Problem understanding

**Question.** How do OpenSpec and Spec Kit compare, hands-on, when each implements the same workload on the same small codebase, and which fits Acme?

**Requirement behind it.** ACME-1 asks for an evaluation with a working sample. The audit answered "is it safe"; this demo answers "what is it like to use, and what does it cost in process".

**Decision this research supports.** The demo design (Phase 2): what the mini repo contains, how the two runs are isolated and measured, and which versions are pinned.

**Constraints.** 4 to 5 services, not a copy of Acme's ~14 apps. Synthetic domain. Local git only. Same model, brief and baseline commit for both kits.

**Owner decisions already made (2026-11-10).** Pin Spec Kit `specify-cli==1.3.3`. Keep OpenSpec `@fission-ai/openspec@1.16.1`.

**Out of scope.** A second security audit; choosing the synthetic domain (Phase 2); any install (Phase 3).

## 2. Existing implementation and architecture

### 2.1 Stack versions to mirror

[Verified, re-checked] From `package.json` and `node_modules/<pkg>/package.json`:

| Package | Declared | Installed |
|---|---|---|
| nx, @nx/nest, @nx/next | 18.1.2 | 18.1.2 |
| @nestjs/core, @nestjs/microservices | 11.0.20 | 11.0.20 |
| @nestjs/bullmq | ^11.0.2 | 11.0.4 |
| @nestjs/typeorm / config / terminus | ^11.0.0 / ^4.0.2 / ^11.0.0 | not checked |
| next / react | 15.5.28 / 18.2.0 | 15.5.28 / 18.2.0 |
| typeorm | 0.3.22 | 0.3.22 |
| bullmq | ^5.49.2 | **5.79.1** |
| nats | ^2.29.3 | 2.29.3 |
| typescript / jest | ^5.8.3 / ^29.7.0 | 5.9.3 / 29.7.0 |
| eslint / prettier | ~8.57.1 / ^3.5.3 | not checked |
| class-validator / class-transformer | ^0.14.1 / ^0.5.1 | not checked |
| @mui/material / axios | ^5.15.14 / 1.8.4 | not checked |

Local toolchain [Verified, re-checked]: Node 24.22.1, npm 11.19.1, pnpm 11.9.0, Docker 27.4.0, git 2.41.0, Python 3.12.6. `uv` and `pipx` are not installed.

### 2.2 How Acme wires the shape the demo copies

[Verified] by a read-only sweep of `apps/admin-api`, `apps/admin`, `apps/tenant`, `apps/worker`, `apps/admin-fe` and the libs they use.

- **Transport is NATS JetStream, not plain NATS.** Services use `@nestjs-plugins/nestjs-nats-jetstream-transport` (`package.json:55`); the plain `Transport.NATS` helpers are marked deprecated (`libs/config/src/lib/nats.ts:6,19`). The client is a global `'NATS'` provider (`libs/async-events/src/lib/modules/nats-client.module.ts:12-21`).
- **Gateway → service.** Controllers and services call `client.send(<DomainEventEnum>.X, dto)` with `lastValueFrom`, and re-wrap errors as `RpcException` (`apps/admin-api/src/terms-and-condition/terms-and-condition.controller.ts:100-105`). A wrapper adds a 300 s timeout and up to 5 retries with backoff (`libs/async-events/src/lib/utils/clientproxy.util.ts:67-103`). **Those retries are a real source of duplicate creates**, which is what the idempotent-create workload models.
- **Domain service bootstrap.** `NestFactory.createMicroservice` with a durable consumer and deliver group named after the service (`apps/admin/src/main.ts:8-11`, `libs/config/src/lib/jetstream.ts:64-81`). Handlers are `@MessagePattern(<Enum>)` on thin controllers (`apps/admin/src/terms-and-condition/terms-and-condition.controller.ts:12-26`). Pattern names are string enums, `'<domain>:<verbNoun>'` (`libs/enums/src/lib/event-enum.ts:31-40`).
- **Layering.** Feature folder = module, controller, service, repository, co-located specs. Repositories are plain `@Injectable` classes injecting `Repository<Entity>` and `DataSource`; transactions use an explicit QueryRunner with commit, rollback and `release` in `finally` (`apps/admin/src/terms-and-condition/terms-and-condition.repository.ts:14-58`).
- **Validation and errors.** class-validator DTOs live in a shared lib and are reused by gateway, NATS handlers and frontend. The `ValidationPipe({ transform, whitelist })` runs only at the gateway (`apps/admin-api/src/main.ts:39`). Domain code throws `RpcException(new XxxException({ message, errorCode, statusCode }))` (`libs/helpers/src/lib/exception.helper.ts:24-67`); a gateway filter maps `statusCode` to the HTTP status (`libs/filters/src/lib/exception.filter.ts:4-13`).
- **TypeORM.** Shared `TypeOrmConfigService`, `forRootAsync`, `synchronize` never on, explicit snake_case names, uuid keys (`libs/config/src/lib/typeorm.ts:6-37`). Migrations live in one lib, registered through an array, run by `nx:run-commands` targets and `migration:*` root scripts (`libs/data-hub/project.json`, `package.json:21-24`). The gateway has no database access.
- **BullMQ.** `BullModule.forRootAsync` with a shared Redis config; `registerQueue({ name: QueueEnum.X, prefix })`; `@Processor(name, { concurrency })` extending `WorkerHost` (`apps/worker/src/worker.module.ts:143-195`, `apps/worker/src/email/email-queue.consumer.ts:17-40`). Job options in use: `jobId`, `attempts` (3 or 10), exponential `backoff`, `removeOnComplete`, `removeOnFail`, `priority`, `delay`. **The `deduplication` option is not used anywhere**; de-dup is done with a deterministic `jobId` (`apps/worker/src/anomaly/statistical-detector.service.ts:28-53`).
- **Existing idempotency pattern.** A UUID `idempotencyKey` **body field**, a Redis `SET key EX 30 NX` lock, 409 on conflict, key deleted in `finally` (`apps/tenant/src/tenant/tenant.service.ts:210-250`). It is a short lock, not a stored-response replay, and it is not a header. The demo workload (header plus stored response) is therefore a step beyond what Acme does today.
- **Health.** `GET /api/health/<svc>` on the gateway through terminus, which proxies an `@MessagePattern(<SVC>_HEALTH)` on each NATS service (`apps/admin-api/src/app/app.controller.ts:10-47`, `apps/admin/src/app/app.controller.ts:12-15`).
- **Config.** Joi-validated `ConfigModule.forRoot` per app (`apps/admin/src/app/app.module.ts:27-38`). Env names: `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE`, `REDIS_HOST/PORT/PASSWORD`, `NATS_LAYER1_URL`.
- **Infra.** `docker-compose.yml`: `postgres:15`, `redis:7.2-rc3`, `nats:2.10-alpine` with JetStream. No `depends_on` or healthchecks; Tilt drives it.
- **Frontend.** Next 15 Pages Router; `pages/<feature>/list.tsx`, `new.tsx`, `[id]/view.tsx`. Static `BaseApiService` on axios, feature services as exported async functions, a `useApiCall()` hook (`apps/admin-fe/src/services/base-api.service.ts:24-80`, `src/hooks/useApiCall.tsx:6-44`). MUI 5, react-hook-form + yup. Jest is configured but there are **no spec files** under `apps/admin-fe/src`.
- **Nx.** No plugins; every target is explicit in `project.json`: `@nx/webpack:webpack` + `@nx/js:node` for Nest apps, `@nx/js:tsc` for libs, `@nx/next:*`, `@nx/jest:jest`, `@nx/linter:eslint`. Aliases `@acme/<lib>` → `libs/<lib>/src/index.ts`. Legacy `.eslintrc.json`, Prettier `printWidth 120`, pnpm with a hoisted linker.
- **Tests.** Unit specs next to source with `Test.createTestingModule` and `jest.fn()` mocks. API e2e apps need the whole stack running and connect straight to Postgres.

### 2.3 The demo's own `.claude/` kit

[Verified, re-checked] It began as a byte-identical copy of Acme's `.claude/`. The approved Phase 0 edits removed archify and the outward-facing commands and agent, rewrote `CLAUDE.md` and `docs/agents/*`, and fixed rule paths (recorded in `.claude/skills/THIRD-PARTY-SKILLS.md`). `settings.local.json` now holds a small demo allowlist (11 rules; no installs, no push, no reads outside the demo). Still open: `nextjs-fe-developer` waits for the design.

[Verified] The shared-kit agents `backend-developer`, `nestjs-expert`, `tester`, `planner`, `researcher` and `fullstack-developer` are already available in a session started in the demo root, without copying. [Assumption] They remain available in a session started in a nested workspace folder; to verify, start a session there and list agents.

## 3. Findings

### 3.1 Fair benchmark method

Cited facts:
- [Verified] METR's randomised trial (arXiv:2507.09089): 16 developers, 246 tasks; developers estimated AI made them about 20% faster while measured completion time was 19% slower. Self-report is unreliable; measure time.
- [Verified, abstract only] "AI Agents That Matter" (arXiv:2407.01502): report cost together with accuracy, keep a holdout, standardise the harness.
- [Verified] Aider leaderboards (https://aider.chat/docs/leaderboards/): each run records pass rate, cost, the commit hash and the command used.
- [Verified, abstract only] SWE-bench (arXiv:2310.06770): tasks are a repository snapshot plus an issue. The use of hidden fail-to-pass tests was not confirmed from the abstract.

Claude Code measurement:
- [Verified] `claude -p --output-format json` returns `result`, `session_id`, `usage` and `total_cost_usd` (https://code.claude.com/docs/en/headless). A resumed run reports the whole conversation's total, so resumed runs must not be summed.
- [Verified] `/usage` shows total cost, API and wall duration and usage per model, and resets on `/clear` (https://code.claude.com/docs/en/costs).
- [Verified] OpenTelemetry metrics `claude_code.token.usage` and `claude_code.cost.usage` exist behind `CLAUDE_CODE_ENABLE_TELEMETRY=1` (https://code.claude.com/docs/en/monitoring-usage).
- [Assumption] The JSON output also carries `num_turns` and `duration_ms`. To verify: one headless call.

Recommended protocol (my proposal, not a cited standard):
- **Controlled:** one baseline commit (tagged); one brief text file used verbatim; same model ID and effort; a fresh session per kit run with no shared conversation; identical helper agents and skills; empty Postgres and Redis at the start of each run.
- **Frozen acceptance suite:** an HTTP-level e2e suite derived from the contract, written and committed to the baseline before either run, and not edited afterwards. Both variants are scored against it.
- **Objective metrics:** acceptance tests passed; build, lint and unit results; files and lines the kit generated; turns, tokens, cost and wall time; count of human interventions.
- **Judgement metrics, reported separately:** spec quality, requirement-to-test traceability, PR reviewability, learning curve, rule adherence beyond what lint catches.
- **Human interventions:** every operator message after the brief that is not a plain approval at a kit-defined gate (answers, corrections, manual fixes, re-prompts), counted by category. Gate approvals are counted on their own line.
- **Order bias:** declare the run order before starting. The second run benefits from what the operator saw in the first; state it as a limitation.
- **Limitations to state in the report:** N=1 per kit, one operator, one model, no variance estimate.

### 3.2 OpenSpec at 1.16.1

- [Verified] `1.17.0` was published 2026-11-09, after the audited `1.16.1` (2026-11-07). In the paths compared (schemas, skills, workflow templates, CLI index, profiles, Claude adapter, telemetry opt-out, `feedback`, `install`) the two are identical; `1.17.0` changes `src/core/init.ts` and deprecates command files in favour of skills (`CHANGELOG.md:3-5` at v1.17.0). The comparison did not cover every file. Owner decision: stay on 1.16.1.
- [Verified] Requires Node `>=22.12.0` (npm metadata). The local Node 24.22.1 satisfies it.
- [Verified] Non-interactive init: `openspec init <path> --tools claude --profile core` (`src/cli/index.ts:262-270`). `core` is also the default profile (`src/core/global-config.ts:47`). No git repository is required (no git check in `src/core/init.ts`).
- [Verified] Files written for Claude with the default delivery `both`:
  - `.claude/skills/openspec-{propose,explore,apply-change,update-change,sync-specs,archive-change}/SKILL.md`
  - `.claude/commands/opsx/{propose,explore,apply,update,sync,archive}.md`
  - `openspec/config.yaml` (`schema: spec-driven`), `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/`
  - Every skill and command carries `allowed-tools: Bash(openspec:*)` (`src/core/command-generation/adapters/claude.ts:25-31`).
  - It does not write `.claude/settings.json`, hooks, or root `CLAUDE.md` / `AGENTS.md`.
- [Verified] Outside the project: a random telemetry id is stored in `~/.config/openspec/config.json` when telemetry is enabled (`src/telemetry/index.ts:109-125`). Opt-out is `OPENSPEC_TELEMETRY=0` or `DO_NOT_TRACK=1` (`src/telemetry/index.ts:68-69`).
- [Verified] Workflow. `/opsx:propose` creates `openspec/changes/<name>/` with `proposal.md`, `specs/**/spec.md` deltas, an optional `design.md` and `tasks.md` (`schemas/spec-driven/schema.yaml:50-266`). `/opsx:apply` works through `tasks.md` and ticks checkboxes. `/opsx:archive` moves the change to `openspec/changes/archive/YYYY-MM-DD-<name>/` and merges deltas into `openspec/specs/` at requirement level (`src/core/specs-apply.ts:121-1251`).
- [Verified] Spec format: `### Requirement:` with SHALL or MUST, at least one `#### Scenario:` with WHEN and THEN; delta sections `ADDED`, `MODIFIED` (full block copied), `REMOVED`, `RENAMED` (`schemas/spec-driven/schema.yaml:96-117`).
- [Verified] `tasks.md` template is numbered groups of checkboxes with **no parallel marker**; a grep for `[P]` across schemas and templates finds nothing.
- [Verified] CI gate without an agent: `openspec validate` with `--all`, `--changes`, `--specs`, `--strict`, `--json`; exit 0 on pass, 1 on failure (`src/commands/validate.ts:367-736`). It checks structure (SHALL/MUST, scenarios present, delta conflicts, checkbox format), not behaviour.
- [Verified] Brownfield: a behaviour change is a `MODIFIED` delta. Small changes: `skip_specs: true` in the change's `.openspec.yaml` or `archive --skip-specs`. The fast-forward command `/opsx:ff` is only in the expanded profile, not `core`. The docs tell users to run a full proposal for a bugfix (`docs/examples.md:47-60`) and say the ceremony is not worth it for a typo (`docs/faq.md:17`).
- [Verified] Project rules can be injected through `openspec/config.yaml`: `context` (all artifacts) and `rules` per artifact (`src/core/project-config.ts:34-84`).
- [Verified] The docs say nothing about subagents, parallel task execution or token and time metrics. A maintainer note in the repo (`openspec-parallel-merge-plan.md`) describes two changes that MODIFY the same requirement overwriting each other at archive; a guard at `src/core/specs-apply.ts:563` now raises an error in that case.
- Security posture: unchanged from the audit (sections 3.1 O1 to O10). The risky subcommands are still `feedback` (`src/cli/index.ts:700`) and `install` (`src/cli/index.ts:455`).

### 3.3 Spec Kit at 1.3.3

- [Verified] `v1.3.3` was released 2026-11-09 and is on PyPI as `specify-cli==1.3.3`; it requires Python `>=3.11`.
- [Verified, re-checked] **Audit gap.** The audit covered commit `c438494` (1.3.3.dev0). Between it and the `v1.3.3` tag, `git diff --stat` shows 46 files changed; the source changes are workflow-engine dispatch settings (`src/specify_cli/integrations/base.py`, `workflows/step/_dispatch_settings.py`), safer file deletion in preset cleanup, and stricter JSON parsing in the shell step. A keyword scan of the added source lines found no new network, subprocess, hook, `settings.json` or telemetry code.
- [Verified, re-checked] **Delta read line by line (owner request, 2026-11-10).** All 16 changed files under `src/`, `presets/` and `workflows/` plus `pyproject.toml` were read (752 added, 46 removed lines). Tests and docs in the delta were not read.
  - `integrations/base.py`, `workflows/step/_dispatch_settings.py`, `step/command`, `step/prompt`, `workflows/engine.py`, `base.py`, `_execution.py`: a workflow step may request `reasoning_effort` or `context_size` for the CLI it dispatches. Values must match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, so they cannot inject flags or shell characters, and an integration that does not declare support rejects them. The Claude integration file is unchanged, so it declares none. This code runs only under `specify workflow run`, which the demo does not use.
  - `integrations/_file_changes.py`, `presets/_manager_skills.py`: preset removal now deletes one generated file under a checked root without following symlinks, where it used to `rmtree` the folder. This narrows the risk.
  - `workflows/expressions/*`: `==` and `!=` now coerce numeric strings like the ordering operators. `step/shell/__init__.py`: rejects `NaN`/`Infinity` JSON constants.
  - `presets/catalog.community.json`, `workflows/catalog.community.json`: one preset version bump and one new community workflow entry. They are data and are fetched only if a user installs from the community catalog, which the demo will not.
  - `pyproject.toml`: version string only; dependencies unchanged.
  - **Result:** nothing in the delta changes what a plain Claude `init` writes, and nothing adds network access, hooks or telemetry.
  - [Assumption] The PyPI wheel for 1.3.3 matches the tag. To verify in Phase 3: compare the installed package files with the tag's `src/specify_cli/`.
- [Verified] Isolated install without `uv`: the docs give `uv tool install specify-cli==1.3.3` and `pipx install specify-cli==1.3.3`. [Assumption] `python3 -m venv <dir> && <dir>/bin/pip install specify-cli==1.3.3` works equally; to verify, run it in Phase 3. The install pulls dependencies from PyPI (typer, mcp, pydantic and others); `init` itself needs no network because templates are bundled in the wheel.
- [Verified] Non-interactive init: `specify init --here --force --non-interactive --integration claude --integration-options="--events false"`. `--events` is not an init flag; it is passed inside `--integration-options` (`src/specify_cli/command_init.py:269-360`, `integrations/base.py:419-426`). `--ai` and `--no-git` do not exist. `--ignore-agent-tools` skips the check for a `claude` binary.
- [Verified] Init never runs git: no branch, no commit. Branch-per-feature lives in an opt-in git extension.
- [Verified] Files written for Claude:
  - `.claude/skills/speckit-{analyze,checklist,clarify,constitution,converge,implement,plan,specify,tasks}/SKILL.md` (nine skills, no `.claude/commands/`)
  - `.specify/memory/constitution.md`, `.specify/templates/*.md` (5), `.specify/scripts/bash/*.sh` (6), `.specify/workflows/speckit/workflow.yml`, `.specify/init-options.json`, `.specify/integration.json`, `.specify/integrations/speckit.manifest.json`, `.specify/.gitignore`
  - Skills carry no `allowed-tools`; `disable-model-invocation: true` only with `--no-model-invocation`.
  - By the source, a plain Claude init writes nothing to `.claude/settings.json` because the Claude integration declares no events (`events/__init__.py:1390-1393`). The hands-on install must confirm it.
- [Verified] Workflow (Claude names are `/speckit-<cmd>`): `constitution` writes the constitution; `specify` writes `specs/NNN-<slug>/spec.md` and `checklists/requirements.md`; `clarify` updates the spec with up to five questions; `plan` writes `plan.md`, `research.md`, `data-model.md`, `quickstart.md` and `contracts/`; `tasks` writes `tasks.md`; `implement` executes tasks and marks them `[X]`. `analyze` is read-only and reports in chat. `converge` is a ninth command not in the brief; it may append tasks.
- [Verified] `tasks.md` format: `- [ ] T001 [P] [US1] description with file path`; `[P]` means "different files, no dependencies" (`templates/commands/tasks.md:154-173`). `implement` says parallel tasks "can run together" but not how; the docs suggest telling the agent to delegate `[P]` tasks to sub-agents (`docs/how-to/complex-features.md:37-57`). Tests are optional in the template unless requested.
- [Verified] **No agent-free CI gate.** `specify check` only verifies that tools are installed (`command_check.py:44-45`); nothing validates `spec.md`, `plan.md` or `tasks.md` without an agent. Constitution gates are prompt text.
- [Verified] Brownfield: create a new numbered feature spec or revise an existing one; core has no command that reconciles spec, plan and tasks after a change (`docs/how-to/evolving-specs.md:26-42`). Bugfix: the docs say no feature workflow is needed; a dedicated bug flow exists only as an opt-in extension (`docs/guides/bugfix.md`).
- [Verified] Project rules go in the constitution as principles; plan, tasks, checklist, implement and analyze read it. Nothing enforces them mechanically.
- [Verified] No token, time or cost metrics in the docs.

### 3.4 Idempotent create

- [Verified] IETF draft `draft-ietf-httpapi-idempotency-key-header-08` (2026-10-22, https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). It is an Internet-Draft, not an RFC. The header value is a structured-field String; a UUID is recommended. Behaviour: missing key where required → 400; same key while the first request is in progress → 409; same key with a different payload → 422; a completed request repeated with the same key and payload → a response consistent with the original. Expiry and fingerprinting are left to the resource, which should publish its policy.
- [Verified] Stripe (https://docs.stripe.com/api/idempotent_requests) stores the status code and body of the first request and replays them, including 500s; keys are prunable after 24 hours; validation failures are not stored.
- [Verified] Postgres `INSERT ... ON CONFLICT DO NOTHING` skips the row, and `RETURNING` returns only rows actually inserted (https://www.postgresql.org/docs/current/sql-insert.html).
- [Verified, re-checked] TypeORM 0.3.22 exposes `orIgnore()` on the insert query builder (`node_modules/typeorm/query-builder/InsertQueryBuilder.d.ts:72`); `InsertResult` carries `identifiers`, `generatedMaps` and `raw`. [Assumption] A skipped insert yields an empty `raw`; to verify, a repository spec against real Postgres.
- [Verified, re-checked] `@nestjs/microservices` 11.0.20 has no built-in timeout on `client.send()` (no match for `timeout` in `client/client-proxy.js` or `client-nats.js`). A gateway-side timeout followed by a retry can therefore create twice unless the create is idempotent.

### 3.5 BullMQ retry and de-duplication (5.79.1)

- [Verified, re-checked] Custom `jobId`: adding a job whose id already exists does not add it; BullMQ emits a `duplicated` event and returns the existing id (`node_modules/bullmq/dist/cjs/commands/addStandardJob-9.lua:88-92`, `includes/handleDuplicatedJob.lua`). It only de-duplicates while the earlier job's key still exists, so `removeOnComplete: true` reopens the window.
- [Verified] `deduplication: { id, ttl?, extend?, replace?, keepLastIfActive? }` (`dist/esm/types/deduplication-options.d.ts:4-38`); `debounce` is the deprecated alias (`job-options.d.ts:6-16`). Modes: simple (until the job finishes), throttle (`ttl`), debounce (`delay` + `ttl` + `extend` + `replace`) (https://docs.bullmq.io/guide/jobs/deduplication).
- [Assumption] `deduplication` exists at 5.49.2, the floor of Acme's range. Not confirmed. Pinning the demo to the installed 5.79.1 removes the question.
- [Verified, re-checked] `attempts` defaults to 1 (`dist/esm/interfaces/base-job-options.d.ts:26-29`). Backoff types are fixed and exponential, with optional `jitter` (`backoff-options.d.ts:6-19`). `UnrecoverableError` stops retries (`unrecoverable-error.d.ts:9`).
- [Assumption] Jobs can run more than once after a stall or worker crash, so the processor itself must be idempotent. Standard BullMQ guidance, not confirmed on the pages read.
- [Verified, re-checked] `@nestjs/bullmq` 11.0.4: `WorkerHost.process(job, token?)` (`dist/hosts/worker-host.class.d.ts:5`), `@Processor`, `@InjectQueue`, `@OnWorkerEvent`.

## 4. Approaches and trade-offs

**A. Transport between services**

| Option | Fit with Acme | Cost in the demo |
|---|---|---|
| A1. Plain `Transport.NATS` with a queue group | Same request/reply programming model; Acme marks it deprecated | Built into `@nestjs/microservices`; no extra dependency |
| A2. JetStream plugin, as Acme runs | Exact match | A third-party transport package to vet under security rule §4, plus stream setup |

**B. Idempotency design**

| Option | Behaviour | Trade-off |
|---|---|---|
| B1. `Idempotency-Key` header, key claimed and resource inserted in one Postgres transaction in the domain service, stored response replayed | Matches the brief and the IETF draft; atomic | A table, a request hash and a migration; a step beyond Acme's pattern |
| B2. Acme's pattern: body field plus a 30 s Redis `SET NX` lock | Familiar | Not a header, no stored response, a duplicate after 30 s creates again; does not meet the brief |
| B3. Store at the gateway | HTTP concern stays at the edge | Gateway has no database; not atomic with the insert |

**C. Job de-duplication**

| Option | Trade-off |
|---|---|
| C1. Deterministic `jobId` (resource id) with `attempts` and exponential backoff | Acme's pattern; de-dup lasts only while the job is retained |
| C2. `deduplication: { id, ttl }` | Purpose-built; not used in Acme; unconfirmed at the 5.49.2 floor |

**D. Workspace isolation**

| Option | Trade-off |
|---|---|
| D1. Sibling full clones `openspec-variant/` and `speckit-variant/` of a baseline repo | Fully separate `.git` and `.claude/`; kits cannot see each other; simple to diff against the baseline tag |
| D2. Git worktrees of one repo | Less disk; shared `.git` and branch namespace, and both worktrees sit under one repo's hooks and config |

**E. How each kit run is driven and measured**

| Option | Trade-off |
|---|---|
| E1. Headless `claude -p --output-format json` per kit step, started in the variant folder | Fresh context per step, real slash-command loading from that workspace, cost and usage captured per step; gate answers are passed as the next prompt |
| E2. This session reads the kit's command files and follows them, or dispatches subagents | No new tooling; but the kit's skills are not loaded the way a user's session loads them, and per-kit token cost cannot be separated cleanly |

## 5. Recommendation

- **Versions.** Mirror the installed versions in section 2.1 exactly, including `bullmq@5.79.1`. OpenSpec `1.16.1` and Spec Kit `1.3.3` as decided.
- **Transport: A1**, with the choice recorded as a deliberate simplification. It keeps the `client.send` / `@MessagePattern` model the demo is about and avoids a third-party review that adds nothing to the comparison.
- **Idempotency: B1.** The gateway requires the header and forwards the key in the NATS payload; the domain service claims the key and inserts the resource in one transaction, and replays the stored response.
- **Job de-duplication: C1**, with `attempts: 3` and exponential backoff, matching Acme. Keep C2 as an open design question if the owner wants the newer option exercised.
- **Isolation: D1.**
- **Driving the runs: E1**, because it is the only option that loads each kit the way a developer would and yields per-kit cost. It needs the owner's agreement, since it starts additional Claude sessions.
- **Method.** The protocol in section 3.1, with the acceptance suite frozen in the baseline.
- **Simplifications to mirror or skip** follow section 2.2: keep the layering, enums, DTO lib, error mapping, QueryRunner transactions, Joi config, health pattern and explicit Nx targets; skip JetStream streams, the second NATS layer, Mongo, TLS branches, CASL, i18n, Tilt and flow producers.

## 6. Risks and edge cases

- **Kit released after its audit.** Spec Kit 1.3.3 is newer than the audited commit. Mitigation: the source delta was read line by line (section 3.3); the wheel-versus-tag comparison remains for Phase 3.
- **Deny rule may not override `allowed-tools`.** Still the audit's open assumption. Mitigation: tested and recorded in Phase 3c.
- **Second-run advantage.** The operator and the acceptance suite are the same for both kits. Mitigation: fresh sessions, declared order, limitation stated.
- **Acceptance suite shapes the result.** A suite written with one kit's style in mind favours it. Mitigation: derive it only from the contract, before either run.
- **Parallel structure imposed on OpenSpec.** Its `tasks.md` has no parallel marker, so the split comes from the plan. That is a real difference to report, not to hide.
- **Shared rules do not all apply.** The rules in `/workspace/.claude/rules/` mention Prisma and `LikePatternHelper` from `@acme/helpers`. Mitigation: the design lists which rules are scored.
- **Headless runs and permissions.** A headless session cannot answer permission prompts. Mitigation: a per-variant allowlist limited to that workspace's build, test and kit commands, agreed in the design.
- **Spec Kit numbering without git.** `/speckit-specify` picks the next feature number itself; behaviour with no branch is untested. Mitigation: observe and record.

## 7. Suggested implementation plan

1. **Design (Phase 2).** Settle the synthetic domain, 4 or 5 services, options A to E, the scored rule set and the criteria table. Output: `design.md`. Proof: owner approval.
2. **Kit adaptation.** Replace `settings.local.json`; adapt `nextjs-fe-developer` to the designed frontend. Proof: diff reviewed.
3. **Gap analysis and installs (Phase 3).** Capability table; then per workspace the pinned kit, the hardening settings and a before/after file listing. Proof: file lists, deny-rule test output, `settings.json` unchanged by Spec Kit.
4. **Plan (Phase 4).** Contract lib first, then parallel backend and frontend tracks with owned files. Proof: owner approval.
5. **Baseline.** Nx workspace, `docker-compose.yml`, contract lib, gateway, domain service(s), worker and frontend with health endpoints only, plus the frozen acceptance suite. Proof: build, lint and unit tests green; acceptance suite red for the unbuilt features; baseline tagged.
6. **Two kit runs.** Feature, brownfield change and bugfix in each variant through that kit's own workflow. Proof: per-step JSON usage, artifacts, acceptance results, intervention log.
7. **Report.** `reports/openspec-vs-spec-kit-comparison.md`.

**Owner answers (2026-11-10)**
1. Transport: plain NATS (A1).
2. Driving the runs: "choose the best practice". Chosen: separate headless Claude sessions per kit step (E1).
3. Extra commands: "choose the best practice". Chosen: each kit runs its documented main path (OpenSpec propose → apply → archive; Spec Kit constitution → specify → clarify → plan → tasks → implement) plus its own quality gate once per change (`openspec validate --strict`; `/speckit-analyze`). Other commands (`explore`, `update`, `sync`, `converge`, `checklist`) are used only when the kit's own flow calls for them, and each use is logged.
4. Spec Kit's bug extension: not used for now. The report notes that opt-in bug extensions exist (`specify extension add bug`, and a bugfix workflow bundle).
5. `.claude/` in the baseline: "keep the project locally". Read as: commit it in the local baseline repository; nothing is pushed anywhere. To be confirmed in the design.
6. Spec Kit 1.3.3 delta: read line by line; see section 3.3.
