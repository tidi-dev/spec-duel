# Setup and testing guide

How to run the demo, what you can test, and how to show the results. For what this repository is and why it looks the way it does, see [README.md](README.md).

All commands run from this folder (the one that holds `demo.sh`) unless stated otherwise. Older documents call it `/workspace/spec-duel/`.

## 1. Prerequisites

| Tool | Needed for | Check |
|---|---|---|
| Node.js 22 or newer | Everything | `node -v` |
| pnpm | Installing and running the apps | `pnpm -v` |
| Docker Desktop, running | Postgres, Redis and NATS for each app | `docker info` |
| curl | The health checks in `demo.sh` | `curl --version` |
| A web browser | The apps and the console | |
| Claude Code | Only for re-running a kit step (section 6) | `claude --version` |

On this machine the apps' dependencies and the acceptance suite's dependencies are already installed. On a fresh copy, `./demo.sh up` installs each app's dependencies on its first run. The Spec Kit CLI is not kept: nothing here needs it, because Spec Kit's slash commands run the scripts it copied into `speckit-variant/.specify/`. Section 6 shows how to recreate it if you want to install Spec Kit again.

## 2. One command for everything: `demo.sh`

```bash
./demo.sh up                 # start the three kits' apps and the console
./demo.sh status             # what is running, and on which ports
./demo.sh test               # run the hidden acceptance suite against the three apps
./demo.sh down               # stop everything (data is kept)
./demo.sh reset              # wipe the three apps' data and start again
./demo.sh console            # only the console, in the foreground; no apps needed
./demo.sh help
```

Every command except `console` takes optional targets: `openspec`, `speckit`, `cyberrock` or `baseline`. Without targets it acts on the three kits. For example, `./demo.sh up baseline` starts the original codebase, with the bug still in it.

What `up` does, for each target, in parallel:
1. creates the app's local `.env` with throwaway values if it is missing;
2. starts Postgres, Redis and NATS in Docker and waits until they are healthy;
3. runs the database migrations;
4. builds and starts the four backend services and the front end;
5. waits until the API answers, then prints the addresses.

It also starts the console. The first start takes a few minutes for the builds; later starts take seconds because the builds are cached. If a target fails, the message names its log file in `.demo/logs/`.

### Addresses

| | Front end | API | Docker project |
|---|---|---|---|
| OpenSpec app | http://localhost:4210 | http://localhost:3110/api | `roombook-openspec` |
| Spec Kit app | http://localhost:4220 | http://localhost:3120/api | `roombook-speckit` |
| CyberRock kit app | http://localhost:4230 | http://localhost:3130/api | `roombook-cyberrock` |
| Baseline (optional) | http://localhost:4200 | http://localhost:3100/api | `roombook` |
| Console | http://127.0.0.1:4300 | | |

The apps are fully separate: their own containers, database, ports and data. All four can run at the same time. Each front end talks only to its own API, so to compare the kits you open their front ends side by side.

## 3. What you can test

### 3.1 The bookings page each kit built

Open http://localhost:4210/bookings, http://localhost:4220/bookings and http://localhost:4230/bookings side by side. Each page was written by its kit from the same brief.

Try on each:
- **Create a booking:** pick a room, enter a title, an email and a start and end time.
- **Edit and delete** a booking from its row.
- **Filter the list by room.**
- **Confirmation status:**
  - an ordinary email address ends as `SENT` after one attempt;
  - an address ending in `@retry.example` fails twice, then ends `SENT` after 3 attempts;
  - an address ending in `@bounce.example` ends `FAILED` after 3 attempts.

  Reload the page after a few seconds to see the status change.
- **Overlap rule:** book a room, then book the same room for an overlapping time. It is rejected with a message. A booking that starts exactly when another ends is allowed.

Differences you will notice are each kit's own choices. For example, OpenSpec's page shows times in UTC and Spec Kit's in local time.

### 3.2 The bug and its fix

The bug: on the `/rooms` page, choose 5 rooms per page and go to page 2. It should show Room 06 to Room 10.

| Where | What you see |
|---|---|
| Baseline, http://localhost:4200/rooms (`./demo.sh up baseline`) | Room 11 and Room 12: the bug |
| OpenSpec app, http://localhost:4210/rooms | Room 06 to Room 10: fixed |
| Spec Kit app, http://localhost:4220/rooms | Room 06 to Room 10: fixed |
| CyberRock kit app, http://localhost:4230/rooms | Room 06 to Room 10: fixed |

The same through the API:

```bash
curl -s "http://localhost:3100/api/rooms?page=2&limit=5"   # baseline: wrong rooms
curl -s "http://localhost:3110/api/rooms?page=2&limit=5"   # OpenSpec: fixed
curl -s "http://localhost:3120/api/rooms?page=2&limit=5"   # Spec Kit: fixed
curl -s "http://localhost:3130/api/rooms?page=2&limit=5"   # CyberRock kit: fixed
```

Each kit's written analysis of the cause is in `runs/openspec/change-3/bug-report.md`, `runs/speckit/change-3/bug-report.md` and `runs/cyberrock/change-3/bug-report.md`.

### 3.3 The API directly

Replace `3110` with `3120` to try the Spec Kit app, or with `3130` for the CyberRock kit app. First get a room id:

```bash
ROOM=$(curl -s "http://localhost:3110/api/rooms" | python3 -c "import json,sys; print(json.load(sys.stdin)['items'][0]['id'])")
```

Create a booking. It needs an `Idempotency-Key` header holding a UUID:

```bash
KEY=$(uuidgen)
BODY="{\"roomId\":\"$ROOM\",\"title\":\"Planning\",\"organizerEmail\":\"me@example.com\",\"startsAt\":\"2041-03-02T09:00:00Z\",\"endsAt\":\"2041-03-02T10:00:00Z\"}"
curl -s -i -X POST http://localhost:3110/api/bookings -H "Content-Type: application/json" -H "Idempotency-Key: $KEY" -d "$BODY"
```

The example always books the same hour. If you run it again on the same app with a new key, the create answers 409 because that hour is already taken: change the date in `BODY`, or wipe the app's data with `./demo.sh reset openspec` (or `speckit`, `cyberrock`).

Things to try:
- **Send the same request again with the same key.** You get the same answer and the header `Idempotency-Replayed: true`, and no second booking is created.
- **Same key, different body:** answers 422.
- **No key:** answers 400.
- **An overlapping booking for the same room, with a new key:** answers 409 with `CONFLICT.BOOKING_OVERLAP`.
- **List the bookings:** `curl -s "http://localhost:3110/api/bookings?roomId=$ROOM"`.
- **Health of each service:** `curl -s http://localhost:3110/api/health/booking` (also `gateway`, `room`, `worker`).

### 3.4 The hidden acceptance suite

```bash
./demo.sh test               # the three apps
./demo.sh test openspec      # one app
```

It runs 41 HTTP tests in four groups against the running app:

| Group | Tests |
|---|---|
| baseline | Health checks and the room list |
| change-1 | Bookings, idempotent create, confirmation job |
| change-2 | No overlapping bookings |
| change-3 | Room paging with a custom page size |

All three apps pass 41 of 41. The tests add bookings far in the future (from year 2040), so they don't clash with bookings you create by hand.

Against the baseline (`./demo.sh test baseline`), only the 8 baseline tests and 1 paging test pass. Bookings don't exist yet there, and the bug is still in place.

### 3.5 Each app's own build and tests

```bash
cd openspec-variant   # or speckit-variant, cyberrock-variant
pnpm run build
pnpm run lint
pnpm run test         # OpenSpec: 309 unit tests, Spec Kit: 321, CyberRock kit: 429 (needs its Postgres running, see below)
```

The CyberRock kit's unit run includes its tests against the real database, so start its containers first: `cd cyberrock-variant && docker compose up -d --wait` (or `./demo.sh up cyberrock`). With the database down those tests fail. This is a known defect of the kit, described in `reports/cyberrock-variant-evaluation.md`.

### 3.6 What each kit wrote, and how it changed the code

`cyberrock-variant/` is its own git repository, with one tag per stage. The OpenSpec and Spec Kit folders had the same tags when they were recorded, but lost their own history when the demo was imported into one repository, so the commands below work only in `cyberrock-variant/`:

| Tag | Stage |
|---|---|
| `baseline-v1` | The starting point |
| `kit-installed` | The kit installed and set up |
| `change-1-done` | After the feature |
| `change-2-done` | After the change to existing behaviour |
| `change-3-done` | After the bug fix |

Useful commands, run inside `cyberrock-variant/`:

```bash
git log --oneline                                   # one commit per stage
git diff --stat change-1-done change-2-done          # what one change touched
git diff change-2-done change-3-done -- apps libs    # the bug fix itself
```

Where to read each kit's documents:
- **OpenSpec:**
  - `openspec/specs/` holds the living specs, one folder per capability, describing current behaviour;
  - `openspec/changes/archive/` holds each change's proposal, design, delta specs and tasks.
- **Spec Kit:**
  - `specs/001-room-bookings/`, `specs/002-prevent-booking-overlap/` and `specs/003-fix-rooms-pagination/` hold one folder per change, each with its spec, plan, research, data model, contracts, quickstart and tasks;
  - `.specify/memory/constitution.md` holds the project rules.
- **CyberRock kit:**
  - `cr/specs/` holds the living specs, one file per capability, with a numbered ID on every requirement;
  - `cr/changes/archive/` holds one `change.md` per change;
  - `cr/rules.md` holds the project rules and `cr/risks.md` the bug-type catalogue.

The clearest difference: after change 2, OpenSpec's `openspec/specs/bookings-api/spec.md` and the CyberRock kit's `cr/specs/bookings.md` describe the overlap rule. Spec Kit's `specs/001-room-bookings/spec.md` still says overlapping bookings are accepted, and the rule lives only in `specs/002-…`.

### 3.7 The measurements

| File | Contents |
|---|---|
| `runs/metrics.json` | Time, turns, tokens and cost per kit, per change and per phase, plus test results, change size and rule checks |
| `runs/<kit>/change-<n>/*.record.json` | One record per kit step: start, end, duration, turns, tokens, cost |
| `runs/<kit>/change-<n>/*.events.jsonl` | Everything the kit did in that step, with timestamps |
| `runs/<kit>/change-<n>/acceptance-summary.json`, `verify.json`, `stats.json`, `rules.json` | Scoring for that change |
| `runs/install-summary.md` | What each kit installed, and the security checks |
| `runs/openspec/install/deny-test.md` | Proof that OpenSpec's risky subcommands are blocked |
| `runs/cyberrock/install/deny-test.md` | Proof that the CyberRock kit's deny rules block `git push` and `git remote`, and its headless smoke test |
| `runs/manual-tester-fit.md` | How well each kit's spec works as a source for manual test cases |
| `runs/notes.md` | Everything that happened during the runs that affects the figures |

To regenerate the totals after any change to `runs/`:

```bash
node runs/tools/rollup.mjs           # rebuilds runs/metrics.json
node runs/tools/build-timeline.mjs   # rebuilds the console's timelines
```

## 4. The console: showing the comparison

The console replays the three kits' recorded runs side by side. It needs no app running and costs nothing to use.

```bash
./demo.sh up          # starts it along with the apps
./demo.sh console     # or start only the console
```

Open http://127.0.0.1:4300. [CONSOLE.md](CONSOLE.md) explains everything on the screen, what each of the three scenes shows before and after, where the data comes from, and how to present it.

## 5. The report page for the board

**Shareable page:** https://claude.ai/artifact/RdzjJseMj16ZxsaE5jZH3K

- It is shared with anyone who has the link. To change who can open it, use the Share menu on the page.
- It is written for readers outside the project. It covers the headline figures, charts of time, cost and documents per change, the per-phase breakdown, the three changes, strengths and weaknesses, the recommendation with its conditions, how the comparison was run, and what to keep in mind.

**Full report page:** https://claude.ai/artifact/QfV93Wb2UZEH9wMZc33UcH

- The same findings in more detail, with every statement tagged as verified (with its evidence) or judgement.
- The evidence it cites is reproduced at the end of the page: the install checks, the deny-rule test, the manual-tester fit check, the run notes, the baseline facts, the scoring per change and every recorded kit step. A linked file name jumps to it.
- Also shared with anyone who has the link. Use it when someone asks "how do you know?".
- The same report as a local file: `reports/openspec-vs-spec-kit-comparison.md`.

**CyberRock kit evaluation page:** https://claude.ai/artifact/Gi22wVojhqjsC6xLPfDSY3

- It is private until shared: use the Share menu on the page to choose who can open it.
- A switch at the top shows every comparison table with all three kits, or with OpenSpec and Spec Kit only.
- The same report as a local file: `reports/cyberrock-variant-evaluation.md`. To rebuild a page after editing its report: `python3 plans/261111-1333-cyberrock-variant-kit/page/build-page.py evaluation <output.html>`, then publish the output to the same link.
- **Code audit of the three kits:** https://claude.ai/artifact/J69PYSozk2S47BbKJwgtzN. This is the original code audit page, extended with the CyberRock kit and the same switch. Its local text is `reports/three-kit-code-audit.md`; the page is rebuilt from the original page by `plans/261111-1333-cyberrock-variant-kit/page/extend-original-code-audit.py`.
- The two pages above were published before the third kit existed and cover OpenSpec and Spec Kit only.

The board page links to this README, this guide and the full report page.

A suggested order for a board demo:
1. Show the report page's summary and charts.
2. Open the console, play the Bugfix scene and let the kits run side by side (CONSOLE.md has a step-by-step for presenting it).
3. If there is time, open both bookings pages and the rooms page to show the working apps.
4. Close on the recommendation and conditions in the report page.

## 6. Re-running a kit step (advanced)

Every kit step was run by `runs/tools/run-step.mjs`, which starts a headless Claude Code session in an app's folder and records it. For example:

```bash
node runs/tools/run-step.mjs --kit openspec --change 3 --step propose \
  --cwd "$PWD/openspec-variant" --prompt-file runs/openspec/change-3/prompts/propose.md \
  --path-prepend "$PWD/openspec-variant/node_modules/.bin" --runs-dir /tmp/rerun
```

- Use `--runs-dir` to keep the original recordings untouched.
- Re-running changes the app's code, so do it on a copy, or reset afterwards with `git checkout change-<n>-done`.
- A folder must have been opened once in interactive Claude Code, with the trust dialog accepted, or a headless session ignores its permission settings.
- For the CyberRock kit, drop `--path-prepend` and use `--kit cyberrock --cwd "$PWD/cyberrock-variant"` with the prompts in `runs/cyberrock/change-<n>/prompts/`. Its check step is `node runs/tools/record-cli-check.mjs cyberrock <n> validate node cr/bin/cr.mjs validate`.
- OpenSpec's CLI is at `openspec-variant/node_modules/.bin/openspec`. The Spec Kit CLI (`specify`) is not kept; it is only needed to install Spec Kit again. Recreate it with `python3 -m venv .venvs/specify && .venvs/specify/bin/pip install specify-cli==1.3.3`.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "Docker is not running" | Start Docker Desktop, wait until it is ready, run `./demo.sh up` again |
| A target "failed to start" | Read the log named in the message (`.demo/logs/<target>-up.log`); the app logs are in `<folder>/tmp/logs/` |
| A port is already in use | `./demo.sh down`, then `./demo.sh up` |
| A page shows old data, or tests behave oddly after a lot of manual testing | `./demo.sh reset` wipes the data and restarts |
| The console says "Not recorded" for a kit | That kit's step records are missing from `runs/<kit>/change-<n>/`. The console reads them each time a scene opens, so restoring the files is enough; no rebuild is needed |
| Disk space | Each app's `node_modules` is about 870 MB. Delete it when not needed; `./demo.sh up` reinstalls it |

## 8. Security notes

- The `.env` files hold local throwaway values only. They are gitignored and must not be committed or shared.
- Nothing in this folder pushes to a remote: none of the repositories has a remote configured.
- The apps listen on `localhost` only, and the console on `127.0.0.1` only.
- This folder contains no Acme code, data or credentials. Only the agent setup notes mention Acme, as their origin.
