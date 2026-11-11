# OpenSpec vs Spec Kit demo — local agent setup

A standalone demo repo that compares OpenSpec and GitHub Spec Kit on a mini Acme-shaped codebase. It holds no Acme code, data or secrets.

Shared engineering rules live in `/workspace/.claude/rules/` (loaded automatically from the parent folder). Security rules: `.claude/rules/security.md`.

## Agent skills

### Issue tracker

None. Work is driven by the plan folder under `plans/`. Git is local only: no remote, no push, no pull requests.

### Domain docs

Single-context; the domain is synthetic. The references are the approved `research.md`, `design.md` and plan in the active `plans/` folder.

### Engineering flow

- `research` → cited `research.md` before planning; read-only.
- `test-driven-development` and `verification-before-completion` → while implementing.
