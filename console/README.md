# Demo console

For what the console shows and how to present it, see [CONSOLE.md](../CONSOLE.md) in the demo folder. This file covers only starting it and its tests.

A local page that shows OpenSpec and Spec Kit doing the same change side by side, from the recordings under `runs/`.

## Start it

```bash
cd /workspace/spec-duel
node runs/tools/build-timeline.mjs   # optional: also writes runs/timelines/*.json
node console/server.mjs              # http://127.0.0.1:4300
```

The server listens on this machine only. Open the page, pick a scene (Feature, Brownfield change, Bugfix) and press the button.

- `?scene=3` in the address opens the bugfix scene directly.
- Replay fits the longer kit's real run into about two minutes. Both columns use the same speed, so the slower kit finishes later on screen, as it did in reality.
- Token, cost and turn counters grow evenly within each step and land on the recorded totals; the totals are exact, the growth inside a step is interpolated.
- The "before" and "after" room tables in the bugfix scene are the API responses captured during the real run.

Replay is the only mode. The console never starts a kit or calls Claude, so using it costs no Claude usage.

## Tests

```bash
node --test "console/test/*.test.mjs" "runs/tools/test/*.test.mjs"
```
