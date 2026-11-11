# Third-party skills vendored into this repository

Installed by manual copy from pinned commits after a read-only source review. No plugin, hook, marketplace entry, or `npx skills add` was used. Security review reports: `plans/reports/superpowers-skills-security-review.md`, `plans/reports/vercel-agent-skills-security-review.md`.

To re-verify or update, diff a folder against the upstream commit listed below. Local edits are the only expected differences.

## Superpowers — https://github.com/obra/superpowers

License: MIT. Commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` (2026-10-21, v7.0.1).

| Folder | Local edits |
|---|---|
| `test-driven-development/` | `writing-good-tests.md`: one `superpowers:writing-skills` cross-reference reworded (that skill is not installed). |
| `verification-before-completion/` | none |
| `systematic-debugging/` | Removed 2026-11-04, replaced by the local `debug` skill. Its `root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`, `condition-based-waiting-example.ts` and `find-polluter.sh` were moved unchanged into `debug/`; `SKILL.md`, `CREATION-LOG.md` and the `test-*.md` pressure scenarios were deleted. `find-polluter.sh` iterates test files and runs `npm test <file>`; run it only deliberately. |
| `brainstorming/` | Prose only: `scripts/` (local Node server with a browser telemetry beacon to primeradiant.com) and `visual-companion.md` were NOT copied, and the "Visual Companion" section plus its two offer paragraphs were removed from `SKILL.md`. Description reworded from "You MUST use this before any creative work" to a scoped trigger. Design doc location changed from `docs/superpowers/specs/…, committed` to `plans/<YYMMDD-HHMM>-<topic>/design.md`, not committed. Handoff now names the local `writing-plans` skill. |
| `writing-plans/` | Plan location changed from `docs/superpowers/plans/<date>-<name>.md` to this repo's `plans/<YYMMDD-HHMM>-<name>/` folder convention. "Frequent commits" and the worktree note removed. The required-sub-skill header line and the whole "Execution Handoff" section (subagent-driven-development / executing-plans) replaced with: ask for explicit approval, then implement in-session per `.claude/rules/primary-workflow.md`. |

Deliberately not installed: `using-superpowers` and the SessionStart hook (injects a mandatory-skill preamble that conflicts with `.claude/rules`), `executing-plans` and `subagent-driven-development` ("do not pause to check in" posture), `diagnosing-superpowers` (reads session transcripts, creates GitHub issues), `requesting-code-review` and `receiving-code-review` (covered by the existing code-reviewer agent), `writing-skills`, `using-git-worktrees`, `finishing-a-development-branch`, `dispatching-parallel-agents`.

Overlap note: the parent folder `../../../.claude` already provides `brainstorm`, `planning` and `multi-agent-brainstorming` skills and `brainstormer` and `planner` agents. The two Superpowers skills above are the Socratic question-first variants and coexist with them; prefer one style per task rather than chaining both.

## Matt Pocock's skills — https://github.com/mattpocock/skills

License: MIT. Commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-10-31), `skills/engineering/`. Read as reference only: nothing was copied verbatim, no script was run, no plugin or `npx skills add` was used.

| Local file | Adapted from | What was taken |
|---|---|---|
| `debug/SKILL.md` | `diagnosing-bugs` | Feedback-loop-first discipline (one red-capable command before any hypothesis), minimise, 3–5 falsifiable ranked hypotheses, tagged debug logs, regression test at a correct seam, redaction. Added: Acme evidence sources, an owner-approval gate before fixing. `scripts/hitl-loop.template.sh` not copied. |
| `research/SKILL.md` | `research` | Primary sources only, every claim cited, one Markdown file in the repo's existing location. Added: codebase-first exploration, approach comparison, fixed 7-section output, `[Verified]`/`[Assumption]` tags. Runs inline instead of as a background agent so requirement questions can be asked. |
| `../agents/code-reviewer.md` | `code-review` | Spec axis (missing / unrequested / wrong, quoting the spec) and the Fowler smell baseline as judgement calls that repo rules override. Two parallel sub-agents not adopted: the reviewer stays single-seat. |
| `../CLAUDE.md`, `../docs/agents/` | `setup-matt-pocock-skills` | `## Agent skills` block, issue-tracker and domain docs. Jira recorded as the "other" tracker; single-context layout pointing at existing `docs/`. Triage labels skipped (`triage` not installed). Kept inside the gitignored `.claude/` instead of the repo root. |

Deliberately not installed: `code-review` as a skill (name clashes with the built-in `/code-review`; `/guard` already orchestrates review), `tdd` (covered by `test-driven-development`), `triage`, `to-spec`, `to-tickets`, `wayfinder`, `implement`, `implement-spec` (GitHub-issue workflows; work is tracked in Jira), `domain-modeling`, `grill-with-docs`, `improve-codebase-architecture`, `codebase-design`, `prototype`, `pr`, `wizard`, `retro`, `ask-matt`.

## Ponytail — https://github.com/DietrichGebert/ponytail

License: MIT (`LICENSE`, © 2026 DietrichGebert). Commit `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` (2026-10-29), `skills/`. Read in full via `gh api` (read-only); nothing installed, no plugin or marketplace entry, no hook or script run. Each local skill is a rewrite, not a copy, renamed `lean-*` by owner decision (2026-11-11).

| Local folder | Upstream folder | What changed |
|---|---|---|
| `lean-change/` | `skills/ponytail` | Kept the decision ladder, "never cut" list and the `shortcut: <limit>, <upgrade>` convention. Removed the session-wide mode, the "stop ponytail" toggle and everything driven by the plugin hooks (`hooks/ponytail-activate.js`, mode tracker, band). Mapped the ladder onto roombook (`libs/backend-common`, `libs/contract`, class-validator, TypeORM, MUI). Added the RULES.md gates, the security.md dependency rule and the repo's "never assume" and comment rules. |
| `lean-audit/` | `skills/ponytail-audit` | Kept the order (correct, safe, load, tested, fast, lean), the "concrete case or no finding" rule and the four-part finding format. Added: a read-only and secrets guardrail, a baseline split (deep review of new code only), the roombook flow (gateway → NATS → service → Postgres → queue → web), a rules category (RULES.md R1–R11, TypeScript rules), severities, `[Verified]`/`[Judgement]` tags, a `Strengths:` section, writing to a user-named path. Raised the cap from 20 to 25 findings. |
| `lean-review/` | `skills/ponytail-review` | Same changes as `lean-audit`; the checklist now points at `lean-audit` section 2 instead of repeating it. |
| `lean-debt/` | `skills/ponytail-debt` | Marker is `shortcut:` only (legacy `ponytail:` dropped). Scan limited to `apps libs`; grep fallback outside git. Writes a file only on request to a named path. |

Deliberately not taken: `ponytail-gain` (prints upstream's own benchmark figures, not measurements of this repo), `ponytail-help` (documents the plugin's levels toggle, status band, `PONYTAIL_DEFAULT_MODE` env var, `~/.config/ponytail/config.json` and plugin auto-update, none of which exist here), `skills/plugin.json` (plugin packaging), and everything outside `skills/`: hooks, the band UI, per-agent plugin manifests, rule copies, benchmarks and scripts.

## Vercel Agent Skills — https://github.com/vercel-labs/agent-skills

License: MIT (per README and skill frontmatter). Commit `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` (2026-10-27). Upstream folder names differ from the skill names; folders here use the frontmatter `name`.

| Folder | Upstream folder | Local edits |
|---|---|---|
| `vercel-react-best-practices/` | `skills/react-best-practices` | none |
| `vercel-composition-patterns/` | `skills/composition-patterns` | none |

### Applicability to admin-fe and tenant-fe (Next 15 Pages Router, React 18.2)

`vercel-react-best-practices` rules that do not apply because they need the App Router, React Server Components, Server Actions, or React 19 APIs:
`async-suspense-boundaries`, `server-parallel-fetching`, `server-cache-react`, `server-dedup-props`, `server-serialization`, `server-auth-actions`, `server-after-nonblocking`, `rendering-resource-hints`, `rendering-activity`, `advanced-use-latest`, `advanced-effect-event-deps`.

Rules to adapt: `async-api-routes` and `server-no-shared-module-state` (apply the idea to `pages/api` and `getServerSideProps`), `rendering-usetransition-loading` (React 18 transitions are synchronous), `advanced-event-handler-refs` (ref pattern only), `client-swr-dedup` and `client-event-listeners` (the apps use axios services via `useApiCall`, not SWR; do not add SWR).

`vercel-composition-patterns`: skip `react19-no-forwardref`; translate `<Context value>` and `use(Context)` in examples to `<Context.Provider value>` and `useContext`.

Deliberately not installed: `web-design-guidelines` and `writing-guidelines` (fetch their instructions from an unpinned GitHub URL at runtime; a copy of the former already exists in `../../../.claude/skills/web-design-guidelines` with the same property), `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize`, `react-view-transitions`, `react-native-skills`.

## Demo adaptation (2026-11-10)

This folder is a copy of Acme's `.claude/`, adapted for the standalone OpenSpec vs Spec Kit demo. Changes against that copy:

- Removed: the `archify` agent, skill, vendored `archify/` folder and `archify-diagrams/` (paths pointed into the Acme checkout); the `commit`, `draft-commit`, `summon` and `cook-ticket` commands, the `cook-ticket` skill and the `git-manager` agent (push, PR, Slack and Jira writes; the demo is local only).
- Rewritten: `CLAUDE.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md` (no issue tracker, synthetic domain).
- Text fixes only (rule paths made absolute to `/workspace/.claude/rules/`, Acme ticket, container and lib-path references removed): `agents/code-reviewer.md`, `agents/code-simplifier.md`, `skills/research/SKILL.md`, `skills/debug/SKILL.md`, `skills/writing-plans/SKILL.md`, `commands/make.md`, `commands/guard.md`.
- `agents/nextjs-fe-developer.md` (2026-11-10): rewritten for `apps/web` of the roombook demo. Kept: the skill list, the Pages Router and React 18 limits, MUI 5, react-hook-form with yup, the workflow and the safety rules. Removed: Acme app paths, `@acme/*` imports, `BaseApiService`/`useApiCall`, i18n, CASL permissions.
- `agents/nestjs-expert.md` (2026-11-10): adapted from `/workspace/.claude/agents/nestjs-expert.md` (a local shared-kit agent, 56 lines, no upstream recorded). The project-level file overrides the shared agent of the same name. Removed: the pinned model ID (now inherits the session's model) and the generic focus, approach, checklist and output lists. Added: the demo's stack versions and conventions (taken from `plans/261110-1210-openspec-vs-spec-kit-demo/research.md` §2.2 and `design.md` §5), and the workflow and safety sections used by `nextjs-fe-developer`.
- Not installed from the shared kit, by decision of the gap analysis: `backend-developer`, `fullstack-developer`, `tester`, `debugger`, `planner`, `researcher`, `backend-development`, `database-design`, `database-architect`, `git`. They stay visible in any session under `/workspace/` because the parent folder's `.claude/` is inherited.
- The security review reports named at the top of this file and the "Applicability to admin-fe and tenant-fe" notes refer to the Acme repository, not this demo.

## Trimmed (2026-11-10)

Removed as unused in this repository: the `dung-ha`, `code-reviewer` and `code-simplifier` agents; the `get`, `make` and `guard` commands; the `prompt`, `debug` and `vercel-composition-patterns` skills; `docs/agents/`. Sections above that describe them are kept as a record of where the kit came from.
