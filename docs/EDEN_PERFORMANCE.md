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

## Work handed to the graphics card (measured on a quiet machine, 20 s windows; does not depend on this container's speed)

`eden_perf.cjs` now also reads the page's own Stats overlay (draw calls, triangles, geometries and textures held) after each window.

| | draw calls | triangles per frame | geometries | textures | renderer CPU per frame | GPU process CPU per frame (software drawing) |
|---|---|---|---|---|---|---|
| 2 people | 121 | 448,328 | 113 | 120 | 77 ms | 3,876 ms |
| 60 people (grouped in view) | 921 | 2,628,946 | 122 | 542 | 94 ms | 6,159 ms |

**What this says.** The cost of 60 people is about 800 more draw calls (13 a person), 2.2 million more triangles (about 37,000 a person) and 420 more textures (about 7 a person). Frame rates are still software-drawn at 0.6 frames a second here, so no fps figure is claimed. But the work is real and it is the thing to watch: 2.6 million triangles and 921 draw calls a frame is comfortable for a desktop graphics card and heavy for a phone or an old laptop. The page's own code (the renderer process) grew by only 22% (77 to 94 ms) for 30 times the people, so the minds and the animation are not the cost; the drawing is.

**Where it would come from, and what to do if it matters:** the 37,000 triangles a person is the model's, so a distance-based simpler body (or none beyond about 80 m) would cut it the most; the 7 textures a person (about 420 more textures for 58 people) suggests each body keeps its own copy of its materials, for the dirt and wear tint, where a shared material per outfit would hold them to a handful. Neither has been done; they are the next two steps if a real GPU shows trouble. The 60 people stood near the centre, in view, which is close to the worst case.
