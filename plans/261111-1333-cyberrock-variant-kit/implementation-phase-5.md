# Phase 5: console, docs and evaluation report

**Priority:** medium · **Status:** done 2026-11-11 · Three kits everywhere two were assumed.

## Requirements
- The console shows three columns, still usable at phone width, and says "not recorded" for a kit without a recording.
- The "why slower" explanation compares each kit with the fastest.
- `demo.sh` gains the `cyberrock` target (3130 / 4230).
- Docs: only the parts that assume two kits. Existing reports are not rewritten.
- New report `reports/cyberrock-variant-evaluation.md`.

## Related files
- Modify: `console/public/{console.js,index.html,console.css,scene-intros.js}`, `console/server.mjs`, `console/test/server.test.mjs`, `runs/tools/{build-timeline.mjs,report-tables.py}` and tests, `demo.sh`, `README.md`, `CONSOLE.md`, `SETUP.md`, `console/README.md`.
- Create: `reports/cyberrock-variant-evaluation.md`.

## Implementation steps
1. `grep -rn "openspec\|speckit" console runs/tools demo.sh` and list every two-kit assumption.
2. Tests first: timeline and server tests for three kits and for a missing third recording.
3. One shared kit list (order, display names) used by the console files; three-column layout.
4. `report-tables.py` generalised to N kits; regenerate the tables.
5. `demo.sh` target, ports, label.
6. Docs.
7. Evaluation report: three-kit tables from `runs/metrics.json`; audit metrics and scorecard; B1–B12 with a cyberrock column; lessons applied; AI-interaction findings (`profile-steps.mjs` for three kits); verdict tagged [Verified] or [Judgement]; porting guide; limitations.
8. `node --test "console/test/*.test.mjs" "runs/tools/test/*.test.mjs"`; open the console and check each scene.

## Todo
- [x] Console three kits
- [x] Tools and tests
- [x] demo.sh
- [x] Docs
- [x] Evaluation report
- [x] All tests green

## Success criteria
Tests pass; the console replays three kits; every figure in the docs matches `runs/metrics.json`.

## Risks
A long file crosses 200 lines when a third kit is added: split by concern, not by line count.

## Security
The console stays local-only and replay-only.

## Next
Owner review of the change set.
