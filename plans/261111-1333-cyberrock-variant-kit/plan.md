# cyberrock-variant kit: implementation plan

**Goal:** build the cyberrock kit, run it on the same three changes as OpenSpec and Spec Kit, audit its code, and show all three kits in the console.

**Inputs:** `research.md`, `design.md` (this folder); the run protocol in `plans/261110-1210-openspec-vs-spec-kit-demo/implementation-phase-5.md`.

## Global constraints

- Work context `/Users/tidi/sunbytes/openspec-demo`; reports in `plans/reports/`; plans in `plans/`.
- Kit steps: `claude-fable-5-2`, default effort, `--permission-mode acceptEdits`, no override, no bypass. Nothing in the variant is fixed by hand after `kit-installed`.
- Briefs, `acceptance/`, the other variants and their recordings are read-only. The real CyberRock repo is never opened.
- No new dependency. No secret read or printed. Git local only; the top-level repo is left uncommitted.
- Code files under 200 lines, kebab-case, no narrative comments.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 0 | Analysis | `research.md` | Done 2026-11-11 |
| 1 | Design | `design.md` | Done 2026-11-11 |
| 2 | Build the kit and the variant | [implementation-phase-2.md](implementation-phase-2.md) | Done 2026-11-11 |
| 3 | Run the three changes | [implementation-phase-3.md](implementation-phase-3.md) | Done 2026-11-11 |
| 4 | Code audit | [implementation-phase-4.md](implementation-phase-4.md) | Done 2026-11-11 |
| 5 | Console, docs and evaluation report | [implementation-phase-5.md](implementation-phase-5.md) | Done 2026-11-11 |

## Dependencies

- Phase 3 needs the tag `kit-installed` and the runner extended (phase 2).
- Phase 4 needs the tag `change-3-done`.
- Phase 5's console work needs one recording; its report needs phases 3 and 4.

## Gates

- Before phase 3: validator tests green; variant build, lint and test at baseline counts; smoke step recorded.
- End: tool and console tests green; the change set is presented to the owner. `code-reviewer` only if asked.
