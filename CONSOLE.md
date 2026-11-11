# The comparison console

The console is a local web page that replays what OpenSpec, Spec Kit and the CyberRock kit actually did, side by side, for each of the three changes they were given. The CyberRock kit is this team's own kit, built from the lessons of the other two and run a day later under the same rules (see `reports/cyberrock-variant-evaluation.md`). It is the part of this demo meant for showing to people.

- **It only replays recordings.** It never starts a kit and never calls Claude, so using it costs nothing.
- **It needs no app running.** Everything it shows comes from the recordings in `runs/`, the saved timelines in `runs/timelines/` and the git history of `cyberrock-variant/`.
- **Every figure on screen is the recorded one:** times, tokens, cost, documents, test results.

For what this repository is, see [README.md](README.md). For running the apps and testing them by hand, see [SETUP.md](SETUP.md).

## Start it

```bash
./demo.sh up        # starts the three apps and the console
./demo.sh console   # or only the console, in the foreground
```

Then open http://127.0.0.1:4300. To open a scene directly, add `?scene=1` (Feature), `?scene=2` (Brownfield change) or `?scene=3` (Bugfix) to the address.

The console listens on this machine only (`127.0.0.1`).

## The three scenes

Each kit was given the same three changes, one after the other, on its own copy of the same starting codebase (the baseline). Each change had a written brief, identical for all three kits. A hidden suite of HTTP tests checked the result after each change; the kits never saw it.

| Scene | In one line | Hidden tests after it |
|---|---|---|
| Feature | Build room bookings from scratch | 30 (8 existing + 22 new) |
| Brownfield change | Stop rooms from being double-booked | 37 (30 + 7 new) |
| Bugfix | Fix the rooms page showing the wrong rooms | 41 (37 + 4 new) |

### 1. Feature: room bookings, built from scratch

**Before**
- The app had a working rooms page (`/rooms`) and nothing else.
- The booking and worker services existed but only answered health checks.
- The navigation had one link, "Rooms".
- `POST /api/bookings` answered 404.

**What the brief asked for**
- **A bookings API:** create, list (filterable by room, ordered by start time, paged), read, edit and delete.
- **Validation:** a booking must end after it starts, and the room must exist.
- **Safe to retry:** creating a booking needs an `Idempotency-Key` header.
  - Sending the same request twice returns the first answer again and creates nothing new.
  - The same key with a different body is rejected (422).
  - Two identical requests arriving at once never create two bookings.
- **A confirmation job:** every new booking queues one confirmation, tried up to 3 times (so at most 2 retries). Sending is simulated:
  - `@retry.example` addresses fail twice and then succeed;
  - `@bounce.example` addresses always fail.
- **A `/bookings` page:** a table with a room filter, a create form, and edit and delete, plus a "Bookings" link in the navigation.

**After (all three kits)**
- All of the above works through the API and on each kit's own `/bookings` page.
- All pass all 22 new hidden tests and the 8 existing ones.

**What to watch for in this scene**
- **OpenSpec plans in a single step** (`propose`), which writes a proposal, a design, four spec files and 34 tasks. Spec Kit plans in four steps (`specify`, `clarify`, `plan`, `tasks`) and ends with 91 tasks, 57 of them marked as parallel.
- **Spec Kit runs an AI check** (`analyze`) before coding. It found three high-severity inconsistencies in its own plan. OpenSpec's check (`validate`) is a command-line check that takes under a second and costs nothing.
- **Coding takes the same time and cost with OpenSpec and Spec Kit:** about 20 minutes and about $13.6–13.9. In all three kits, a backend agent and a frontend agent worked at the same time.
- **The CyberRock kit plans in one step and writes one file:** a 215-line change file with 34 numbered requirements, a risk table and 28 tasks. Its check is a script, like OpenSpec's.
- **The CyberRock kit's `apply` does more than the others' coding step, and costs more:** 28:56 and $17.36. It wrote 3,201 lines of tests, 17 of them running against the real database, then had the diff reviewed by a separate agent and fixed three of its four findings. Merging the change into the living specs is a script at the end of the same step, so there is no closing step.
- **The CyberRock kit's `apply` was interrupted once and resumed.** It is shown as one step, with the time, cost and turns of both parts added together (28:56, $17.36). `reports/cyberrock-variant-evaluation.md` section 13 has what the recordings show about the cause.
- **OpenSpec's closing step (`archive`) ran three times.** It asks for confirmation before archiving. The first attempt stopped at that question; the second, which answered it by continuing the session, was blocked by permissions; the third, with the answers written into the request, finished. All three are shown, and their cost is counted.
- **OpenSpec's `apply` was interrupted once and resumed.** The account's usage limit cut the first part off; the second part resumed it. It is shown as one step, with both parts added together (20:01, $13.57).

| | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Real time | 28:30 | 39:06 | 34:30 |
| Cost | $20.02 | $27.18 | $20.54 |
| Steps shown | propose, validate, apply, archive ×3 | specify, clarify, plan, tasks, analyze, implement | propose, validate, apply |
| Documents written | 1,224 lines | 1,605 lines | 386 lines |
| Code / tests added | 1,458 / 2,254 lines | 1,534 / 2,649 lines | 1,509 / 3,201 lines |
| Hidden tests | 30 of 30 | 30 of 30 | 30 of 30 |

**Where the time went** (OpenSpec was fastest; Spec Kit took 10:36 longer, the CyberRock kit 6:00 longer)

| Phase | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Specify and plan | 6:50 (one step) | 14:50 (four steps) | 5:34 (one step) |
| Check | under 1 s | 3:56 | under 1 s |
| Implement | 20:01 | 20:20 | 28:56 (includes review and the spec merge) |
| Close | 1:39 | none | inside Implement |

Spec Kit against OpenSpec:

1. **It plans in more steps and writes more.** Its `plan` and `tasks` steps alone took 11:40, producing a technical plan, research notes, a data model, three contract files, a quickstart and 91 tasks, against OpenSpec's 34.
2. **Its check is an AI session.** `analyze` cross-checks spec, plan and tasks in 3:56; OpenSpec's check is a command-line format check that takes under a second.

The CyberRock kit against OpenSpec:

1. **Its implement step did more work and was interrupted once.** 28:56 against 20:01: more tests (3,201 lines against 2,254), 17 tests against the real database, a review and three fixes, and one resume after its backend agent was stopped.
2. **It was faster before and after the code.** Planning took 5:34 against 6:50, and the spec merge is a script, where OpenSpec's `archive` took 1:39 over three attempts.

### 2. Brownfield change: no more double-booked rooms

"Brownfield" means changing behaviour that already exists, as opposed to building something new. This is the kind of work most teams do most days.

**Before**
- Two bookings for the same room at the same time were both accepted.
- Each kit's own specification from the Feature scene said so, or did not forbid it.

**What the brief asked for**
- **Overlap rule:** a create or edit that overlaps another booking of the same room is rejected with 409 and the new error code `CONFLICT.BOOKING_OVERLAP`.
- **Allowed cases:**
  - back-to-back bookings, where one starts exactly when another ends;
  - the same time in a different room;
  - editing a booking within its own time, such as renaming or shortening it.
- **Simultaneous requests:** two overlapping requests arriving at the same moment: exactly one succeeds.
- **Contract:** add the new error code to the shared contract.
- **Page:** show the error next to the form and keep what the user typed.
- **Everything else unchanged:** in particular safe-to-retry create and the confirmation job.

**After (all three kits)**
- The second of two overlapping bookings gets 409; all the allowed cases succeed.
- All pass all 7 new hidden tests and every earlier one (37 of 37).
- **All chose the same design independently.** They lock the room inside the database transaction, then look for any booking of that room where the existing start is before the new end and the existing end is after the new start, skipping the booking being edited.

**What to watch for in this scene**

This scene is about how each kit keeps its own specification true when behaviour changes.

- **OpenSpec writes change notes against the specs it already has** (across three areas: seven requirements added, two changed, one removed). Its closing step merges them in. Afterwards `openspec/specs/bookings-api/spec.md` states the overlap rule: one file per area tells you how the system behaves now.
- **Spec Kit writes a new numbered spec** (`specs/002-prevent-booking-overlap/`), with its own plan and 30 tasks. It says it overrides part of spec 001 but leaves 001 unedited. Afterwards `specs/001-room-bookings/spec.md` still says overlapping bookings are accepted, so a reader has to read 001 and 002 together.
- **The CyberRock kit writes one 100-line change file against its living specs** (five requirements added, three changed, all with IDs). A script merges it at the end of `apply`. Afterwards `cr/specs/bookings.md` states the overlap rule. It is also the only kit that put the rule into the database as a constraint and tested the lock against a real Postgres (38 such tests).
- **The CyberRock kit's `apply` was interrupted once here too, and resumed.** The account's usage limit cut the first part off after 61 seconds. It is shown as one step with both parts added together (13:44, $9.06).

| | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Real time | 16:15 | 23:42 | 16:17 |
| Cost | $11.76 | $18.31 | $11.20 |
| Steps shown | propose, validate, apply, archive | specify, clarify, plan, tasks, analyze, implement | propose, validate, apply |
| Documents written | 585 lines | 1,265 lines | 131 lines |
| Code added | 122 lines | 139 lines | 72 lines |
| Tests added | 469 lines | 771 lines | 991 lines |
| Hidden tests | 37 of 37 | 37 of 37 | 37 of 37 |

**Where the time went** (OpenSpec was fastest by two seconds; Spec Kit took 7:27 longer)

| Phase | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Specify and plan | 5:22 | 11:39 | 2:33 |
| Check | under 1 s | 3:00 | under 1 s |
| Implement | 9:27 | 9:03 | 13:44 (includes review and the spec merge) |
| Close | 1:26 | none | inside Implement |

Spec Kit against OpenSpec:

1. **It writes a complete new spec for the change; OpenSpec only writes what changes.** OpenSpec added 585 lines of notes against its existing specs in one step. Spec Kit started a fresh spec folder with its own plan, research, data model, contracts, quickstart and 30 tasks: 1,265 lines over four steps. Spec Kit actually wrote the code slightly faster.
2. **The AI check again:** 3:00, against under a second.

The CyberRock kit against OpenSpec: planning was faster (2:33 against 5:22) and there is no closing step, but implementing took 13:44 against 9:27. It added the database constraint and 38 real-database tests, had the diff reviewed, and lost about a minute to the usage limit.

### 3. Bugfix: wrong rooms on page 2

**The bug.** It was planted on purpose in the starting codebase, in the room list, which neither kit had written. On the rooms page, choose 5 rooms per page and go to page 2.

| | Page 2 at 5 per page shows |
|---|---|
| Before | Room 11, Room 12 (wrong) |
| After, all three kits | Room 06, 07, 08, 09, 10 (right) |

**The cause.** One line worked out how many rooms to skip using the default page size, 10, instead of the page size the user chose:

```
skip: (query.page - 1) * DEFAULT_PAGE_SIZE   // before: page 2 always skips 10 rooms
skip: (query.page - 1) * query.limit         // after: page 2 at 5 per page skips 5
```

It went unnoticed because page 1 always skips nothing, and at the default 10 per page the two values are equal. The starting codebase's own tests only checked those two cases.

**What the brief asked for.** A bug report describing the symptom. The kit had to analyse the cause and write it up before changing code, then fix it and add a test that fails without the fix.

**After (all three kits)**
- All made the same 2-line fix and added a regression test.
- All pass all 4 new hidden tests and every earlier one (41 of 41).
- All had already noticed this bug while reading the code during the Feature scene. They left it alone, because the brief put the room service out of scope.

**What to watch for in this scene.** The code change is tiny, so almost everything you see is each kit's process.

- **OpenSpec:** a proposal, a design and a small spec recording the correct paging (225 lines of documents), an 11-line test, under 4 minutes.
- **Spec Kit:** its full feature process: spec, plan, research, data model, contracts, quickstart and tasks (900 lines of documents), a 47-line test, about 10 minutes.
- **The CyberRock kit:** one session. Its entry step recognised the brief as a bugfix and took its light path: a 26-line fix note with the cause, a 28-line test, the fix, the checks and the spec merge, in 1 minute 17 seconds. There is no separate implement step in this scene: the strip shows `propose`, labelled "Specify, implement and close (one session)", and the script check.

Spec Kit's own guidance says a bug fix does not need its full process, and it offers a separate bug-fix add-on. That add-on was not used: OpenSpec and Spec Kit ran their full process here so they could be compared side by side. The CyberRock kit chooses its light path by itself, from the same brief.

| | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Real time | 3:56 | 10:03 | 1:18 |
| Cost | $4.35 | $10.05 | $1.37 |
| Steps shown | propose, validate, apply, archive | specify, clarify, plan, tasks, analyze, implement | propose, validate |
| Documents written | 225 lines | 900 lines | 33 lines |
| Code changed | 2 lines | 2 lines | 2 lines |
| Regression test | 11 lines | 47 lines | 28 lines |
| Hidden tests | 41 of 41 | 41 of 41 | 41 of 41 |

**Where the time went** (the CyberRock kit was fastest; OpenSpec took 2:39 longer, Spec Kit 8:45 longer)

| Phase | OpenSpec | Spec Kit | CyberRock kit |
|---|---|---|---|
| Specify and plan | 1:58 | 6:12 | 1:17 (the whole fix) |
| Check | under 1 s | 1:23 | under 1 s |
| Implement | 1:20 | 2:28 | inside Specify |
| Close | 0:38 | none | inside Specify |

OpenSpec against the CyberRock kit: it ran three AI sessions (propose, apply, archive) where the CyberRock kit ran one, and every session loads about 50,000 tokens of context before it does any work.

Spec Kit against OpenSpec:

1. **It ran its full feature process for a 2-line fix.** Its `plan` and `tasks` steps alone (4:43) took longer than OpenSpec's whole run (3:56), producing research, a data model, two contract files, a quickstart and 15 tasks: 900 lines against OpenSpec's 4 tasks and 225 lines.
2. **More tasks meant longer coding.** With 15 tasks, including verification steps, it wrote a 47-line test against OpenSpec's 11 lines: 2:28 against 1:20 for the same fix, plus 1:23 for the AI check.

## What is on the screen

### Top of the page
- **Scene buttons:** Feature, Brownfield change, Bugfix.
- **"What this scene is for" panel:** a one-line purpose, then three columns: **Starting point** (what the kits start from; for Feature that is the codebase and its structure, each kit's own skills and commands, the shared project rules and the coding agents), **The job** (what the brief asks and how many new hidden tests score it) and **What it shows** (what the scene tests, without giving away the result). The text is in `console/public/scene-intros.js`.
- **Banner:** says the run is recorded, gives the date, and gives the real time of the slowest kit.
- **"The bug" panel (Bugfix only):** the rooms the page showed before the fix, as captured from the running app.
- **Play / Run bugfix:** starts the replay. **Reset** puts all columns back to zero. The text next to them shows the playback speed.

### Each kit's column

OpenSpec is on the left (teal), Spec Kit in the middle (orange), the CyberRock kit on the right (violet in the light theme, gold in the dark theme). On a narrow screen the columns stack in that order.

| Element | What it shows |
|---|---|
| Badge | Ready, Running, Finished; "Not recorded" or "Recording incomplete" if data is missing |
| Clock | Recorded time elapsed so far, next to the kit's total real time |
| Phase strip | One segment per step, sized by its real duration, filling as the replay passes through it. Hover a segment to see its phase, step, duration and what it does |
| Step line | Every step the kit ran, in order, as a row of boxes: its number, phase, name and real duration. Steps not yet reached are grey, the running step is filled in the kit's colour, and finished steps get a tick. Hover a box to see what that step does, or click it (during or after a replay) to open a panel under the line with the step's number, phase, real duration, cost, turns and description; click the box again or × to close it. All step lines take the same height, and while a step panel is open in one kit the other kits keep a blank space of the same height, so the counters below stay level |
| Current step | The phase and step running at this moment, for example "Plan · tasks", with one line below it saying what that step does (see "What each step does") |
| Step count | Before playing: how many steps the kit ran in this scene. While playing: which step is running, for example "Step 3 of 6". At the end: "6 of 6 steps done" |
| The four counters | Tokens, Cost, Turns and Files written. Each has a **!** button: hover over it or tab to it to see a one-line explanation of that counter |
| Tokens | All tokens used so far, including cached input the model re-read and the work of any agents the kit handed tasks to (see "Tokens, cost and turns" below) |
| Cost | Cost so far, as Claude Code reported it at list prices |
| Turns | Model turns so far (see "Turns" below) |
| Files written | Distinct files the kit has created or edited so far |
| Activity tab | What the kit did, in order: its messages, the commands it ran, the files it read and wrote. Subagents' work is included |
| Documents tab | Every file the kit wrote or changed in its own folders during this change, as it was when the change finished (see "The Documents tab" below) |
| Result tab | Build, lint and unit tests after the change; hidden tests passed, with a breakdown by group; lines of documents, code and tests the change added (see "The Result tab" below) |

### Tokens, cost and turns

These three counters do not always rank the kits the same way, for two reasons.

- **Different kinds of tokens cost very different amounts.** Most of the token count is cached input the model re-reads on every turn, which is billed at a small fraction of the normal rate. Output tokens, the text and code the model writes, cost the most. So a kit can use more tokens in total and still cost less. In the Brownfield change, OpenSpec used 8.33 million tokens against Spec Kit's 8.04 million, but wrote fewer output tokens (97,076 against 143,536) and cost $11.76 against $18.31.
- **Turns count only the kit's main session; tokens and cost also include its agents.** In the Feature scene every kit handed the backend and frontend coding to two agents. Their work shows in tokens and cost but not in turns. That is why Spec Kit's Feature run shows fewer turns than OpenSpec's (131 against 139) while costing more. OpenSpec's count also includes 40 turns spent on its three `archive` attempts. The CyberRock kit shows the fewest turns in every scene (94, 64 and 26) partly for the same reason: its coding and review agents do most of the work.

### Turns

A turn is one round of the model's work, as Claude Code counts it. In each turn the model reads where things stand, then either replies or calls a tool: it runs a command, or reads or writes a file. The tool's result comes back, and the next turn starts.

- **More turns means more back-and-forth** to get the step done.
- **It is not messages a person typed.** No one typed anything during these runs.
- **It counts only the kit's main session.** Turns taken by the backend and frontend agents a kit hands work to are not included, although their tokens and cost are. That is why Spec Kit's feature implementation shows only 36 turns, even though those agents did most of the coding.

### The Result tab

The first three rows are checks run in that kit's copy of the app after the kit finished the change:

| Row | Meaning |
|---|---|
| Build passed (7 projects) | `pnpm run build` compiled the whole codebase with no errors |
| Lint passed (7 projects) | `pnpm run lint`, the code-style check, found no problems |
| Test passed (309 of 309 tests) | `pnpm run test`: all of the kit's own unit tests passed. The count is that kit's, at that change |

"7 projects" is the number of parts the codebase is made of, each built and checked by Nx:
- the two shared libraries, `contract` and `backend-common`;
- the four backend services, `gateway`, `room`, `booking` and `worker`;
- the `web` front end.

The rows below them are separate from these checks:
- **Acceptance tests:** the hidden HTTP tests, which the kits never saw, run against the app after the change, with a line per test group.
- **Kit documents, Code, Tests:** how many files and lines the change added in each category. The "Kit documents" file count is the same list the Documents tab shows.

### The Documents tab

The tab lists every file the change added or changed in the kit's own folders (`openspec/` for OpenSpec, `specs/` and `.specify/` for Spec Kit, `cr/` for the CyberRock kit), with a count at the top. The count always equals the "Kit documents" file count in the Result tab, because both come from the same list.

Each file has a label that says what it is:

| Label | Kit | Meaning |
|---|---|---|
| `change: proposal.md`, `change: design.md`, `change: tasks.md` | OpenSpec | The change's own proposal, design and task list, kept in its archive folder |
| `change: .openspec.yaml` | OpenSpec | A two-line metadata file OpenSpec keeps with each change |
| `change notes: bookings-api` | OpenSpec | What this change adds, alters or removes in that area's spec |
| `living spec: bookings-api` | OpenSpec | That area's spec after the change notes were merged in: how the system behaves now |
| `002: plan.md`, `002: spec.md`, and so on | Spec Kit | Files in the numbered spec folder for this change (`001` Feature, `002` Brownfield, `003` Bugfix) |
| `change: add-meeting-room-bookings`, and so on | CyberRock kit | The one file of that change: requirements with IDs, design decisions, risk table and tasks, kept in `cr/changes/archive/` |
| `living spec: bookings` | CyberRock kit | That area's spec after the script merged the change in: how the system behaves now |

In the Bugfix scene, each kit's written analysis of the bug is in its own documents. For OpenSpec, look in `change: proposal.md` and `change: design.md`; for Spec Kit, in `003: research.md` and `003: spec.md`; for the CyberRock kit, in the `Cause` section of `change: fix-rooms-page-offset`.

### Phases

The kits name their steps differently. The strip groups them into common phases so they can be compared:

| Phase | OpenSpec step | Spec Kit steps | CyberRock kit step |
|---|---|---|---|
| Specify | `propose` (also does the planning) | `specify`, `clarify` | `propose` (also does the planning; for a bugfix, also the fix and the merge) |
| Plan | inside `propose` | `plan`, `tasks` | inside `propose` |
| Check | `validate` (a command-line check, under a second) | `analyze` (an AI session) | `validate` (the kit's script, under a second) |
| Implement | `apply` | `implement` | `apply` (also the review and the spec merge) |
| Close | `archive` | none | inside `apply`, by script |

**When one session does the work of several phases, its box says so.** The CyberRock kit's `apply` is labelled "Implement and close (one session)". In the Bugfix scene its `propose` is labelled "Specify, implement and close (one session)", because that single session found the cause, wrote the regression test, fixed the code, ran the checks and merged the spec; there is no separate implement box. In the "Where the time went" table those phases read "inside Specify" or "inside Implement" instead of "none". The time and cost shown are for the whole session; they are not split between the phases.

### What each step does

These are the one-line descriptions shown under the current step.

| Kit | Step | Shown as |
|---|---|---|
| OpenSpec | `propose` | Reads the brief and the code, then writes the proposal, design, specs and task list |
| OpenSpec | `validate` | Checks the spec files with the OpenSpec command line; no AI, under a second |
| OpenSpec | `apply` | Writes the code and tests, working through its task list |
| OpenSpec | `archive` | Merges this change into the living specs and files the change away |
| Spec Kit | `specify` | Reads the brief and writes the specification: requirements, scenarios, success criteria |
| Spec Kit | `clarify` | Looks for unclear points in the specification and settles them |
| Spec Kit | `plan` | Researches the code, then writes the technical plan, data model and contracts |
| Spec Kit | `tasks` | Breaks the plan into a numbered task list and marks tasks that can run in parallel |
| Spec Kit | `analyze` | AI check: compares the spec, plan and tasks with each other and with the project rules |
| Spec Kit | `implement` | Writes the code and tests, working through its task list |
| CyberRock kit | `propose` | Reads the brief and the code, picks the tier, then writes one change file: numbered requirements, design decisions, risk table and tasks. A bugfix is fixed, tested and archived in this same step |
| CyberRock kit | `validate` | Checks the change file and the living specs with the kit script; no AI, under a second |
| CyberRock kit | `apply` | Writes the code and tests test-first, has the diff reviewed once against the risk catalogue, then merges the change into the living specs with the kit script |

**A step that was interrupted and resumed is shown as one step.** Its time, cost and turns are the parts added together, and its description ends with "This step was interrupted once and resumed". This applies to OpenSpec's `apply` in the Feature scene and to the CyberRock kit's `apply` in the Feature and Brownfield scenes. Each part is still its own record in `runs/<kit>/change-<n>/` (`apply.record.json` and `apply.r2.record.json`), so a kit's "steps run" in `runs/metrics.json` counts both.

OpenSpec's repeated `archive` step in the Feature scene is different: each attempt was a new try after a question or a blocked permission, so each is shown and described on its own:
- **`archive` round 2:** answers the confirmation question the first attempt stopped on.
- **`archive` round 3:** runs again with the answers given up front, after the second attempt was blocked.

Hovering a segment of the phase strip shows the same description, with the step's real duration.

### When the replay ends
- **"Side by side" table:** real time, tokens, cost, turns, steps run, documents written, questions the kit asked, re-prompts needed, and hidden tests passed. Where one kit is better on a measure, its figure is green; steps and documents are not coloured, because more of them is not better or worse in itself.
- **"Where the time went":** the time each kit spent per phase, how much longer each took than the fastest, and the main reasons for each gap in this scene. The reasons are the same as in the scene descriptions above.
- **"After the fix" (Bugfix only):** what page 2 at 5 per page returns in each kit's app after its fix.

## How the replay works
- **Compression:** playback fits the slowest kit's real run into about two minutes. All columns use the same speed, so the fastest kit finishes first, exactly as it did in reality. The clocks always show recorded time, not playback time.
- **Gaps removed:** the pauses between steps (for example, while the operator ran the build) are removed; each step follows the previous one directly.
- **Counters inside a step:** tokens, cost and turns are only known at the end of each step, so within a step they rise evenly. At the end of every step, and at the end of the scene, they match the recorded totals exactly.
- **Activity timing:** each message, command and file appears at the moment it was recorded.

## Where the data comes from

| On screen | Source |
|---|---|
| Steps, times, tokens, cost, turns | `runs/<kit>/change-<n>/*.record.json` |
| Activity feed | `runs/<kit>/change-<n>/*.events.jsonl` |
| Documents | For the CyberRock kit: its files in `cyberrock-variant/`, read from that folder's own git at the tag `change-<n>-done`. For OpenSpec and Spec Kit: the copy saved in `runs/timelines/change-<n>.json` when they were recorded, because those two folders no longer carry their own git tags |
| Result tab | `verify.json`, `acceptance-summary.json`, `stats.json` in `runs/<kit>/change-<n>/` |
| Questions and re-prompts | `runs/<kit>/interventions.jsonl` |
| Before and after rooms | `runs/<kit>/change-3/before.json`, `after.json`, captured from the running apps |

The server builds each scene from these files when you open it. `node runs/tools/build-timeline.mjs` writes the same data to `runs/timelines/` if you want to inspect it.

## Showing it to an audience
1. Open the Bugfix scene (`?scene=3`). It is the shortest and the easiest to follow: it starts on a visible bug and ends with it fixed.
2. Point out "The bug" panel, then press **Run bugfix** and let the columns play for about two minutes.
3. While it plays, open a Documents tab to show how much each kit writes for a 2-line fix.
4. At the end, use the "Side by side" table and the "After the fix" panel.
5. If there is time, play the Brownfield change scene and open each kit's Documents tab to show how they recorded the new rule.

The written results are on the report page for the board; [SETUP.md](SETUP.md) section 5 has its link.

## Limits
- **One recorded run per kit.** A second run would differ somewhat. The CyberRock kit ran a day after the other two, and was built knowing what they got wrong.
- **Counters are evenly spread within a step** (see "How the replay works"); step and scene totals are exact.
- **Steps the usage limit cut off before any real work are not shown.** It stopped two Spec Kit steps (`analyze` in Brownfield and Bugfix) within seconds of starting. The Brownfield one cost nothing; the Bugfix one had spent $0.58 starting up. Both were re-run, and only the re-runs are shown and counted, so that $0.58 is not in Spec Kit's totals.
- **The bookings pages themselves are not in the console.** To see what each kit built, start the apps and open them side by side (SETUP.md section 3.1).
