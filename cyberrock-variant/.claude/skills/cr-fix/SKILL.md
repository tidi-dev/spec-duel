---
name: cr-fix
description: The light path of the cyberrock kit for a bugfix. Finds the cause, writes a short fix note, adds a failing regression test, fixes, verifies and archives in one session. Reached from cr-propose when the tier is fix, or directly for "cr fix".
argument-hint: "<bug report>"
allowed-tools: Bash(node cr/bin/cr.mjs:*)
---

# cr-fix

One session from bug report to archived fix. The rules for the session in `cr-propose` apply: no confirmation, tools as listed in `cr/rules.md`, each rule stated once.

## 1. Find the cause

Read `cr/rules.md` if you have not. Locate the code with Grep, read it, and name the exact line that is wrong and why. Do not fix yet. If the cause is a class in `cr/risks.md`, note its ID.

## 2. Write the fix note

`cr/changes/<id>/change.md`, at most 40 lines and 5 tasks:

```markdown
# <id>: <title>

Tier: fix
Why this tier: <the behaviour it contradicts>

## Cause
<what is wrong, with file:line, and what the correct behaviour is>

## Requirements
### ADDED <capability>
#### <PREFIX>-<nnn>: <name>
The system SHALL <the correct behaviour>.
- Scenario: <name>. WHEN <the failing input> THEN <the correct result>

## Tasks
- [ ] T01 @be [regression, <ID>] Failing spec for <case> | <spec file>
- [ ] T02 @be [regression, <ID>] <the fix> | <file>
- [ ] T03 @main [verify] Build, lint, test
```

Include `## Requirements` only when no requirement in `cr/specs` already states the correct behaviour. Use MODIFIED when a spec states the wrong one.

Run `node cr/bin/cr.mjs validate <id>` and fix what it reports.

## 3. Regression test first

Write the spec that reproduces the bug. Cover the reported case, the boundary next to it and the case past the end (last page, empty set, zero). Run it and watch it fail for the right reason.

## 4. Fix

Make the smallest change that turns the spec green. If you read the matching agent file (`.claude/agents/cr-nestjs-expert.md` or `cr-nextjs-fe-developer.md`) for the side you are editing, follow its rules. No refactor, no unrelated edit.

## 5. Look for the same bug nearby

Grep for the same pattern in sibling code. Fix a sibling only if it is the same defect in the same capability; otherwise list it in the report.

## 6. Verify and close

1. Run `pnpm run build`, `pnpm run lint`, `pnpm run test`. All three must pass; report real output.
2. `node cr/bin/cr.mjs tick <id> <all task ids>`, then `node cr/bin/cr.mjs archive <id>`.

## 7. Report

At most eight lines: cause with file:line, the fix, the tests added, verification results, siblings found.
