# Kit install summary

Date: 2026-11-10. Both variants were cloned from `baseline-v1` and are tagged `kit-installed`.

## Footprint

| | OpenSpec 1.16.1 | Spec Kit 1.3.3 |
|---|---|---|
| Files written into the repo by init | 15 | 29 |
| Lines written by init | 2668 | 5118 |
| Where | `.claude/commands` 6 files / 1269 lines; `.claude/skills` 6 files / 1357 lines; `openspec` 3 files / 42 lines | `.claude/skills` 9 files / 2373 lines; `.specify` 20 files / 2745 lines |
| How it is installed | npm devDependency of the variant (`pnpm add -D -E`); lockfile grew by 458 lines | Python venv outside the repo (`.venvs/specify`), 42 packages in `pip freeze`; nothing added to `package.json` |
| Needed at run time | The `openspec` CLI on `PATH` (its skills call it) | Nothing from the venv: the skills call bash scripts copied into `.specify/scripts/bash/` |
| `.claude/settings.json` touched by init | No (hash identical before and after) | No (hash identical before and after) |
| Hooks written | None | None (`--integration-options="--events false"`; no `.specify/extensions`) |
| Git actions by init | None | None (still on `main`, no branch, no commit) |
| Files outside the repo | None: no `~/.config/openspec` or `~/.local/share/openspec` before or after (telemetry off through env) | None found under `~/.specify` or `~/.config/specify` |
| Tool pre-approval in generated files | Every skill and command: `allowed-tools: Bash(openspec:*)` | None. Skills carry `disable-model-invocation: false`, no `allowed-tools` |
| Extra permission the variant needed | None | One allow rule, `Bash(.specify/scripts/bash/*)`, so its scripts can run headless |

## Hardening checks

- **OpenSpec version and scripts:** `node_modules/@fission-ai/openspec/package.json` reports 1.16.1 and declares no install scripts.
- **OpenSpec telemetry:** `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1` are in the variant's `.claude/settings.json` `env` block and were set for every CLI call made during install.
- **OpenSpec deny rules:** `Bash(openspec feedback:*)` and `Bash(openspec install:*)` are in `permissions.deny`. Tested: both blocked, while a normal `openspec` command ran. See `runs/openspec/install/deny-test.md`.
- **Spec Kit wheel versus tag:** `diff -rq` of the installed `specify_cli` package against `src/specify_cli` at tag v1.3.3 shows no differing `.py` file; the only extra is `core_pack/` (the bundled templates and scripts).
- **Spec Kit init flags:** `--here --force --non-interactive --integration claude --script sh --ignore-agent-tools --integration-options="--events false"`.
- **Generated files read:** OpenSpec's 12 skill and command files call only `openspec` subcommands; Spec Kit's 9 skills call only the four scripts under `.specify/scripts/bash/`, which contain no network or git commands. Neither set contains `curl`, `wget`, `git push`, package installs or URLs to fetch.
- **Isolation:** no Spec Kit file in `openspec-variant/`, no OpenSpec file in `speckit-variant/`.

## Differences from the research

- Spec Kit also wrote `.specify/integrations/claude.manifest.json`, `.specify/memory/.constitution-template.json` and `.specify/workflows/workflow-registry.json`, which the research did not list. All three are small JSON state files.
- OpenSpec wrote exactly the expected 6 skills, 6 commands and `openspec/` tree.


## cyberrock kit (added 2026-11-11)

`cyberrock-variant/` was created from `baseline/` (the `baseline-v1.1` state), given the same 15 allow rules as the other variants, and tagged `kit-installed` after the kit was added. The kit was written for this demo; nothing was downloaded or installed.

| | cyberrock kit |
|---|---|
| Files added | 18 (16 with content): 4 skills, 3 agents, 2 Markdown files, 4 script files, 3 script test files, 2 empty folder markers |
| Lines added | 1,187: skills 224, agents 157, `cr/rules.md` and `cr/risks.md` 167, script 403, script tests 236 |
| Files removed | 2: the baseline agents `nestjs-expert.md` and `nextjs-fe-developer.md` (101 lines), replaced by the `cr-` agents |
| How it is installed | Plain files copied into the repository; no package, no virtual environment, lockfile unchanged |
| Needed at run time | Node (already required by the project). The script imports `node:fs`, `node:path` and `node:process` only |
| `.claude/settings.json` | Written once by the operator at install: two allow rules (`Bash(node cr/bin/cr.mjs:*)`, `Bash(node --env-file=.env node_modules/jest/bin/jest.js:*)`) and two deny rules (`Bash(git push:*)`, `Bash(git remote:*)`). The kit never writes it at run time |
| Hooks written | None |
| Telemetry, network | None: `grep -rnE "https?://|fetch\(|node:(http|https|net|child_process|dgram|tls)|require\(" cr/bin/cr.mjs cr/bin/lib/` finds nothing |
| Tool pre-approval in kit files | `cr-propose`, `cr-apply`, `cr-fix`: `allowed-tools: Bash(node cr/bin/cr.mjs:*)`. `cr-review` and the agents: none |
| Project rules | `briefs/project-rules.md` written into `cr/rules.md` by the operator, with the stack facts and conventions that the removed baseline agents held. No AI step |

Checks:

- Script tests: `node --test "cr/bin/test/*.test.mjs"` → 19 of 19 pass. `node cr/bin/cr.mjs validate --strict` → exit 0.
- Variant at `kit-installed`: build, lint and test pass with the baseline counts (7 projects, 70 tests).
- Stack: starts on gateway 3130 and web 4230 (`PORT_OFFSET=30`, compose project `roombook-cyberrock`).
- Deny rules and headless smoke test: `runs/cyberrock/install/deny-test.md`.
- Isolation: no OpenSpec or Spec Kit file in `cyberrock-variant/`. One sentence in `.claude/skills/THIRD-PARTY-SKILLS.md` names both projects as the source of two ideas (deltas into living specs; requirement IDs and parallel markers); it does not say a comparison is being run.
