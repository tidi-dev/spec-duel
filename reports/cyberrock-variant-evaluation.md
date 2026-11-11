# The CyberRock kit: why it exists, how it differs and how it did

**Author:** Dai Ho (contact@daiho.tech) · **Date:** 2026-11-11 · **Kit:** `cyberrock-variant/` at tag `change-3-done` · **Model:** `claude-fable-5-2`, Claude Code 2.1.322, default effort

Statements are tagged **[Verified]** (with the file or command that shows it; paths are relative to the demo folder) or **[Judgement]**. Run tables are generated from `runs/metrics.json` by `runs/tools/report-tables.py`. The two earlier reports are unchanged: `reports/openspec-vs-spec-kit-comparison.md` (process) and `reports/openspec-vs-spec-kit-code-audit.md` (code). The code of all three kits is compared in `reports/three-kit-code-audit.md`.

This report has two halves. Sections 2 to 4 explain the kit: why it was built, what it is and how it differs from OpenSpec and Spec Kit. Sections 5 to 15 report how it did on the same three changes, what it optimises, how it uses AI, and where it falls short.

## 1. Verdict

The CyberRock kit is our own kit, built from what OpenSpec and Spec Kit did well and from every mistake they made on these three changes. That is its design intent, not a side effect. It then ran the same three changes under the same rules.

| Question | Answer | Kind |
|---|---|---|
| As correct? | Yes: 30 of 30, 37 of 37, 41 of 41 hidden tests; build, lint and unit tests pass | Verified |
| Cheaper? | Slightly than OpenSpec ($33.10 against $36.13, 8% less); much cheaper than Spec Kit ($55.53, 40% less) | Verified |
| Faster? | No against OpenSpec (52:05 against 48:41, 7% longer); yes against Spec Kit (1:12:52, 29% less) | Verified |
| Fewer output tokens? | No against OpenSpec (352,185 against 335,297, 5% more); yes against Spec Kit (491,696, 28% less) | Verified |
| Fewer audit findings? | Fewer serious ones: no high, 4 medium (OpenSpec 5 medium; Spec Kit 1 high, 8 medium). More small ones: 14 low against 6 and 5. Score 39 of 50 (OpenSpec 40, Spec Kit 37) | Verified |
| Known bugs B1–B12 avoided? | 10 avoided, 1 reduced, 1 still present. OpenSpec has 8 of the 12, Spec Kit 11 | Verified |
| Ready for the real CyberRock repo? | Not as it stands. It has four defects of its own (section 13), which are recorded and not fixed; a pilot on one service makes sense once they are | Judgement |

**In one paragraph [Judgement].** The kit did not turn out "much more optimised" than OpenSpec overall. It is dramatically lighter where process weight used to dominate (a bugfix costs $1.37 against $4.35 and $10.05) and it writes a quarter of OpenSpec's documents. It then spends almost all of that saving on things neither other kit did: 54% more test lines than OpenSpec, tests against a real database, a database constraint behind the overlap rule, and a review of every change. The result is the same price as OpenSpec for code with fewer serious defects. For CyberRock, whose daily work is mostly small changes and fixes, that trade is the right one.

## 2. Why it exists

We compared two spec-driven kits, OpenSpec and GitHub Spec Kit, on the same three changes: a feature, a change to existing behaviour, and a bugfix. Both got every change right. The comparison also showed four things neither kit solves.

1. **Process weight is fixed per change, not sized to the change.** A two-line bugfix cost $4.35 with OpenSpec and $10.05 with Spec Kit. About 95% of the lines both added for it were kit documents.
2. **Most of the money is not spent on writing.** 70 to 82% of every change's cost was context being loaded into AI sessions. Each session loads about 50,000 tokens before it does any work, and Spec Kit starts six per change.
3. **Neither kit checks the code it writes.** The code audit found 11 defects in OpenSpec's code and 14 in Spec Kit's, among them a partial edit that silently undoes another person's edit, and a `null` date stored as 1 January 1970. Neither kit tested its locking against a real database, and neither reviewed its own diff.
4. **Each kit has a strength the other lacks.** OpenSpec keeps one current specification and has a check that needs no AI. Spec Kit has numbered requirements and marks tasks that can run in parallel. No kit has all four.

CyberRock's daily work is mostly small changes and fixes. That is exactly where both kits are heaviest.

The CyberRock kit was built to answer those four points: keep the strengths of both, cut the fixed cost, and put what the two kits got wrong into the agents that write the code, so the same mistakes are not made again.

## 3. What it is

Plain files copied into a repository. Nothing is installed or downloaded.

| Part | What it is |
|---|---|
| 4 skills | `cr-propose` (entry point), `cr-apply` (implement), `cr-fix` (bugfix path), `cr-review` (run the reviewer by hand) |
| 3 agents | `cr-nestjs-expert` (backend), `cr-nextjs-fe-developer` (frontend), `cr-reviewer` (read-only review) |
| `cr/rules.md` | The only project-specific file: stack, conventions, commands, project rules |
| `cr/risks.md` | A catalogue of 17 bug types, each with a question to ask, a rule and a test to write |
| `cr/bin/cr.mjs` | A 400-line Node script with no dependency and no network code: check, tick tasks, merge specs |
| `cr/specs/` | The living specifications: how the system behaves now, one file per area |
| `cr/changes/` | One `change.md` per change, moved to `archive/` when done |

How a change flows:

| Change size | Sessions | Steps |
|---|---|---|
| Feature or change to existing behaviour | 2 | `/cr-propose` writes one change file → a person reviews it → `/cr-apply` writes the code test-first, has it reviewed once, and merges the specs by script |
| Bugfix | 1 | `/cr-propose` recognises a bugfix and finds the cause, writes the regression test, fixes, checks and merges, all in the same session |

`node cr/bin/cr.mjs validate` can run at any time and in CI. It needs no AI and takes under a second.

## 4. How it differs from the other two kits

| Aspect | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| AI sessions per change | 3: propose, apply, archive | 6: specify, clarify, plan, tasks, analyze, implement | 2: propose, apply. 1 for a bugfix |
| Documents per change | 6 to 12 files: proposal, design, a spec file per area, tasks | 9 to 10 files: spec, plan, research, data model, contracts, quickstart, tasks, checklist | 1 file: requirements, design decisions, risk table, tasks |
| Size limit on documents | None | None | 40, 120 or 250 lines by change size, enforced by the script |
| How specs stay current | Living specs, updated by each change | A new numbered spec per change; older ones are not updated | Living specs, updated by each change |
| Who merges the change into the specs | An AI session (`archive`), which asks for confirmation | Nobody | The script, matching requirements by ID, with no question |
| Requirement IDs | None | Yes (`FR-001`) | Yes, one prefix per area (`BKG-012`) |
| Parallel work | Not in the task format | `[P]` markers on tasks | Tasks grouped in tracks (`@be`, `@fe`); the script checks the tracks share no file |
| Check before code | Command-line check, free | AI session, $0.91 to $3.00 a run | Script, free. Also checks that every requirement has a task and every task a requirement |
| Path for a bugfix | The full flow | The full flow (a lighter add-on exists; not used here) | One session, chosen by the kit itself |
| Who writes the code | The project's general coding agents | The project's general coding agents | The kit's own agents, which carry the bug catalogue |
| Review of the code written | None | None | One review by a separate agent per feature or change, against the bug catalogue |
| Tests against a real database | None written | None written | Required for anything that relies on a lock, a transaction or a constraint |
| How the model is told to use its tools | Not stated | Not stated | Stated in every skill and agent: how to read files, which commands exist |
| Instruction text loaded per change | 923 lines | 1,520 lines | 381 lines |
| Install | npm package | Python tool in its own environment | Copy the files |
| Pre-approved commands, usage reporting | Pre-approves its own CLI; reporting on unless switched off | Neither | Pre-approves only its own script; no network code at all |
| Maturity | Released, version 1.16 | Released, version 1.3 | First version, with four known defects (section 13) |

### What it takes from each kit

| From OpenSpec | From Spec Kit | New in this kit |
|---|---|---|
| Living specs updated by added, modified and removed requirements | Numbered requirement IDs | A bug catalogue built into the coding agents |
| One planning step | Parallel task markers | A size limit on documents |
| A check that needs no AI | Running without a question or confirmation | A script, not an AI session, to merge specs |
| Requirements written as SHALL with WHEN/THEN scenarios and real values | A check that every requirement is covered by a task | A one-session path for bugfixes |
| | No broad pre-approved commands, no usage reporting | A review of every feature and change; tests against a real database |

## 5. Method

- **Same protocol as the other two kits** (`plans/261110-1210-openspec-vs-spec-kit-demo/implementation-phase-5.md`): the same three briefs byte for byte (asserted by `runs/tools/test/make-prompts.test.mjs`), each kit step a separate headless `claude -p` session through `runs/tools/run-step.mjs`, `--permission-mode acceptEdits`, the same done rule, the same hidden suite, nothing fixed by hand in the variant. [Verified: `runs/cyberrock/`]
- **Kit steps:** `propose` (`/cr-propose` + brief), `validate` (the kit script, run by the operator, recorded at cost 0 as OpenSpec's was), `apply` (`/cr-apply`; the parallel note on change 1 only). For the bugfix the kit finished inside `propose`, so no `apply` was run.
- **Design and research:** `plans/261111-1333-cyberrock-variant-kit/research.md` and `design.md`.
- **Code audit:** one read-only auditor with the `lean-audit` skill and the same rubric, limited to `cyberrock-variant/apps` and `libs`; it could not open the other audits, the reports or the kit's own documents. Result: `plans/reports/cyberrock-variant-code-audit.md`. The main session re-read the code for all four medium findings and checked B1–B12 line by line (section 11).
- **Metrics:** `runs/tools/code-metrics.mjs` and `runs/tools/complexity-metrics.mjs`, run on all three variants. They reproduce the earlier audit's file, test, query and complexity figures; duplication uses a different window rule, so only compare it across the three columns here.

## 6. Results

### 6.1 Totals

|  | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Setup (one-off) | 0:17, $1.35 | 0:46, $1.01 | 0:35, $1.28 |
| Three changes, real time | 48:41 | 1:12:52 | 52:05 |
| Three changes, cost | $36.13 | $55.53 | $33.10 |
| Three changes, turns | 408 | 505 | 184 |
| Three changes, output tokens | 335,297 | 491,696 | 352,185 |
| Three changes, all tokens | 22,341,485 | 25,146,586 | 17,049,070 |
| Kit steps run, AI and script | 15 | 18 | 10 |
| Kit documents written, lines | 2,034 | 3,770 | 550 |
| Code lines added | 1,582 | 1,675 | 1,583 |
| Test lines added | 2,734 | 3,467 | 4,220 |

Setup for the CyberRock kit is two smoke steps (the first ran before the folder was trusted). Its files were written by hand, so there is no AI install step to count.

### 6.2 Per change

| Change | Measure | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|---|
| Feature | Hidden acceptance tests | 30 of 30 | 30 of 30 | 30 of 30 |
|  | Build / lint / unit tests | pass / pass / 287 of 287 tests | pass / pass / 280 of 280 tests | pass / pass / 372 of 372 tests |
|  | Real time, all steps | 28:30 | 39:06 | 34:30 |
|  | Cost | $20.02 | $27.18 | $20.54 |
|  | Turns | 139 | 131 | 94 |
|  | Output tokens | 216,624 | 288,401 | 255,305 |
|  | All tokens, including cache reads | 11,566,666 | 12,579,345 | 10,670,434 |
|  | Kit steps run | 7 | 6 | 4 |
|  | Kit documents written | 12 files, 1,224 lines | 10 files, 1,605 lines | 5 files, 386 lines |
|  | Code changed | 49 files, +1,458 / -16 | 47 files, +1,534 / -16 | 41 file, +1,509 / -3 |
|  | Tests changed | 29 files, +2,254 / -1 | 31 file, +2,649 / -0 | 29 files, +3,201 / -0 |
| Brownfield change | Hidden acceptance tests | 37 of 37 | 37 of 37 | 37 of 37 |
|  | Build / lint / unit tests | pass / pass / 305 of 305 tests | pass / pass / 310 of 310 tests | pass / pass / 422 of 422 tests |
|  | Real time, all steps | 16:15 | 23:42 | 16:17 |
|  | Cost | $11.76 | $18.31 | $11.20 |
|  | Turns | 185 | 228 | 64 |
|  | Output tokens | 97,076 | 143,536 | 91,540 |
|  | All tokens, including cache reads | 8,328,851 | 8,042,357 | 5,713,032 |
|  | Kit steps run | 4 | 6 | 4 |
|  | Kit documents written | 10 files, 585 lines | 9 files, 1,265 lines | 4 files, 131 lines |
|  | Code changed | 9 files, +122 / -9 | 9 files, +139 / -21 | 7 files, +72 / -6 |
|  | Tests changed | 11 file, +469 / -149 | 11 file, +771 / -74 | 14 files, +991 / -6 |
| Bugfix | Hidden acceptance tests | 41 of 41 | 41 of 41 | 41 of 41 |
|  | Build / lint / unit tests | pass / pass / 309 of 309 tests | pass / pass / 321 of 321 tests | pass / pass / 429 of 429 tests |
|  | Real time, all steps | 3:56 | 10:03 | 1:18 |
|  | Cost | $4.35 | $10.05 | $1.37 |
|  | Turns | 84 | 146 | 26 |
|  | Output tokens | 21,597 | 59,759 | 5,340 |
|  | All tokens, including cache reads | 2,445,968 | 4,524,884 | 665,604 |
|  | Kit steps run | 4 | 6 | 2 |
|  | Kit documents written | 6 files, 225 lines | 9 files, 900 lines | 2 files, 33 lines |
|  | Code changed | 1 file, +2 / -2 | 1 file, +2 / -2 | 1 file, +2 / -2 |
|  | Tests changed | 1 file, +11 / -0 | 1 file, +47 / -0 | 1 file, +28 / -0 |

"Kit steps run" counts recorded sessions and script checks. A step that was interrupted and resumed counts twice here (OpenSpec's feature `apply`; the CyberRock kit's feature and brownfield `apply`) and is shown as one step in the console.

### 6.3 Per phase

| Change | Phase | OpenSpec time | OpenSpec cost | Spec Kit time | Spec Kit cost | CyberRock kit time | CyberRock kit cost |
|---|---|---|---|---|---|---|---|
| Feature | Specify | 6:50 | $3.97 | 3:11 | $2.98 | 5:34 | $3.18 |
|  | Plan | inside Specify | inside Specify | 11:40 | $7.31 | inside Specify | inside Specify |
|  | Check | 0:00 | $0.00 | 3:56 | $3.00 | 0:00 | $0.00 |
|  | Implement | 20:01 | $13.57 | 20:20 | $13.88 | 28:56 | $17.36 |
|  | Close | 1:39 | $2.48 | — | — | inside Implement | inside Implement |
| Brownfield change | Specify | 5:22 | $4.12 | 2:18 | $2.48 | 2:33 | $2.14 |
|  | Plan | inside Specify | inside Specify | 9:21 | $6.83 | inside Specify | inside Specify |
|  | Check | 0:00 | $0.00 | 3:00 | $2.53 | 0:00 | $0.00 |
|  | Implement | 9:27 | $5.85 | 9:03 | $6.47 | 13:44 | $9.06 |
|  | Close | 1:26 | $1.80 | — | — | inside Implement | inside Implement |
| Bugfix | Specify | 1:58 | $1.94 | 1:29 | $2.05 | 1:17 | $1.37 |
|  | Plan | inside Specify | inside Specify | 4:43 | $4.35 | inside Specify | inside Specify |
|  | Check | 0:00 | $0.00 | 1:23 | $0.91 | 0:00 | $0.00 |
|  | Implement | 1:20 | $1.36 | 2:28 | $2.73 | — | — |
|  | Close | 0:38 | $1.04 | — | — | inside Implement | inside Implement |

The CyberRock kit plans inside `propose` and merges specs by script at the end of `apply`, so it has no Plan or Close figure. Its bugfix ran entirely inside `propose`.

#### Why the CyberRock kit's bugfix shows only two steps, and no implement step

The kit's entry command, `/cr-propose`, reads the brief and decides how big the change is. For a bugfix it does the whole job in one session, where the other kits (and this kit for bigger changes) use separate sessions. The second step, `validate`, is the kit's script check, which the operator ran afterwards: under a second, no AI.

So the implementing did happen. It is inside the `propose` session, which is why the table above has no Implement figure for the bugfix. What that one 77-second session did [Verified: tool calls in `runs/cyberrock/change-3/propose.events.jsonl`]:

| Seconds | What it did | Phase it would be in another kit |
|---|---|---|
| 0–20 | Read the rules, searched the code, found the wrong line | Specify |
| 34 | Wrote the 26-line fix note with the cause | Specify and plan |
| 38–41 | Wrote the regression test and watched it fail | Implement |
| 47–49 | Fixed the two lines; the test passed | Implement |
| 55–56 | Ran build, lint and all unit tests | Implement |
| 67–69 | Ticked the tasks and merged the spec with the script | Close |

The time and cost recorded for the bugfix ($1.37, 1:17) are therefore complete: they cover specifying, implementing and closing. They are not split between those phases, because cost is recorded per session. The console labels this step "Specify, implement and close (one session)" for the same reason.

**Where the money moved [Verified: sums of the rows above].**

| | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| Before and after the code (specify, plan, check, close), three changes | $15.35 | $32.46 | $6.69 |
| Writing the code (implement), three changes | $20.78 | $23.08 | $26.42 |
| Total | $36.13 | $55.53 | $33.10 |

The kit saved $8.66 against OpenSpec around the code and spent $5.64 more on the code itself. Section 10 says what the extra bought.

### 6.4 Interventions

| Change | Kind | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|---|
| Feature | question | 0 | 0 | 0 |
|  | approval | 1 | 0 | 0 |
|  | reprompt | 1 | 0 | 0 |
|  | manual-fix | 0 | 0 | 0 |
|  | interruption | 1 | 0 | 1 |
|  | denied-permission | 1 | 1 | 0 |
| Brownfield change | question | 0 | 0 | 0 |
|  | approval | 0 | 0 | 0 |
|  | reprompt | 0 | 0 | 0 |
|  | manual-fix | 0 | 0 | 0 |
|  | interruption | 0 | 1 | 1 |
|  | denied-permission | 1 | 1 | 0 |
| Bugfix | question | 0 | 0 | 0 |
|  | approval | 0 | 0 | 0 |
|  | reprompt | 0 | 0 | 0 |
|  | manual-fix | 0 | 0 | 0 |
|  | interruption | 0 | 1 | 0 |
|  | denied-permission | 1 | 1 | 0 |

- **Feature, interruption [Verified: `runs/notes.md`; section 13.2 shows it was not the usage limit].** The `apply` session ended while its backend agent was still working. A headless Claude Code session stops background agents 10 minutes after the main session last spoke; the frontend agent reported at 9:12 and the backend agent was stopped at 19:19. The step was resumed once with "Continue." This is partly the kit's doing: its backend agent takes longer (18:49 against 14:16 and 15:37) because it also writes and runs real-database tests, and `cr-apply` does not tell the main session to wait.
- **Brownfield, interruption.** The account usage limit cut `apply` off after 61 seconds; resumed once. Not the kit's doing; its $1.80 is in the totals.
- **No question, approval or re-prompt** in any step, and no task left open.

### 6.5 Things that went wrong, kept on the record [Verified: `runs/notes.md`]

- **The first scoring of the brownfield change said 34 of 37 and was wrong.** Leftover processes from the previous scoring were still answering, running the previous change's code. The kit's session had started the application again for its database tests without stopping it, which overwrote the process-id files that `stack-reset.sh` relies on. After the operator stopped the leftover processes (no file in the variant was changed), the suite passed 37 of 37 twice. The contaminated result is kept as `runs/cyberrock/change-2/acceptance-summary.contaminated.json`.
- **The unit test run now needs Postgres.** The kit's rules say real-database tests skip themselves when `DB_HOST` is unset. Nx loads `.env` into every target, so it is always set. With the database down, `pnpm run test` fails.

## 7. What it optimises, with the measured result

Three changes, same briefs, same model, same rules for all three kits.

| What was optimised | How | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---:|---:|---:|
| Fixed cost of a small change (the bugfix) | One session for a bugfix | $4.35, 3:56 | $10.05, 10:03 | $1.37, 1:18 |
| AI sessions, three changes | Fewer steps; no separate check or close session | 12 | 18 | 7 |
| Cost before and after the code (specify, plan, check, close) | One planning step, script check, script merge | $15.35 | $32.46 | $6.69 |
| Cost of merging specs or closing | Done by the script | $5.32 | none (not merged) | $0 |
| Cost of the check before code | Done by the script | $0 | $6.44 | $0 |
| Kit documents written, lines | One file per change, size limit, each rule stated once | 2,034 | 3,770 | 550 |
| Tool calls refused by permissions | Skills and agents say how to read files and which commands exist | 74 | 65 | 5 |
| Main-session turns | Fewer steps; coding and review done by agents | 408 | 505 | 184 |
| All tokens | Fewer sessions, smaller documents | 22.3 M | 25.1 M | 17.0 M |
| Known bugs B1 to B12 present in the code | Bug catalogue in the coding agents | 8 | 11 | 2 |
| Guarantees enforced and tested in the database | Rules R-08 and R-09 | none | none | overlap constraint, 38 real-database tests |

What was **not** improved, or got worse:

| Measure | OpenSpec | Spec Kit | CyberRock kit | Why |
|---|---:|---:|---:|---|
| Total cost, three changes | $36.13 | $55.53 | $33.10 | Only 8% under OpenSpec: the saving around the code was mostly spent on the code |
| Total time, three changes | 48:41 | 1:12:52 | 52:05 | 7% over OpenSpec: longer coding steps, and one interruption |
| Cost of writing the code | $20.78 | $23.08 | $26.42 | More tests, real-database tests, a review and its fixes |
| Output tokens | 335,297 | 491,696 | 352,185 | 54% more test lines than OpenSpec |

In short: the kit moves spending from documents and process to tests and review. It does not make the whole job much cheaper.

## 8. How the kit used AI, and which levers worked

Measured with `runs/tools/profile-steps.mjs` over every step record of the three kits.

| Measure, three changes | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| AI sessions (including retries and resumes) | 12 | 18 | 7 |
| Main-session turns | 408 | 505 | 184 |
| Denied tool calls | 74 | 65 | 5 |
| All tokens | 22.3 M | 25.1 M | 17.0 M |
| Kit document lines | 2,034 | 3,770 | 550 |
| Cost of merging specs or closing | $5.32 | none | $0 (script) |
| Cost of the check before code | $0 (CLI) | $6.44 | $0 (script) |

### Where the money goes

A fit of cost against token counts over the recorded steps gives the effective prices: about $21.6 per million output tokens, $19.9 per million tokens entering a context for the first time (cache writes), and $0.15 per million tokens re-read (cache reads).

| Share of cost | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| Tokens entering a context for the first time | 69 to 82% | 71 to 82% | 67 to 86% |
| Text and code the model writes | 10 to 23% | 12 to 23% | 8 to 26% |
| Re-reading what is already in context | 7 to 11% | 6% | 6 to 7% |

So the way to save money is not to write less or to take fewer turns. It is to **start fewer contexts and put less into each one**. The kit's design follows from that:

- **Fewer contexts.** Two sessions per change, one for a bugfix. A coding agent is started only when backend and frontend both have work; otherwise the main session does the coding itself.
- **Less into each context.** One short change file is read once per session. Skills name what to read and say not to read whole folders. The instruction files are a quarter of Spec Kit's.
- **No wasted round trips.** The other kits lost 12 to 39 tool calls per change to commands the permission rules refused, because nothing told the model what was allowed. The kit's skills and agents say it; refused calls fell to 5 in total.

### What is given to a script, and what is given to AI

| Job | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Check the documents' format | Script | AI | Script |
| Check every requirement has a task, and the reverse | Not done | AI | Script |
| Tick finished tasks | AI, one edit each | AI, one edit each | Script, many in one call |
| Merge a change into the specs | AI | Not done | Script |
| Understand the brief and the code, write the requirements | AI | AI | AI |
| Write code and tests | AI | AI | AI, with the bug catalogue in the agent |
| Review the code written | Not done | Not done | AI, a separate agent with a fresh context |

The rule the kit follows: use a script where the answer is mechanical, and spend AI where it catches defects or does real work. The review agent is the clearest case of spending on purpose. Neither other kit reviews its code, and all 25 of their audit findings shipped.

### What the review bought

| Change | Findings the reviewer returned | Fixed test-first | Rejected with a reason |
|---|---:|---:|---:|
| Feature | 4 | 3: an oversized page number gave a 500; a NUL character in a title gave a 500; the edit form blocked a title-only save | 1 |
| Brownfield change | 2 | 1: the concurrency tests did not prove the room lock, so a test was added that fails when the lock is removed | 1 |
| Bugfix | none run | | |

### Which levers worked, and which did not

**Worked [Verified].**
- **Fewer sessions.** Every session loads about 50,000 tokens before it works. One session for the bugfix is why it cost $1.37.
- **Scripts for mechanical work.** Check, task ticking and the spec merge cost nothing.
- **One small document per change.** Planning cost $3.18, $2.14 and (for the whole bugfix) $1.37, against $3.97, $4.12 and $1.94 for OpenSpec's planning alone.
- **Telling the model how to use its tools.** Denied calls fell from 65–74 to 5.

**Did not work, or cost more than planned [Verified].**
- **The coding step is dearer, not cheaper**: $17.36 and $9.06 against OpenSpec's $13.57 and $5.85. More tests, real-database tests, the review and its fixes all enter a context and are paid for. This is a choice, but about 400 lines of the tests are call-shape specs the audit calls removable.
- **The main session did not wait for its coding agents**, which caused the feature interruption.
- **The database test recipe was wrong twice**: the skip condition (section 6.5) and the instruction to start the whole application when only the database is needed.

## 9. Code metrics

Kit-written code only (`apps` and `libs`, compared with `baseline/`), same scripts for all three.

| Metric | OpenSpec | Spec Kit | CyberRock kit |
|---|---:|---:|---:|
| Files changed | 89 | 91 | 84 |
| Source files / code lines | 55 / 1,668 | 52 / 1,713 | 45 / 1,580 |
| Spec files / code lines | 34 / 2,211 | 39 / 2,894 | 39 / 3,585 |
| Spec-to-source ratio | 1.33 | 1.69 | 2.27 |
| Test cases in kit-written specs | 172 | 182 | 233 |
| Spec files that run against a real Postgres | 0 | 0 | 6 |
| Unit tests run, whole scope (all pass) | 309 | 321 | 429 |
| Line / branch coverage, whole scope | 99.2% / 93.3% | 99.1% / 93.7% | 97.7% / 94.4% |
| Files over 200 lines | 0 | 0 | 1 (a spec, 201 lines) |
| Cyclomatic complexity: average / max | 1.73 / 14 | 1.79 / 10 | 1.73 / 11 |
| Functions with complexity over 5 | 2 | 4 | 3 |
| Functions over 50 lines | 4 | 4 | 2 |
| Functions with 4 or more parameters | 2 | 3 | 1 |
| Duplicated source lines (6-line windows, imports excluded) | 3.2% | 6.0% | 2.1% |
| Raw `.query(` calls | 7 | 11 | 9 |
| Transactions | 2, `dataSource.transaction` | 2, hand-rolled `queryRunner` | 2, `dataSource.transaction` |
| Database constraint behind the overlap rule | no | no | yes (`EXCLUDE USING gist`) |
| `interface` / `any` / wildcard imports / `eslint-disable` / `@ts-ignore` | 0 | 0 | 0 |

Notes: the 6 real-database spec files hold 38 tests; the operator re-ran them against the variant's Postgres after the last change and all 38 pass. OpenSpec and Spec Kit coverage figures are from the earlier audit; the CyberRock figure was measured with its database up, because its real-database tests run in the same target. Source figures for OpenSpec differ slightly from the earlier audit (55 files against 52) because this script compares with today's `baseline/` folder.

## 10. Code audit

Scores are each auditor's own, 1 to 5.

| Area | OpenSpec | Spec Kit | CyberRock kit |
|---|:---:|:---:|:---:|
| Code quality | 4 | 4 | 4 |
| Code smells | 4 | 4 | 4 |
| Structure | 5 | 4 | 4 |
| Duplication | 3 | 4 | 4 |
| Potential bugs | 3 | 3 | 3 |
| Security | 5 | 4 | 4 |
| Rule compliance | 5 | 5 | 4 |
| Tests | 3 | 3 | 4 |
| Maintainability | 4 | 3 | 4 |
| Frontend | 4 | 3 | 4 |
| **Total** | **40** | **37** | **39** |
| Findings (critical / high / medium / low) | 0 / 0 / 5 / 6 | 0 / 1 / 8 / 5 | 0 / 0 / 4 / 14 |

The four medium findings in the CyberRock code, all re-read and confirmed by the main session:

1. **A booking can be stored while the caller is told it failed, and its confirmation is then never sent** unless the caller repeats the request (`apps/booking/src/booking/booking.service.ts:58-65`, `confirmation.producer.ts:36-42`). The booking commits before the queue call. This is the reduced form of B3.
2. **Transport errors use up the worker's three attempts**, so a booking can stay `PENDING` after a restart of the booking service (`apps/worker/src/confirmation/confirmation.processor.ts:39-78`).
3. **The booking service refuses valid ISO 8601 times the contract accepts**, such as a time without seconds (`apps/booking/src/booking/booking-instant.ts:1-2`). The kit's rule against lenient date parsing was applied too strictly.
4. **The real-database tests skip silently when `DB_HOST` is unset** (line 11 of the `*.int.spec.ts` files). They are the only real proof of the two concurrency guarantees. This comes straight from the kit's own rules file.

What the auditor found strong [Verified: audit, "Strengths"]: no race in either core guarantee; both are enforced in Postgres and tested against a real database; one place per booking rule; the edit form sends only what changed. What it found weak: about 400 lines of unit specs that only check which ORM calls were made, next to real-database specs that already prove the same thing.

**Reading the scores [Judgement].** 39, 40 and 37 are within what one auditor differs from another. The solid differences are the ones that can be counted: no high finding, fewer medium ones, 10 of 12 known bugs gone, and the only variant whose concurrency guarantees are in the database and tested there.

## 11. The twelve known bugs

Each row was checked in the CyberRock code by the main session.

| # | Bug | Severity | OpenSpec | Spec Kit | CyberRock kit | Evidence in `cyberrock-variant/` |
|---|---|---|---|---|---|---|
| B1 | `PATCH` with `null` for a date stores 1970 | high | no | **yes** | no: rejected with 400 | `apps/booking/src/booking/booking-input.ts:61-66`, `booking-instant.ts:8-12` |
| B2 | Partial `PATCH` undoes a concurrent change | medium | **yes** | no | no: row lock, merge and write in one transaction, only changed fields written | `booking.repository.ts:77-96` |
| B3 | Confirmation job lost after commit | medium | **yes** | **yes** | **reduced**: 2 s timeout, 503 to the caller, a replay re-enqueues; still lost if the caller never retries | `confirmation.producer.ts:36-42`, `booking.service.ts:63-64` |
| B4 | Date without an offset read in server-local time | medium | no | **yes** | no: an offset is required | `booking-instant.ts:1-2` |
| B5 | Client drops the idempotency key on 503 | medium | no | **yes** | no: key kept on 5xx and "in progress" | `apps/web/src/views/bookings/use-idempotency-key.ts:13-28` |
| B6 | Empty page after deleting the last row | medium | no | **yes** | no: steps back to the last page | `use-bookings-list.ts:24-27` |
| B7 | Ordinal date misread | low | **yes** | **yes** | no: strict grammar | `booking-instant.ts:1-2` |
| B8 | Editing the title drops the seconds | low | **yes** | **yes** | no: only changed fields are sent | `edit-booking-dialog.tsx:25-29` |
| B9 | Same instant, different spelling, gets 422 | low | **yes** | **yes** | no: fingerprint uses parsed instants | `booking-fingerprint.ts:11-12` |
| B10 | Idempotency rows and finished jobs never cleaned up | low | **yes** | **yes** | **yes**: kept by a recorded decision | `confirmation.producer.ts:31-33` |
| B11 | Only the first 100 rooms load | low | **yes** | **yes** | no: pages through all rooms | `use-all-rooms.ts:7-14` |
| B12 | No database constraint against overlap | medium | **yes** | **yes** | no: exclusion constraint, mapped to 409 | `libs/backend-common/src/lib/database/migrations/1731400000000-add-bookings-overlap-exclusion.ts`, `booking.repository.ts:33-42` |

## 12. Lessons applied

For each mistake of the other two kits: the rule that now covers it, and whether the new code avoided it.

### 12.1 Bug classes (`cr/risks.md`, built into `cr-nestjs-expert` and `cr-nextjs-fe-developer`)

| Class | Rule | Result in the new code |
|---|---|---|
| R-01 explicit `null` on optional input | Optional is not nullable | Avoided (B1) |
| R-02 read-modify-write outside the guard | Merge inside the guard | Avoided (B2) |
| R-03 side effect after commit | Timeout, never swallow, state the recovery | **Partly**: timeout and 503 are there, no sweep or outbox; audit findings 1 and 2 |
| R-04 date-time without an offset | One helper; reject or UTC | Avoided (B4) |
| R-05 validator and parser disagree | Same strict grammar | Avoided (B7), **overshot**: also refuses valid forms (audit finding 3) |
| R-06 equality on raw input | Normalise before comparing | Avoided (B9) |
| R-07 unbounded growth | TTL, retention, or a recorded decision | **Not avoided**: the kit recorded a decision to keep them (B10) |
| R-08 invariant only in application code | Database constraint | Avoided (B12) |
| R-09 guarantee tested only against mocks | Real-database spec | Avoided: 6 spec files, 38 tests, one fails when the lock is removed. **Flawed**: they can skip silently (audit finding 4) |
| R-10 a test that locks in a bug | Assert requirements | **Partly**: no spec asserts a swallowed error, but three specs pin the behaviours of audit findings 1 to 3 |
| R-11 one rule, two homes | One function or schema per rule | Avoided: one overlap helper for create and update, one form schema and one fields component |
| R-12 hand-kept copy of the schema | Let the ORM do it | Avoided: `dataSource.transaction`, no `queryRunner`, no hand-kept column list |
| R-13 dead data | Do not add it | Mostly: no `response_status` column; the reviewer flagged an unread `created_at`, kept because the design names it |
| R-14 client retry identity | A retry is the same request | Avoided (B5) |
| R-15 list state after a mutation | Refetch and step back | Avoided (B6) |
| R-16 hardcoded fetch cap | Page through or show the cut | Avoided (B11) |
| R-17 precision lost on a round trip | Send only what changed | Avoided (B8) |

### 12.2 Process weaknesses (`research.md` section B)

| Weakness of the other kits | What the kit does | Result |
|---|---|---|
| No requirement IDs, no parallel markers (OpenSpec) | IDs on every requirement; `@be` / `@fe` tracks with disjoint files, checked by the script | Done: 34 IDs in the feature; two agents in parallel |
| Archive asks for confirmation; three attempts, $2.48 (OpenSpec) | Archive is a script | $0, no question, first attempt, all three changes |
| The model merges specs by hand (OpenSpec) | The script merges by ID | Done |
| Broad tool pre-approval, telemetry (OpenSpec) | Only `node cr/bin/cr.mjs` is pre-approved; no network code | Verified: `runs/cyberrock/install/deny-test.md` |
| Six AI sessions per change (Spec Kit) | Two for a feature or change, one for a bugfix | 3, 3 and 1 in practice, counting the two resumes |
| AI-only check, $0.91 to $3.00 (Spec Kit) | Script check | $0, under a second |
| Specs go stale (Spec Kit) | Living specs | `cr/specs/bookings.md` states the overlap rule after change 2 |
| Rules restated in up to seven files (Spec Kit) | One file per change with a size limit | 550 lines for three changes (2,034 and 3,770) |
| 1,520 instruction lines per pipeline (Spec Kit), 923 (OpenSpec) | Four skills and three agents | 381 lines |
| 12 to 39 denied tool calls per change (both) | Every skill and agent says how to read files and which commands exist | 5 denied calls in total, against 74 and 65 |
| No real-database test, no constraint (both) | R-08, R-09 | Done, with the flaw in section 13 |
| Form fields duplicated (both) | R-11 | Avoided |

## 13. The four defects in the kit

All four are in the kit's own instruction files, not in the application it built. They were found by these runs. **None is fixed**: nothing in `cyberrock-variant/` is changed by hand, and by the owner's decision the kit is left as tested and the defects are recorded here.

### 13.1 What each defect is, why it happened, and whether the other kits have it

| # | Defect | What it caused | Why it happened | OpenSpec and Spec Kit |
|---|---|---|---|---|
| 1 | **The main session does not wait for its coding agents.** `cr-apply` starts the backend and frontend agents in the background and ends its turn | Feature: the backend agent was stopped mid-work at 19:19 and the step had to be resumed once | The kit's author never wrote a "wait for the coding agents" instruction, because how background agents behave in a headless session was not checked before the runs | **Same risk, not triggered.** Both also ran their agents in the background and neither says to wait. Their backend agents finished about 7 minutes after the frontend ones (14:16 and 15:37 in total); this kit's took 18:49 because it also writes and runs database tests |
| 2 | **The recipe for real-database tests is wrong, in two ways.** (a) `cr/rules.md` says they skip when `DB_HOST` is unset; Nx loads `.env` into every target, so it is always set. (b) The rules send the session to `scripts/stack-up.sh`, which starts the whole application when the tests need only the database | (a) The normal unit run fails unless Postgres is running, and the tests can skip silently where `.env` is absent (audit finding 4). (b) Old application processes were left running and produced the false 34 of 37 on the brownfield change | The recipe was tried by running the test command directly, where it worked. It was not tried through `pnpm run test`. The "skip when the database is not configured" rule rested on an assumption nobody checked. `stack-up.sh` was named because it was the script that existed, without thinking through that it leaves processes behind | **Not present**, because neither wrote a real-database test at all. The earlier audit counts that absence as a medium finding for both. Their sessions only read the stack scripts and never started the stack (checked in the recordings); the CyberRock sessions started it four times |
| 3 | **The strict date rule refuses valid dates.** The booking service accepts only `YYYY-MM-DDTHH:mm:ss[.f](Z or offset)` | A valid time without seconds, such as `2030-01-07T09:00Z`, gets a 400 (audit finding 3). The hidden tests do not cover it | Rule R-05 was written as "validate and parse with the same strict grammar" and left out "but still accept everything the contract accepts". The agent followed the rule as written | **Not present; they have the opposite problem.** Both accept an ordinal date like `2030-007` and store the wrong day (B7); Spec Kit also reads a time without a zone in server-local time (B4) |
| 4 | **The backend agent writes low-value tests.** About 400 lines of unit specs only check which database calls were made | Part of why the coding step cost more than OpenSpec's ($17.36 against $13.57 on the feature) | The agent was told to add a real-database test for each guarantee, but never told to stop writing the call-checking kind. It did both | **Same kind of test, and worse for them.** The earlier audit found both kits' repository specs check SQL strings and call order; for them those are the only tests of the locking and overlap rules |

One more rule is too weak, though it did not come from a mistake in the kit's text: R-03 (work done after a database commit). A booking can still stay unconfirmed if the caller never retries (audit findings 1 and 2). The rule should require a recovery path that does not depend on the caller.

### 13.2 The feature interruption was not the usage limit

The two interruptions had different causes. [Verified: `rate_limit_event` entries in `runs/cyberrock/change-1/apply.events.jsonl` and `change-2/apply.events.jsonl`]

| | Feature | Brownfield change |
|---|---|---|
| Rate-limit status during the step | "allowed" on all 33 checks, the last one 10 seconds before the stop | Warnings at 97%, 98%, 99%, then "rejected" at 57 seconds |
| Message in the log | None about limits | "You've hit your 5-hour limit · resets 3pm" |
| When it stopped | 1,159 s: exactly 600 s after the main session's last turn at 559 s | 60 s |
| What the resume needed | Nothing: it ran at once and worked for 9½ minutes | Waiting for the limit to reset |

That a headless session stops background agents 10 minutes after the main session goes quiet is an inference from this timing, not something confirmed in Claude Code's documentation. [Judgement] Two things support it: the stop came exactly 600 seconds after the main session's last turn, and in the brownfield change's resumed step the same pattern worked, because the backend agent finished about 8½ minutes in.

### 13.3 Why this kit had these defects and the other two did not

- **It is a first version, written in one pass, and it had never been run before the measured runs.** Each defect traces back to something its author wrote or failed to check (column "Why it happened" above).
- **Three of the four sit in steps the other kits do not have** (database tests, a strict date rule, a second kind of test), so the other kits had nothing to get wrong there.
- **OpenSpec (1.16) and Spec Kit (1.3) are released tools that many people have already used**, so mistakes of this kind were found and fixed long ago. They still had their own problems in this demo: OpenSpec's archive step needed three attempts, and Spec Kit ran six sessions for a two-line fix.
- **The no-hand-fixes rule meant nothing could be corrected mid-run** once a defect appeared, so all four are still in the tested variant.
- **A dry run of the kit on a throwaway change before the measured runs would have caught at least defects 1 and 2.** It was skipped; the kit went straight to the measured runs.

### 13.4 What the fixes would be

Not applied. Listed so the cost of a pilot can be judged.

| # | File | Change |
|---|---|---|
| 1 | `.claude/skills/cr-apply/SKILL.md` | Start the coding agents in the foreground, as it already does for the reviewer |
| 2 | `cr/rules.md` | Switch real-database tests on with an explicit flag in their own command, not on `DB_HOST`; start only the containers (`docker compose up -d --wait`); report a skipped database test |
| 3 | `cr/risks.md` (R-05, R-03) | R-05: accept every form the contract's validator accepts, or tighten the contract. R-03: require a recovery path that does not depend on the caller, and do not spend retry attempts on transport errors |
| 4 | `.claude/agents/cr-nestjs-expert.md` | No call-checking spec for a guarantee a real-database spec already proves |

## 14. Porting guide for the CyberRock repo

| Step | What to do |
|---|---|
| Copy | `cr/bin/` (script and its tests), `cr/risks.md`, `.claude/skills/cr-propose`, `cr-apply`, `cr-fix`, `cr-review`, `.claude/agents/cr-nestjs-expert.md`, `cr-nextjs-fe-developer.md`, `cr-reviewer.md` |
| Rewrite | `cr/rules.md`: CyberRock's stack, conventions, commands and project rules. It is the only file with project facts. Point it at the shared rules (`RULES.md` R1 to R11, including R11 `LikePatternHelper`) |
| Start empty | `cr/specs/` and `cr/changes/archive/`. Specs fill in as changes are archived; write a spec for an existing area the first time a change touches it |
| Settings | Allow `Bash(node cr/bin/cr.mjs:*)` and the repo's own build, lint and test commands. Deny `Bash(git push:*)` and `Bash(git remote:*)` only if agents must not push |
| CI | `node --test "cr/bin/test/*.test.mjs"` and `node cr/bin/cr.mjs validate --strict` (fails on a malformed change or one that is finished but not archived) |
| Replace | The existing backend and frontend coding agents, if any, by the `cr-` ones; keep `manual-tester` and the other skills |
| Apply first | The four fixes listed in section 13.4 (not applied in this repository) |
| Adjust | The size limits in `cr/bin/lib/validate.mjs` (`BUDGET`) if real CyberRock changes need more room |
| Decide | Whether `cr/` is committed. It should be: the living specs are only useful if everyone sees them |

Nothing in the skills, agents, catalogue or script names roombook. [Verified: `grep -ril roombook cyberrock-variant/.claude/skills/cr-* cyberrock-variant/.claude/agents cyberrock-variant/cr/risks.md cyberrock-variant/cr/bin` finds nothing]

## 15. Limitations

- **One run per kit, one operator, one model.** The cost gap to OpenSpec (8%) is inside what a second run could reverse; the gap to Spec Kit, the bugfix result and the document counts are not.
- **The CyberRock kit ran a day later**, after the other two and never interleaved with them. The parent `.claude/` folder had gained four `lean-*` skills and a `prompt` skill in between, and the folder had moved (`runs/notes.md`).
- **This result does not yet prove the same gain on new work.** The kit's bug catalogue was written from these three changes. Ten of twelve known bugs gone here shows the catalogue works when the bug is in it; the four new medium findings show what happens when it is not. The pilot is what tests that.
- **Audits are AI-based, one auditor per variant.** The CyberRock auditor's brief asked it explicitly to be strict, which may explain part of its 14 low findings.
- **Concurrency was executed for the CyberRock variant only** (its own real-database tests); for the other two it was traced by reading.
- **Cost is Claude Code's client-side estimate at list prices.**
