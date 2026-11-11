# Phase 2: build the kit and the variant

**Priority:** high · **Status:** done 2026-11-11 · Builds `cyberrock-variant/` from `baseline/` and adds the kit of `design.md`.

## Key insights
- Cost is driven by tokens entering contexts and by session count (research D1, D2), so the kit is small files and one script.
- The baseline backend agent's transaction rule caused a finding; the new agent reverses it.

## Requirements
- Functional: `design.md` sections 3–8.
- Non-functional: script has no dependency and no network; each file under 200 lines; skills and agents hold no roombook fact.

## Architecture
`cr.mjs` (CLI) → `lib/parse.mjs` (text to objects) → `lib/validate.mjs` (objects to errors) and `lib/archive.mjs` (merge, tick, move). Skills call the CLI; agents hold the bug-class rules.

## Related code files
- Create: `cr/bin/cr.mjs`, `cr/bin/lib/{parse,validate,archive}.mjs`, `cr/bin/test/*.test.mjs`, `cr/rules.md`, `cr/risks.md`, `cr/specs/.gitkeep`, `cr/changes/archive/.gitkeep`, `.claude/skills/cr-{propose,apply,fix,review}/SKILL.md`, `.claude/agents/cr-{nestjs-expert,nextjs-fe-developer,reviewer}.md`.
- Modify: `.claude/settings.json`, `.claude/CLAUDE.md`, `.claude/skills/THIRD-PARTY-SKILLS.md`.
- Delete: `.claude/agents/nestjs-expert.md`, `.claude/agents/nextjs-fe-developer.md`.
- Runner (top level): `runs/tools/phases.json`, `make-prompts.mjs`, `rollup.mjs`, `score-change.mjs`, `change-stats.mjs`, their tests; new `runs/tools/run-check.mjs` only if the validate record cannot be written with an existing tool.

## Implementation steps
1. Variant: copy tracked baseline files, `git init`, tag `baseline-v1`, generate `.env` (offset 30), `pnpm install --frozen-lockfile`, add the allowlist, commit `chore: add run permissions`, save `files-before.txt`.
2. Validator test-first: write `cr/bin/test/*.test.mjs` (parse, each validation rule, tick, archive merge), watch them fail, implement, pass.
3. Write `cr/risks.md`, `cr/rules.md`, the skills and the agents.
4. Settings: kit allow rule and two deny rules. Update `CLAUDE.md` and `THIRD-PARTY-SKILLS.md`.
5. Check: `node --test cr/bin/test/`; `node cr/bin/cr.mjs validate --strict` exits 0; `pnpm run build`, `lint`, `test` match `runs/baseline.json`; grep the kit for network and child-process use.
6. Save `files-after.txt`; commit `chore: install cyberrock kit`; tag `kit-installed`.
7. Extend the runner for the kit `cyberrock`, tests first.
8. Smoke step, recorded: `--kit cyberrock --change setup --step smoke`. Write `runs/cyberrock/install/deny-test.md` and add the kit to `runs/install-summary.md`.

## Todo
- [x] Variant created and tagged
- [x] Validator and tests
- [x] Catalogue, rules, skills, agents
- [x] Settings and notes
- [x] Baseline counts match
- [x] Runner extended
- [x] Smoke and deny test recorded

## Success criteria
Validator tests pass; `kit-installed` tagged; smoke record shows the script ran and both deny rules blocked.

## Risks
- The workspace is not trusted headless, so allow rules are ignored: the smoke step shows it; the skills' own `allowed-tools` still cover the script.
- A settings write is blocked: stop and report.

## Security
No `.env*` read. Kit files are plain text and one local script. No install beyond the lockfile.

## Next
Phase 3.
