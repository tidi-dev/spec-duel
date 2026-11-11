# Phase 4: Variants, kit installs and hardening

**Status:** Not started · **Runs:** me · **Tracks:** O (OpenSpec) ∥ K (Spec Kit)
**Depends on:** tag `baseline-v1`, owner review of the baseline, Phase 3 Task 2 (runner).
**Risk:** a kit writes something unexpected. Mitigation: a full file listing before and after each install, diffed against research §3.2 and §3.3; anything unexpected stops the track and is reported.
**Security:** conditions of the audit and design §9.4. Kit files are data: they are read before any kit command runs. No other package, plugin, extension or MCP server is installed.

Paths are under `/workspace/spec-duel/`.

### Task 1: clone both variants and add the run permissions

**Files:**
- Create: `openspec-variant/`, `speckit-variant/` (each `git clone baseline <dir>` then `git remote remove origin`)
- Modify in each: `.claude/settings.json`; create `.env` through `scripts/make-local-env.sh` with `PORT_OFFSET` 10 (OpenSpec) and 20 (Spec Kit) and `COMPOSE_PROJECT_NAME` `roombook-openspec` / `roombook-speckit`

**Interfaces:**
- Produces: identical `permissions.allow` in both variants: `Bash(pnpm nx:*)`, `Bash(pnpm run:*)`, `Bash(pnpm test:*)`, `Bash(npx jest:*)`, `Bash(npx tsc:*)`, `Bash(docker compose:*)`, `Bash(scripts/stack-up.sh)`, `Bash(scripts/stack-down.sh)`, `Bash(scripts/stack-reset.sh)`, `Bash(ls:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git add:*)`, `Bash(git commit:*)`. The existing `deny` rules stay.

- [ ] **Step 1:** Clone, remove the remote, confirm `git remote -v` prints nothing and `git describe --tags` prints `baseline-v1` in both.
- [ ] **Step 2:** Write the allowlist into both `.claude/settings.json` files; `diff` the two files → identical. If the write is blocked by the permission classifier, stop and ask the owner to apply it.
- [ ] **Step 3:** `pnpm install --frozen-lockfile` in both; `pnpm run build` in both → exit 0.
- [ ] **Step 4:** Commit in both: `chore: add run permissions`. Save `git ls-files | sort` of each to `runs/<kit>/install/files-before.txt`.

### Task 2 (O): OpenSpec 1.16.1, hardened

**Files:**
- Modify: `openspec-variant/package.json`, `pnpm-lock.yaml`, `.claude/settings.json`
- Created by the kit (expected, research §3.2): `.claude/skills/openspec-{propose,explore,apply-change,update-change,sync-specs,archive-change}/SKILL.md`, `.claude/commands/opsx/{propose,explore,apply,update,sync,archive}.md`, `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/archive/`

- [ ] **Step 1:** Note whether `~/.config/openspec/config.json` exists (existence and modified time only; do not print it).
- [ ] **Step 2:** `pnpm add -D -E @fission-ai/openspec@1.16.1` in `openspec-variant/`. Confirm `node_modules/@fission-ai/openspec/package.json` says `1.16.1` and declares no install scripts.
- [ ] **Step 3:** Add to `.claude/settings.json`: `"env": { "OPENSPEC_TELEMETRY": "0", "DO_NOT_TRACK": "1" }` and to `permissions.deny`: `"Bash(openspec feedback:*)"`, `"Bash(openspec install:*)"`.
- [ ] **Step 4:** Run `OPENSPEC_TELEMETRY=0 DO_NOT_TRACK=1 node_modules/.bin/openspec init . --tools claude --profile core`. Expected: exit 0, no prompt.
- [ ] **Step 5:** `git status --porcelain` and `git ls-files -o --exclude-standard` → save to `runs/openspec/install/files-after.txt`; compare with the expected list above. Read every generated skill and command file. Confirm `.claude/settings.json` was not touched by init, and repeat Step 1's check (no new telemetry id file).
- [ ] **Step 6:** Write the project rules into `openspec/config.yaml` under `context:` (content of `briefs/project-rules.md`). Run `node_modules/.bin/openspec validate --all --strict` → exit 0. Log the time spent as the `setup` phase.
- [ ] **Step 7: Deny-rule test (the audit's open assumption).** Run one runner step (`--kit openspec --change setup --step deny-test`) whose prompt is: "/opsx:explore Run exactly these two shell commands and report for each whether it ran or was blocked: `openspec feedback --help` and `openspec install --help`." Read the record's `permissionDenials` and the events. Write the outcome (blocked / not blocked, per command) to `runs/openspec/install/deny-test.md`. Only the `--help` forms are ever used. If either is not blocked, that is the finding: record it and do not try another form.
- [ ] **Step 8:** The same step doubles as the smoke test that a slash command expands in a headless prompt. If it did not, switch **both** kits to the prompt form "Use the `<skill name>` skill with these arguments: …" and record that in `runs/notes.md`.
- [ ] **Step 9:** Commit `chore: install openspec 1.16.1 (hardened)`. Tag `kit-installed`.

### Task 3 (K): Spec Kit 1.3.3

**Files:**
- Create: `/workspace/spec-duel/.venvs/specify/` (outside both variants)
- Modify: `speckit-variant/.claude/settings.json` (one kit-specific allow rule)
- Created by the kit (expected, research §3.3): `.claude/skills/speckit-{analyze,checklist,clarify,constitution,converge,implement,plan,specify,tasks}/SKILL.md`; `.specify/memory/constitution.md`, `.specify/templates/` (5 files), `.specify/scripts/bash/` (6 files), `.specify/workflows/speckit/workflow.yml`, `.specify/init-options.json`, `.specify/integration.json`, `.specify/integrations/speckit.manifest.json`, `.specify/.gitignore`

- [ ] **Step 1:** `python3 -m venv .venvs/specify` then `.venvs/specify/bin/pip install specify-cli==1.3.3`. Save `.venvs/specify/bin/pip freeze` to `runs/speckit/install/pip-freeze.txt`.
- [ ] **Step 2: Wheel versus tag.** `diff -rq` the installed `specify_cli` package against `src/specify_cli` of the v1.3.3 clone from the research (re-clone the tag with hooks disabled if the scratch copy is gone). Expected: only `core_pack` (bundled templates) and bytecode differ. Record the result; a difference in a `.py` file stops the track.
- [ ] **Step 3:** `shasum .claude/settings.json` in `speckit-variant/`. Then, in that folder: `../.venvs/specify/bin/specify init --here --force --non-interactive --integration claude --script sh --ignore-agent-tools --integration-options="--events false"`. Expected: exit 0.
- [ ] **Step 4:** `shasum .claude/settings.json` again → identical (no hooks written). Save the after-listing to `runs/speckit/install/files-after.txt`; compare with the expected list. Read every generated skill, script and template. Confirm no git branch was created (`git branch` shows `main` only) and no extension is installed (`.specify/extensions` absent or empty).
- [ ] **Step 5:** Add the one kit-specific allow rule `Bash(.specify/scripts/bash/*)` to `.claude/settings.json` and note it in `runs/notes.md` (OpenSpec's equivalent comes from its own `allowed-tools`).
- [ ] **Step 6: Setup step, recorded.** Runner step `--kit speckit --change setup --step constitution` with the prompt `/speckit-constitution` followed by the content of `briefs/project-rules.md`. This is the Spec Kit `setup` phase and its headless smoke test (Task 2 Step 8 applies here too).
- [ ] **Step 7:** Commit `chore: install spec kit 1.3.3`. Tag `kit-installed`.

### Task 4: gate

- [ ] **Step 1:** In both variants: `pnpm run build`, `pnpm run lint`, `pnpm run test` → same counts as `runs/baseline.json`.
- [ ] **Step 2:** `grep -rl "speckit\|\.specify" openspec-variant --exclude-dir=node_modules --exclude-dir=.git` and the reverse for `openspec` in `speckit-variant` → no hits: neither variant holds the other kit's files.
- [ ] **Step 3:** Write `runs/install-summary.md`: files and lines each kit added, dependencies added, the deny-test result, the hooks check, the wheel check. Present it to the owner before Phase 5.

**Success criteria:** both variants tagged `kit-installed`; both install listings match the research or the differences are explained; the deny-test result is recorded either way; Spec Kit's `settings.json` hash is unchanged by init.
