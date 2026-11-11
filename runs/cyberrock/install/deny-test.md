# cyberrock kit: deny-rule and smoke test

Date: 2026-11-11. Two recorded headless steps in `cyberrock-variant/`, same prompt (`runs/cyberrock/setup/prompts/smoke.md`): run four commands, one per call, and report which ran.

| Command | Round 1: folder not yet trusted | Round 2: folder trusted by the owner |
|---|---|---|
| `node cr/bin/cr.mjs validate --strict` | blocked ("requires approval") | ran: `ok: 0 changes, 0 specs` |
| `ls cr` | ran | ran |
| `git remote -v` | blocked | blocked |
| `git push --dry-run` | blocked | blocked |

Evidence: `permissionDenials` in `runs/cyberrock/setup/smoke.record.json` and `smoke.r2.record.json`.

What this shows:

- **The deny rules work.** `Bash(git push:*)` and `Bash(git remote:*)` blocked both commands in both rounds, trusted or not.
- **The slash command expands headless.** Both sessions loaded the `cr-review` skill from the prompt's first word.
- **An untrusted folder ignores allow rules** (the same finding as for the other kits, `runs/notes.md`). In round 1 the kit script was blocked because `cr-review` deliberately carries no `allowed-tools`. `cr-propose`, `cr-apply` and `cr-fix` grant `Bash(node cr/bin/cr.mjs:*)` themselves, so the script would run for them either way; build, lint and test commands would not.
- The owner trusted the folder once by hand, as was done for the other two variants. Nothing in `~/.claude.json` was edited by the operator.
