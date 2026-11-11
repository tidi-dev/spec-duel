# OpenSpec deny-rule test (audit condition 3)

Date: 2026-11-10 · Variant: `openspec-variant/` · OpenSpec 1.16.1 · Claude Code 2.1.322

**Question (the audit's open assumption):** does a `permissions.deny` rule in `.claude/settings.json` override the `allowed-tools: Bash(openspec:*)` that every generated OpenSpec skill and command carries?

**Result: yes, the deny rule wins.**

| Step | Command (through `/opsx:explore`, which carries `allowed-tools: Bash(openspec:*)`) | Outcome |
|---|---|---|
| `deny-test` | `openspec feedback --help` | Blocked: "Permission to use Bash with command openspec feedback --help has been denied." |
| `deny-test` | `openspec install --help` | Blocked, same message |
| `deny-test-control` | `openspec list --json` | Ran, no prompt, returned JSON |

The control matters: at the time of the test the workspace was not yet trusted, so Claude Code ignored the variant's own `permissions.allow` entries. `openspec list --json` still ran, which shows the kit's `allowed-tools` grant was in effect, and the two denied commands were stopped by the deny rules rather than by a general lack of permission.

Only the `--help` forms were used, so nothing could have been posted or downloaded either way.

Evidence: `runs/openspec/setup/deny-test.record.json` (`permissionDenials` lists both commands), `deny-test.events.jsonl`, `deny-test-control.record.json` (`permissionDenials` empty), `deny-test-control.events.jsonl`.

Not covered: a wrapped form such as `pnpm exec openspec feedback` does not match the deny pattern. It is also not pre-approved by `allowed-tools` and is not on the variant's allowlist, so in a headless session it is denied for lack of permission; in an interactive session it would raise a permission prompt.
