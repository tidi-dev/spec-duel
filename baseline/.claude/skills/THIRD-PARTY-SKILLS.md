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

## Local adaptation (2026-11-10)

This folder was adapted from another repository's `.claude/` kit for roombook. Agents and commands that pushed code, opened pull requests or wrote to external trackers were removed; `agents/nestjs-expert.md` and `agents/nextjs-fe-developer.md` were written for this repository's stack; rule paths point at `/workspace/.claude/rules/`. The security review reports and the applicability notes named above refer to the repository the kit came from.

## Trimmed (2026-11-10)

Removed as unused in this repository: the `dung-ha`, `code-reviewer` and `code-simplifier` agents; the `get`, `make` and `guard` commands; the `prompt`, `debug` and `vercel-composition-patterns` skills; `docs/agents/`. Sections above that describe them are kept as a record of where the kit came from.
