# Origin story: OpenSpec vs Spec Kit

This file tells why this project exists and how it was run, from the first question to the final recommendation. For how to run it, see [SETUP.md](SETUP.md). For the full results, see the reports listed at the end.

## 1. Why this exists

The team needed to pick a spec-driven development framework. In spec-driven development, an AI agent first writes down what a change should do (the spec), then plans it, then writes the code against that spec. Two frameworks were on the table: **OpenSpec** and **GitHub Spec Kit**.

Jira ticket ACME-1 asked whether Acme should adopt OpenSpec. A security audit had already answered "is it safe to install?". It could not answer the practical question: **what does each framework cost, and what does it give back, when a developer uses it for real work?** Reading the docs does not answer that. Watching both do the same work does.

## 2. The idea: let the AI do all the work

The plan was simple to state: give both frameworks the same jobs, let Claude do every job through each framework, and measure what happens. **No person writes or fixes code at any point.** The person's role is to ask the question, approve the design and plan, and read the results.

This mattered for two reasons:

- It is how the team would actually use these frameworks: as the process an AI agent follows.
- A hand fix would hide a framework's weakness and make the comparison unfair. The design lists "one variant is fixed by hand" as a way the whole demo fails.

Who wrote what, exactly:

| Part | Written by |
|---|---|
| Research, design, plan, briefs, hidden test suite, recording tools | Claude, in the main session, with the owner approving the design and plan |
| The starting codebase (`baseline/`) | Two Claude agents in parallel (`nestjs-expert` for the backend, `nextjs-fe-developer` for the web app), joined by the main session, without either framework |
| Each framework's own skills, slash commands and templates | The framework itself: `openspec init` and `specify init` generated them. No one wrote or edited them |
| Each framework's project rules | The framework itself, from one shared rules file: OpenSpec keeps the file in `openspec/config.yaml`, and Spec Kit's own `/speckit-constitution` step turned it into its constitution |
| The three changes in `openspec-variant/` and `speckit-variant/` | Claude, driven only by that variant's framework, with no hand fixes |

One part was shared rather than built by the frameworks: the two coding agents above. Both copies had the same `nestjs-expert` and `nextjs-fe-developer`, and both frameworks were told to hand the feature's backend and frontend work to them, so neither framework got better helpers than the other.

## 3. Setting up a fair test

A comparison is only useful if the two sides start equal and are scored the same way. Each rule below exists to close one gap.

- **One frozen starting point.** A small meeting-room booking system called roombook, shaped like Acme (an HTTP gateway, two NATS services, a BullMQ worker and a Next.js web app, on Postgres and Redis) but with no Acme code, data or secrets. It was built once and tagged `baseline-v1`. It has one working feature (the room list) and one deliberately planted bug.
- **Two isolated copies.** `openspec-variant/` and `speckit-variant/` are each a full copy of the baseline with only one framework installed, so neither can see or be influenced by the other.
- **A fixed contract.** The API (`libs/contract`) was written into the baseline, so both frameworks built the same thing. They were not judged on API design.
- **Identical briefs.** The same written brief for each change reached both frameworks word for word. A fixed rule covered any question a framework asked: answer only from the brief and the contract, otherwise "choose the simplest option and record it as an assumption".
- **Hidden tests.** 41 HTTP tests were written before either framework ran, kept outside both copies and never shown to either.
- **Everything recorded.** Each framework step ran as its own headless Claude Code session on the same model (`claude-fable-5-2`) with the same settings. Time, tokens, cost and every event were saved in `runs/`.
- **Each framework set itself up.** Each one generated its own skills, slash commands and templates with its own install command. Both were given the same project rules and stored them their own way. Nothing a framework generated was edited by hand, so each worked with exactly the setup it ships.
- **Hardened installs.** OpenSpec 1.16.1 and Spec Kit 1.3.3 were pinned to exact versions, with telemetry, hooks and risky commands switched off as the security audit required. That was done through settings and install options, not by editing the frameworks' files.

## 4. Three jobs: a feature, a change, a bug

Building something new is the easy case. Most real work is changing what already exists and fixing what is broken. So each framework did three jobs, in the same order:

1. **Feature, built from scratch:** room bookings on the API and a new `/bookings` page, with protection against duplicate submissions and a confirmation job that retries. 22 new hidden tests.
2. **Brownfield change:** stop rooms from being double-booked. "Brownfield" means changing existing behaviour, here behaviour each framework had specified itself in job 1. This shows how a framework keeps its own specs true over time. 7 new hidden tests.
3. **Bugfix:** find, write up and fix the planted bug that showed the wrong rooms on page 2. This shows how heavy each process is for a tiny change. 4 new hidden tests.

Both frameworks passed every hidden test on every job: 30 of 30, then 37 of 37, then 41 of 41. Builds, lint and unit tests passed each time, and no coding-rule breaks were found.

## 5. What each framework's setup cost and gave back

With correctness equal, the difference is in the process each framework puts around the AI.

| | OpenSpec | Spec Kit |
|---|---|---|
| What it generated for itself | 15 files: 6 skills, 6 slash commands, an `openspec/` folder | 29 files: 9 skills and a `.specify/` folder of templates and scripts |
| Steps per change | propose → validate → apply → archive | specify → clarify → plan → tasks → analyze → implement |
| Time, three jobs | 48 min 41 s | 1 h 12 min 52 s |
| Cost, three jobs | $36.13 | $55.53 |
| Tokens, three jobs (output) | 22.3 million (335,297) | 25.1 million (491,696) |
| Framework documents written | 2,034 lines | 3,770 lines |
| Bugfix alone | 3 min 56 s, $4.35 | 10 min 03 s, $10.05 |

What the numbers show:

- **Writing the code cost the same.** On the feature, the coding step took $13.57 with OpenSpec and $13.88 with Spec Kit. The difference is everything before the code: Spec Kit plans in four steps and runs an AI check, while OpenSpec plans in one step and checks with a command.
- **Process weight is fixed per change.** For the 2-line bugfix, about 95% of the lines each framework added were its own documents. Spec Kit ran its full feature process on a bug; its docs suggest a lighter bug path, which was not tested.
- **Only OpenSpec has a check that needs no AI.** `openspec validate --strict` took about 0.2 seconds and cost nothing, so it can run in a build pipeline. Spec Kit's `/speckit-analyze` took 1 to 4 minutes and $0.91 to $3.00 a run, but it reads the plan against the code and found real problems early.
- **OpenSpec keeps one current spec; Spec Kit keeps a history.** After the brownfield change, OpenSpec's `openspec/specs/` described how the system works now. Spec Kit added a second spec, and its first spec still says overlapping bookings are allowed.
- **Spec Kit ran unattended more smoothly.** It needed no questions, confirmations or re-runs. OpenSpec's archive step asked for a confirmation, which had to be answered by re-running the step with the answer in the prompt. Spec Kit also marks tasks that can run in parallel (`[P]`, 57 of its 91 feature tasks); OpenSpec has no such marker.

## 6. A second look at the code

Passing tests says the code works. It does not say the code is good to live with. So the last stage reviewed the code itself.

The reviewers needed a method. Rather than install a third-party plugin, the owner had the open-source [Ponytail](https://github.com/DietrichGebert/ponytail) skills (MIT licence, commit `96608e0`) read in full and rewritten as local skills: `lean-change`, `lean-audit`, `lean-review` and `lean-debt`. They keep Ponytail's core rules (every finding needs a concrete failing case; fix with the smallest change) and add this repo's coding rules, a read-only guardrail and severity levels. Nothing was installed and no hooks or scripts were copied; two Ponytail skills that only describe the plugin were left out. The details are in [.claude/skills/THIRD-PARTY-SKILLS.md](.claude/skills/THIRD-PARTY-SKILLS.md).

How the audit ran:

1. The same scripts measured both copies first: size, tests, coverage, complexity and duplication.
2. Two reviewers ran **in parallel**, one per framework, with the same brief and the `lean-audit` checklist. Each could see only its own copy, so neither review shaped the other.
3. One final pass re-checked the serious findings in the code, and looked for each bug in the *other* framework's code too, so a bug one reviewer missed would not count as an advantage.

What it found:

- **The code is close in quality.** Same architecture, no rule breaks, about 99% unit-test line coverage in both, and about half the problems shared. Shared problems point to the model and the brief, not the framework.
- **OpenSpec is slightly ahead:** a score of 40 against 37 out of 50, 11 findings (none high) against 14 (one high), and 18% less code for the same behaviour.
- **Each has its own worst bug.** In OpenSpec, a partial edit can silently undo another person's edit made at the same moment. In Spec Kit, sending `"startsAt": null` moves a booking's start to 1 January 1970.
- **Neither tested the most important rule against a real database.** The double-booking protection is tested only with mocks in both, and neither added a database constraint.

## 7. What we concluded

**Adopt OpenSpec, as a pilot on one service.** It reached the same correct result in about two thirds of the time and cost. Its advantage was largest on changes to existing behaviour and on small fixes, which is most of the team's daily work. The code audit showed the cheaper process did not buy worse code.

Spec Kit remains the better choice only if numbered requirements and its built-in AI analysis matter more than roughly half again the time and cost per change.

The pilot comes with conditions: the security settings from the audit, OpenSpec's check in the build pipeline, archiving as part of "done", and three items from the code audit that neither framework handled (a real-database test of the double-booking race, a database constraint against overlaps, and a retry for confirmations that failed to queue).

## 8. What is still open

- **One run each.** One run per framework, one model, one operator. A second run could differ, and some framework-specific bugs are the kind another run could reverse.
- **The API was given.** The frameworks did not have to design it.
- **The lighter bug path was not measured.** Spec Kit's opt-in bug path was not tested, so its bugfix figure is its full process.
- **Concurrency was read, not run.** The code audit traced the locking code by reading it; no database was running.
- **Pilot questions remain.** How OpenSpec's confirmation step feels in everyday interactive use, and whether `openspec/` should be committed, are still to be settled.

## 9. Where to read more

| What | Where |
|---|---|
| Board summary | https://claude.ai/artifact/RdzjJseMj16ZxsaE5jZH3K |
| Full report, with evidence for every statement | https://claude.ai/artifact/QfV93Wb2UZEH9wMZc33UcH, locally [reports/openspec-vs-spec-kit-comparison.md](reports/openspec-vs-spec-kit-comparison.md) |
| Code audit | https://claude.ai/artifact/J69PYSozk2S47BbKJwgtzN, locally [reports/openspec-vs-spec-kit-code-audit.md](reports/openspec-vs-spec-kit-code-audit.md) |
| How to run, test and present it | [SETUP.md](SETUP.md) |
| The side-by-side replay console | [CONSOLE.md](CONSOLE.md) |
| Design and plan behind the demo | [plans/261110-1210-openspec-vs-spec-kit-demo/](plans/261110-1210-openspec-vs-spec-kit-demo/) |
| Raw recordings and run notes | [runs/](runs/), [runs/notes.md](runs/notes.md) |
