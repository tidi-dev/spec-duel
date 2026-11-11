# Phase 3: run the three changes

**Priority:** high · **Status:** done 2026-11-11 (two interruptions, one contaminated scoring re-run; see `runs/notes.md`) · Same protocol as the other kits; only the kit's steps differ (`design.md` section 10).

## Key insights
- Anything that differs from the earlier runs is a confound and goes into `runs/notes.md`.
- A fix tier finishes inside `propose`; the operator then skips `apply`.

## Requirements
- Brief text byte-for-byte; parallel note on the change-1 `apply` prompt only.
- Done rule: build, lint, test; at most two fix rounds through `/cr-apply`; no hand fix.
- Questions answered only from the brief and the contract, logged in `briefs/operator-answers.md` and `runs/cyberrock/interventions.jsonl`.
- An interrupted step is resumed once with "Continue."; both records kept.

## Architecture
`make-prompts.mjs cyberrock <n>` → `run-step.mjs` per step → operator `validate` record → `verify-change.mjs` → `score-change.mjs` → `rollup.mjs`, `build-timeline.mjs`.

## Related files
- Create: `runs/cyberrock/change-{1,2,3}/…`, `runs/cyberrock/interventions.jsonl`.
- Modify: `runs/metrics.json`, `runs/timelines/*.json`, `runs/notes.md`, `runs/project-log.jsonl`.

## Implementation steps (per change n = 1, 2, 3)
1. `log.mjs change-n-cyberrock start`; make prompts.
2. Change 3 only, first: stack up, save `GET /api/rooms?page=2&limit=5` to `before.json`.
3. `propose`; then the `validate` record.
4. If the change is still active: `apply`. Change 1 only: `track-times.mjs` → `tracks.json`.
5. `verify-change.mjs`; if red, `/cr-apply` plus the failing output as round 2, then 3.
6. `score-change.mjs`: stack reset, acceptance groups, commit, tag `change-n-done`, stats, rules.
7. Change 3: `after.json`; copy the kit's own cause write-up to `bug-report.md`.
8. Log interventions (including denied permissions, counted as for the other kits); `log.mjs … end`.

Then: `rollup.mjs`, `build-timeline.mjs`, stack down.

## Todo
- [x] Change 1
- [x] Change 2
- [x] Change 3
- [x] Metrics and timelines rebuilt

## Success criteria
For each change: step records, `verify.json`, `acceptance.json`, `acceptance-summary.json`, `stats.json`, `rules.json`, a tag; every gap has a noted reason.

## Risks
- Usage limit: resume rule above.
- Stack does not start: recorded; later changes reported as not run.
- The session picks the baseline agent named in the parallel note: visible in `tracks.json`; recorded, not corrected.

## Security
Acceptance results, reports and other variants are never placed in a kit prompt. No permission bypass.

## Next
Phase 4.
