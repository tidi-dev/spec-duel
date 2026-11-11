# Design: the cyberrock kit

Date: 2026-11-11. Based on `research.md` in this folder (lever numbers below refer to its section E). Paths are relative to `cyberrock-variant/` unless they start with `runs/`, `console/` or `plans/`.

## 1. Goal

A spec-driven kit for the CyberRock team that costs less than OpenSpec, is at least as correct, and carries the lessons of both kits' mistakes into the agents that write code.

## 2. Flow

| Tier | When | Sessions | Steps |
|---|---|---|---|
| `feature` | A new capability | 2 | `/cr-propose` → person reviews `change.md` → `/cr-apply` |
| `change` | Alters or extends specified behaviour | 2 | the same |
| `fix` | Behaviour contradicts the spec, the contract or an obvious intent; nothing new | 1 | `/cr-propose` classifies it, then follows `cr-fix` to the end in the same session |

- `/cr-propose` is the single entry command. It classifies the brief, records the tier and the reason in `change.md`, and never asks for confirmation.
- `/cr-apply` implements, verifies, has the diff reviewed once, then archives with the script. There is no separate close session.
- The review point between spec and code is the gap between the two sessions. A `fix` has none: its 40-line note and its diff are reviewed together.

## 3. Files the kit adds

```
cr/
  rules.md              the one project-specific file: stack, conventions, commands, project rules
  risks.md              bug-class catalogue R-01…R-17 (generic)
  specs/<capability>.md living specs, one file per capability
  changes/<id>/change.md        one document per change
  changes/archive/<id>/change.md
  bin/cr.mjs            CLI: validate, tick, archive (Node, no dependencies, no network)
  bin/lib/*.mjs         parser, validator, archiver
  bin/test/*.test.mjs   node --test
.claude/skills/cr-propose, cr-apply, cr-fix, cr-review   (SKILL.md each)
.claude/agents/cr-nestjs-expert.md, cr-nextjs-fe-developer.md, cr-reviewer.md
```

Removed from the variant: `.claude/agents/nestjs-expert.md` and `nextjs-fe-developer.md`. The `cr-` agents replace them.

## 4. Artifact format

One file per change, `cr/changes/<id>/change.md`:

```markdown
# <id>: <title>

Tier: feature | change | fix
Why this tier: <one line>

## Why
## Cause                 (fix only: root cause with file:line)
## Requirements
### ADDED <capability>
#### BK-001: <name>
The system SHALL …
- Scenario: <name>. WHEN … THEN …
### MODIFIED <capability>     (whole replacement block, same ID)
### REMOVED <capability>      (ID and a one-line reason)
## Design                (decisions and assumptions, one line each; one home per rule)
## Risks
| Risk | Applies | Note | Task |
| R-01 | yes | optional PATCH fields | T04 |
| R-02 | no | no partial update | - |
## Tasks
- [ ] T01 @be [BK-001] Description | path/a.ts, path/a.spec.ts
- [ ] T09 @main [verify] Build, lint, test
```

- **Requirement IDs** (from Spec Kit): `<PREFIX>-<nnn>`, one prefix per capability, unique across all specs.
- **Deltas and living specs** (from OpenSpec): `cr/specs/<capability>.md` holds `## <ID>: <name>` blocks. Archive appends ADDED, replaces MODIFIED by ID and deletes REMOVED by ID. Because blocks are matched by ID, a MODIFIED block can drop a scenario (fixes research B-6).
- **Scenarios** are one line each with concrete values.
- **Parallel marker** (from Spec Kit's `[P]`): the `@track`. Tasks in different tracks run in parallel; their file lists must not overlap. `@main` is the coordinating session.
- **Each rule once.** Requirements state behaviour; Design, Risks and Tasks refer to them by ID. No proposal file, no separate design, data-model, contracts, quickstart or checklist files.

Size budgets, enforced by the validator:

| Tier | `change.md` lines | Tasks | Basis |
|---|---:|---:|---|
| fix | 40 | 5 | OpenSpec's bugfix proposal was 184 lines for a 2-line fix |
| change | 120 | 14 | OpenSpec 467 lines and 19 tasks; Spec Kit 1,265 and 30 |
| feature | 250 | 30 | OpenSpec 752 lines and 34 tasks; Spec Kit 1,620 and 91 |

## 5. The validator: `node cr/bin/cr.mjs`

| Command | Does | Exit |
|---|---|---|
| `validate [<id>] [--strict]` | Checks every active change (or one) and the living specs | 0 or 1, errors as `file: message` |
| `tick <id> <T..>` | Ticks tasks in one call | 0 or 1 |
| `archive <id>` | Validates, requires every task ticked, merges the deltas, moves the folder | 0 or 1 |

Checks: tier line and required sections per tier; ID format and uniqueness; ADDED must be new, MODIFIED and REMOVED must exist in that capability; one prefix per capability; every ADDED or MODIFIED requirement has SHALL and a WHEN/THEN scenario; every requirement has a task and every task references a requirement, an applying risk, `verify` or `regression`; the Risks table lists every catalogue ID once, each "yes" names an existing task, each "no" gives a reason (feature and change tiers); a fix has a Cause and a `regression` task; file lists of different tracks are disjoint; size budget. `--strict` also fails when a change has every task ticked but is not archived (the CI form).

## 6. Bug-class guards

1. `cr/risks.md`: the catalogue (research section C).
2. **The coding agents carry the rules.** `cr-nestjs-expert` holds the backend classes and `cr-nextjs-fe-developer` the frontend classes as short imperatives with their test shape, plus the strengths to copy (research A11, A12) and the weaknesses to avoid (B-12 to B-15). The baseline rule that caused SK-A F10 is reversed.
3. The Risks table in every feature and change maps each applying class to a test task.
4. `cr-reviewer` reads the code diff in a fresh context against the catalogue and the RULES.md gates, once per feature or change, and returns at most 10 findings with a concrete failing case each. `cr-apply` fixes confirmed ones test-first. Adapted from `lean-review` (Ponytail, MIT; attribution kept in `THIRD-PARTY-SKILLS.md`).
5. Real-database specs (`*.int-spec.ts`) for any guarantee that rests on a lock, transaction or constraint. They are kept out of the default test target so the unit run stays green without the stack.

## 7. Cost design

| Lever (research E) | How the kit applies it |
|---|---|
| 1 Fewer sessions | 2 / 2 / 1 |
| 2 Script the mechanical | validate, tick, archive |
| 3 One budgeted document | section 4 |
| 4 Tool discipline | Every skill and agent: read with Read, Grep, Glob; Bash only for the commands listed in `cr/rules.md`, one per call, no `cd`, pipe, `&&`, loop or redirect |
| 5 Short instructions | Four skills and three agents, each under 90 lines |
| 6 Read narrowly | Skills name what to read; a change is read once per session |

Subagents: two coding agents in parallel only when both `@be` and `@fe` tracks have tasks; otherwise the main session reads the matching agent file and codes itself, which avoids a second context. One reviewer subagent per feature or change.

## 8. Security

- The script uses `node:fs`, `node:path` and `node:process` only: no network, no child process, no telemetry.
- Skills grant `Bash(node cr/bin/cr.mjs:*)` and nothing else. `.claude/settings.json` gets the same 15 allow rules as the other variants, that one kit rule, and two deny rules for the local-only policy: `Bash(git push:*)`, `Bash(git remote:*)`.
- No hooks. The kit never writes `.claude/settings.json` and never reads `.env*`.

## 9. Portability to the CyberRock repo

- Skills, agents, `cr/risks.md` and `cr/bin/` contain no roombook fact. Everything project-specific is in `cr/rules.md`, which points at the shared rules in `/Users/tidi/sunbytes/.claude/rules/` (including R11 `LikePatternHelper`).
- Porting guide (in the evaluation report): copy `cr/bin`, `cr/risks.md`, the four skills and three agents; rewrite `cr/rules.md`; start `cr/specs/` empty; add the allow and deny rules; add `node cr/bin/cr.mjs validate --strict` to CI.

## 10. Experiment protocol

Identical to the other kits (`plans/261110-1210-openspec-vs-spec-kit-demo/implementation-phase-5.md`), with these kit steps:

| Phase | Step | How |
|---|---|---|
| setup | `smoke` | One recorded session: slash command expands, the script runs, deny rules block |
| specify (+plan) | `propose` | `/cr-propose` + the brief |
| check | `validate` | Operator runs `node cr/bin/cr.mjs validate`, recorded with cost 0, as for OpenSpec |
| implement (+close) | `apply` | `/cr-apply`; change 1 adds the parallel note. Skipped when `propose` finished a `fix` |

Gateway 3130, web 4230, compose project `roombook-cyberrock`. Runs go to `runs/cyberrock/`.

## 11. Assumptions

- The kit folder is named `cr/`, short and not confusable with the repository name.
- There is no `cr-archive` skill: archiving is a script command that `cr-apply` and `cr-fix` call.
- `cr-review` is a thin skill so a person can run the reviewer by hand on any diff.
- Project rules reach the kit as they reached OpenSpec: the operator writes `briefs/project-rules.md` into the kit's rules file at install, with no AI step.
- The parent folder's `.claude/` (skills, agents, CLAUDE.md) is inherited by every headless session, as it was for the other kits. Since their runs it has gained the `lean-*` and `prompt` skills; this is noted in `runs/notes.md`.
- The other variants lost their own git history when the demo was imported into one repository. The new variant keeps its nested repository until the owner has reviewed the result.
