# Phase 7: Report

**Status:** Not started · **Runs:** me
**Depends on:** Phase 5 gate (owner has seen the raw results); Phase 6 for the console section.
**Risk:** opinion presented as fact. Mitigation: every row is tagged `[Verified]` with a path under `runs/` or a command, or `[Assumption]` / judgement with its basis.
**Security:** the report quotes no `.env` value and no token; paths and counts only.

### Task 1: write `reports/openspec-vs-spec-kit-comparison.md`

**Files:**
- Create: `/workspace/spec-duel/reports/openspec-vs-spec-kit-comparison.md`

Sections, in this order:
1. **Executive summary:** which kit fits Acme and under what conditions, and the three or four numbers that carry the conclusion.
2. **Method:** baseline, briefs, isolation, headless runs, the frozen suite, the done rule, the run order; then the limitations of design §12, plus anything that went differently from the plan.
3. **Comparison table:** one row per criterion of design §9.3, columns OpenSpec, Spec Kit, evidence link, and Fact or Judgement.
4. **Time and tokens:** per kit × change × phase, from `runs/metrics.json` (design §14), with OpenSpec's Specify and Plan shown as one figure; then the project log for everything outside the kit runs, with exact and approximate figures labelled.
5. **Per change:** feature, brownfield change, bugfix. For each: what each kit produced, acceptance score, verify results, interventions, and what the difference shows.
6. **Strengths and weaknesses** of each kit, each tied to a row above.
7. **Security observations**, compared with the audit: install footprint, the deny-rule test result, telemetry, hooks, the 1.3.3 delta, the wheel check, and what a variant session inherits from the parent `.claude/`.
8. **Fit with Acme:** overlap with `/make`, `research` and `writing-plans`; the `manual-tester` check; the CI gate options; what each kit recommends for bugfixes and that Spec Kit's opt-in bug extension exists but was not used; the recommendation and its conditions.
9. **Open questions.**
10. **How to show it:** starting the console, the three scenes, replay versus live.

- [ ] **Step 1:** Draft from `runs/metrics.json`, `runs/install-summary.md`, `interventions.jsonl`, `operator-answers.md`, and the per-change files. No number is typed from memory.
- [ ] **Step 2:** Check every figure in the report against its source file; check every evidence path exists.
- [ ] **Step 3:** Re-read against the acceptance criteria of `.claude/prompt/compare-openspec-vs-spec-kit-demo-setup.txt` and the criteria list of design §9.3: one line per criterion saying where the report covers it. List any gap in section 9 rather than hide it.

### Task 2: final verification and hand-over

- [ ] **Step 1:** `grep -rIl "acme\|Acme\|acme" baseline openspec-variant speckit-variant acceptance console --exclude-dir=node_modules --exclude-dir=.git` → hits only where the demo documents its origin (the `.claude/` kit notes); no source file.
- [ ] **Step 2:** `git remote -v` in all three repos → empty. No `.env` tracked: `git ls-files | grep -E '(^|/)\.env'` → empty in all three.
- [ ] **Step 3:** Stop all stacks (`scripts/stack-down.sh` in each variant and live copy).
- [ ] **Step 4:** Update the phase table in `plan.md`. Present the report path, the console start command and the open questions to the owner. `code-reviewer` only if the owner asks.

**Success criteria:** every criterion of design §9.3 has a row with evidence; every number traces to a file under `runs/`; the checks of Task 2 pass.
