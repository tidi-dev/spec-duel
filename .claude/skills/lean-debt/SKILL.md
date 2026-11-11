---
name: lean-debt
description: List every `shortcut:` comment (or a marker word the user names, such as TODO or FIXME) as a debt ledger with its limit and upgrade trigger. Read-only, one-shot. Use for "list the shortcuts", "debt ledger", "what did we defer". Adapted from Ponytail (MIT).
argument-hint: "[marker word]"
---

# Lean debt

Every deliberate shortcut is marked with a `shortcut: <the limit>, <when to upgrade>` comment (see `lean-change`). This collects them into one ledger so a deferral cannot quietly become permanent.

## Scan

Search source comments only, skipping `.git` and everything `.gitignore` excludes (`node_modules/`, `dist/`, `tmp/`, `coverage/`):

```bash
git grep -nE '(//|/[*]|#|\{/[*]) ?shortcut:' -- apps libs
```

If the user names another marker (`/lean-debt TODO`), grep for that word instead. Outside a git repository, use `grep -rnE` with `--exclude-dir=node_modules --exclude-dir=dist`.

Each hit is one row. Skip hits that are not a deferral, such as a note about a keyboard shortcut.

## Output

One row per marker, grouped by file:

`<file>:<line>, <what was simplified>. limit: <the limit named>. upgrade: <the trigger>.`

Tag any marker that names no upgrade trigger `no-trigger`: those are the ones that silently rot. Add an owner with `git blame -L<line>,<line>` only if the user asks.

End with `<N> markers, <M> with no trigger.` Nothing found: `No shortcut debt. Clean ledger.`

Reads and reports only. Write the ledger to a file only when the user asks and names the path.
