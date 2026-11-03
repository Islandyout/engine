# Eden performance with many people

K4 asked for frame-time numbers with 60 people rendering. This is what could be measured here, and how far to trust it.

## How it was measured

`tests/browser/eden_perf.cjs` loads the built Eden page (`build/site/eden.html`) in headless Chromium, records every `requestAnimationFrame`
interval over a window, and reads each browser process's CPU time (CDP `SystemInfo.getProcessInfo`) before and after. It runs the same
window twice: the garden as it starts (2 people), then a save with 60 people (the page's own save plus 58 people added by
`tools/eden/crowd.ts`, grouped within 12 m of the garden centre, ages 6 to 18 Eden years, i.e. grown). Both at the default 3x speed, with the
default camera, 960 by 540. Run it with `node tests/browser/eden_perf.cjs` after `bash tools/build_editor.sh`
(`EDEN_PERF_SECONDS`, `EDEN_PERF_PEOPLE`, `EDEN_PERF_OUT` change the window, the crowd and a JSON output file).

## Numbers (one run, 30 s windows)

| | frames in window | frames per second | frame time mean / p50 / p95 | renderer CPU per frame |
|---|---|---|---|---|
| 2 people | 9 | 0.30 | 4161 / 3483 / 8233 ms | 147 ms |
| 60 people | 8 | 0.27 | 4479 / 4700 / 7450 ms | 158 ms |

(The machine's load average was about 22 on 4 cores during this run: other jobs were running.)

## What these numbers can and cannot say

- **They are not a frame rate a player would see.** Headless Chromium has no graphics card; it draws with SwiftShader (software GL) on the
  CPU, here on 4 shared cores at a load average of 22, at 0.3 frames a second. A machine with a GPU does the drawing there, for a small
  fraction of that cost. The 4-second frames are a property of this container, and a 60 fps claim or a 0.3 fps claim from it would both be wrong.
- **What does look reliable is the difference between 2 and 60 people:** about 7% more renderer CPU per frame (158 against 147 ms) with 30
  times the people. That says the per-person cost of the page's own code (mind steps, body updates, poses, animation) and the draw calls of
  the bodies is small next to the cost of drawing the garden itself under software GL. It is one run on a busy machine, so a difference of
  7% is within the noise, and the honest reading is "no large extra cost was visible", not "60 people cost 7%".
- **The GPU process's CPU time did not show up** (the column read 0 because the script matched the process type name case-sensitively;
  fixed in the script after this run, not re-measured). So the split between the page's code and the software drawing is not established
  by this run; only the renderer process (which includes the page's JavaScript) was counted.
- **Not measured:** a real GPU, a laptop or phone, 60 people spread across the valley (many are then out of the camera's view or far away
  and cheaper), draw-call counts, memory, and the first-load time.
- The 60 people stood near the garden centre, so most were probably in view or near it: this is closer to a worst case for the page's own
  per-body work than a typical spread.

## The mind alone

Separately from rendering, the mind step costs (from `docs/changelog/F133.md`, measured natively with no drawing): 6 people and 20 creatures
0.23 ms a step, 30 and 80 1.3 ms, 60 and 200 4.6 ms; the page steps about every 100 ms, so 60 people is under 5% of one core for the mind. The
big-world sweep (`tools/eden/bigworld.ts`, 60 people for three years) takes about 800 s with phases A to D against 407 s before them: see
`docs/EDEN_MIND.md`. These numbers were not re-measured here.

## What would settle it

Run `tests/browser/eden_perf.cjs` on a machine with a GPU and a headed browser (or with `--use-gl=egl`), on an idle CPU, and compare the 2
and 60 person rows. The script prints both and can write JSON.
