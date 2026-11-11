# Phase 5: Kit runs and scoring

**Status:** Not started · **Runs:** headless sessions through `runs/tools/run-step.mjs`; I operate and score
**Depends on:** Phase 4 gate passed.
**Risk:** an interrupted step (usage limit), a step that stops on a question, a red change. All three have a fixed rule below; none is settled by editing a variant by hand.
**Security:** permission bypass is never used. A denied action is a recorded outcome.

### Fixed procedure for every change

**Order:** change 1 OpenSpec then Spec Kit; change 2 Spec Kit then OpenSpec; change 3 OpenSpec then Spec Kit.

**Steps and their prompt files** (`runs/<kit>/change-<n>/prompts/<step>.md`, each is the slash command on line 1 followed by the brief's text, unchanged):

| Phase | OpenSpec step | Spec Kit step |
|---|---|---|
| specify | `propose`: `/opsx:propose` + brief | `specify`: `/speckit-specify` + brief; then `clarify`: `/speckit-clarify` |
| plan | (inside `propose`) | `plan`: `/speckit-plan`; then `tasks`: `/speckit-tasks` |
| check | `validate`: I run `openspec validate --all --strict` and record exit code and output | `analyze`: `/speckit-analyze` |
| implement | `apply`: `/opsx:apply` | `implement`: `/speckit-implement` |
| close | `archive`: `/opsx:archive` | none |

- Every OpenSpec step runs with `--path-prepend <variant>/node_modules/.bin`, and I call `openspec validate` from that same path; Spec Kit needs no extra path.
- Change 1 only: the `apply` and `implement` prompts end with the content of `briefs/parallel-note.md`.
- A check that reports problems (validate exit 1, or analyze findings marked critical) is answered through the kit: one more `propose`-phase or `specify`-phase step with the findings as the prompt, counted as a re-prompt. One round only; then implementation proceeds and the remaining findings are recorded.

**Questions.** If a step ends by asking something, I answer with `--resume <session id>` using only the brief and the contract, or "not specified: choose the simplest option and record it as an assumption". Each exchange is one line in `briefs/operator-answers.md` and in `runs/<kit>/interventions.jsonl` (`{ change, step, kind: 'question' | 'reprompt' | 'approval' | 'manual-fix', note }`).

**Done rule.** After the implement step I run, in the variant: `pnpm run build`, `pnpm run lint`, `pnpm run test`, saving output and counts to `runs/<kit>/change-<n>/verify.json`. If any is red: one more implement step whose prompt is the kit's implement command plus the failing output (`--round 2`, then `--round 3`). After round 3 the change is recorded as it stands.

**Interrupted step.** A record with `status: interrupted` is resumed once with `--resume` and the prompt "Continue." Both records are kept and the interruption is noted.

**Scoring, after each change in each variant:**
1. `scripts/stack-reset.sh` in the variant. If the stack does not start, record it; the acceptance score for this change is "stack did not start" and later changes are reported as not run for this variant.
2. Run the acceptance groups against the variant's gateway and save the JSON result to `runs/<kit>/change-<n>/acceptance.json`: after change 1 `baseline` + `change-1`; after change 2 those + `change-2`; after change 3 all four. Results are never shown to a kit.
3. `git add -A && git commit -m "<type>: change <n>"` and `git tag change-<n>-done`.
4. `runs/tools/change-stats.mjs <variant> <from tag> <to tag>` → `stats.json`: files and lines added, split into kit artifacts (`openspec/`, `specs/`, `.specify/`, `.claude/`), tests (`*.spec.*`) and code.
5. `runs/tools/check-rules.mjs <variant> <from tag> <to tag>` → `rules.json`: counts, on changed files only, of `interface` declarations, `any`, `import * as`, files over 200 lines, non-kebab-case file names, controller methods over five statements, mutating handlers without a DTO body, services without a spec. The same script for both variants.

### Task 1: scoring tools

**Files:**
- Create: `runs/tools/change-stats.mjs`, `runs/tools/check-rules.mjs`, `runs/tools/make-prompts.mjs`
- Test: `runs/tools/test/change-stats.test.mjs`, `check-rules.test.mjs`, `make-prompts.test.mjs`

**Interfaces:**
- `make-prompts.mjs <kit> <change>` writes the prompt files of the table above from the brief files; the test asserts the brief text appears byte-for-byte in both kits' prompts.
- `rollup.mjs` (Phase 3) is extended to merge `interventions.jsonl`, `verify.json`, `acceptance.json`, `stats.json` and `rules.json` into `runs/metrics.json`.

- [ ] **Step 1:** Write failing tests on small fixture trees (a file with an `interface`, a 201-line file, a `CamelCase.ts` file; a two-commit fixture repo for stats).
- [ ] **Step 2:** `node --test runs/tools/test/` → FAIL. Implement. Run again → PASS.

### Task 2: change 1 (feature)

- [ ] **Step 1:** `make-prompts` for both kits. `log.mjs change-1-openspec start`.
- [ ] **Step 2:** OpenSpec: `propose` → `validate` → `apply` → verify (done rule) → `archive` → scoring.
- [ ] **Step 3:** `log.mjs change-1-openspec end`; `log.mjs change-1-speckit start`.
- [ ] **Step 4:** Spec Kit: `specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement` → verify → scoring.
- [ ] **Step 5:** Browser walk-through on each variant's `/bookings` (design §9.5): create, see it listed, edit, delete, room filter. Record pass or fail per action in `runs/<kit>/change-1/walkthrough.md`.
- [ ] **Step 6:** From each implement step's events, extract the subagent start and end times to get wall time per track (backend, frontend); record whether the split came from the kit's own task list (Spec Kit `[P]`) or only from the added note.

### Task 3: change 2 (brownfield)

- [ ] **Step 1:** Spec Kit first, then OpenSpec, same procedure. Additionally record, per kit, how the change to existing behaviour was expressed: OpenSpec delta sections used (ADDED / MODIFIED) and whether archive merged them into `openspec/specs/`; Spec Kit new numbered spec or edited old spec, and whether the change-1 spec was left stale.
- [ ] **Step 2:** Scoring. `change-1` acceptance must still be run and reported (regressions count).

### Task 4: change 3 (bugfix)

- [ ] **Step 1:** Before either run, in each variant with its stack up: save `GET /api/rooms?page=2&limit=5` to `runs/<kit>/change-3/before.json`; take a screenshot of `/rooms` at 5 per page, page 2, if the browser tool can save one (`before.png`).
- [ ] **Step 2:** If a variant no longer has the bug (fixed early), note it as unrequested scope and still run the change.
- [ ] **Step 3:** OpenSpec first, then Spec Kit, same procedure. Additionally save each kit's written analysis of the cause as `runs/<kit>/change-3/bug-report.md` (a copy of the kit's own document, unedited; the path it came from is noted).
- [ ] **Step 4:** Scoring, then the same capture as Step 1 into `after.json` / `after.png`.

### Task 5: fit checks and gate

- [ ] **Step 1:** Give the `manual-tester` agent each kit's change-1 specification (OpenSpec: the archived spec; Spec Kit: `spec.md`) as the requirement source, output to `runs/<kit>/manual-tester/`. Record: number of requirements it could trace, and what it had to ask or guess.
- [ ] **Step 2:** `node runs/tools/rollup.mjs` → `runs/metrics.json`. Check that every step in the tables above has a record for both kits, or a noted reason.
- [ ] **Step 3:** Present the raw results to the owner (owner review gate). No `code-reviewer` unless asked.

**Success criteria:** for each kit and each change: step records, `verify.json`, `acceptance.json`, `stats.json`, `rules.json`, a tag; `interventions.jsonl` and `operator-answers.md` complete; `metrics.json` built with no missing cell left unexplained.
