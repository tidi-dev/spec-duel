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

