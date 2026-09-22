# Implementation Status

## Milestone F0 — Foundation bootstrap

Started after explicit authorization on 2026-09-08.

Implemented:

- isolated engine repository structure;
- C++20 and CMake baseline;
- strict warning policy;
- core numeric aliases;
- UUIDv4 and strong `AssetId`, `EntityId`, `FrameId`, and `WorldId` types;
- fixed-step scheduler primitive with catch-up limits and dropped-time reporting;
- thread-safe logger with replaceable sinks;
- host smoke executable;
- dependency-free core test executable.

Local development prerequisites installed at user scope:

- CMake 4.4.3;
- WinLibs GCC 16.1.0 with MinGW-w64 UCRT and Ninja 1.13.2.

Not implemented:

- SDL3 platform layer;
- Flecs ECS;
- enkiTS jobs;
- Vulkan RHI;
- Jolt Physics;
- asset cooker;
- networking;
- world streaming/reference frames;
- editor;
- game code.

No third-party dependency is introduced in F0. The next milestone should establish the platform/application lifecycle and test infrastructure before importing the ECS, renderer, or physics stack.

## Verification

- CMake configured successfully with GCC 16.1.0 and Ninja.
- All targets compiled with warnings treated as errors.
- `engine_core_tests` passed through CTest.
- `engine_host` launched successfully and scheduled a fixed simulation step.
- Cppcheck warning, performance, and portability checks passed.

## Milestone F1 — Application lifecycle

Implemented:

- platform interface for initialization, shutdown, events, monotonic time, and sleeping;
- headless platform suitable for tests and future dedicated-server work;
- application callbacks for startup, events, fixed updates, rendering, and shutdown;
- bounded fixed-step run loop with render interpolation and optional frame pacing;
- explicit exit reasons and run statistics;
- guaranteed platform and callback shutdown after successful startup, including exception paths;
- deterministic manual-platform lifecycle tests covering frame limits, requested exit, platform quit, startup failure, and exceptions.

The next platform milestone is an SDL3-backed desktop implementation with a real window and input/event translation. It remains behind the same platform interface so tests and dedicated servers do not require SDL.

## Milestone F2 — SDL3 desktop platform

Implemented:

- SDL 3.4.14 pinned through CMake FetchContent;
- static, reduced-subsystem SDL build for the current window/event requirement;
- owned 1280×720 resizable, high-pixel-density desktop window;
- engine event translation for application quit, window close, suspend/resume, logical resize, pixel resize, and focus changes;
- opaque window handle for the future Vulkan surface integration boundary;
- windowed, headless, and hidden smoke-test host modes;
- dummy-video SDL tests that create and destroy a window and validate resize/close translation;
- engine version advanced to 0.2.0.

Not yet implemented:

- keyboard, mouse, text, touch, or gamepad input state;
- Vulkan instance/surface or rendering;
- multi-window ownership;
- clipboard, dialogs, filesystem paths, or display enumeration.

The next milestone should establish the input event/state model and SDL translation without leaking SDL keycodes or device handles into gameplay APIs.

## Milestone F3 — Input events and frame state

Implemented:

- engine-owned, SDL-independent events for physical keyboard keys, UTF-8 text, mouse motion/buttons/wheel, touch contacts, and gamepad connection/buttons/axes;
- deterministic `InputState` frame transitions with persistent held state and per-frame edges, deltas, wheel motion, text, touch activity, and gamepad state;
- input snapshots supplied to fixed-update and render callbacks while raw events remain available through the platform callback;
- SDL3 translation confined to the SDL platform library, with device identifiers, normalized gamepad axes, natural wheel direction, and gamepad lifetime management;
- dependency-free input tests and dummy-video SDL translation coverage;
- engine version advanced to 0.3.0.

Not yet implemented:

- configurable action mapping, rebinding, dead zones, or input persistence;
- IME pre-edit/composition UI and virtual keyboard control;
- mouse capture/relative-mode policy, cursor ownership, or haptics;
- Vulkan instance/surface or rendering.

F3 established the device-level state used by the F4 action and binding layer without exposing SDL types above the platform backend.

## Milestone F4 — Actions, bindings, and deterministic replay

Implemented:

- strong, engine-owned action and input-context identifiers with scalar action values;
- active binding contexts ordered deterministically by descending priority and identifier, with higher-priority definitions masking lower-priority bindings per action;
- physical keyboard, mouse buttons and motion/wheel axes, gamepad buttons, and gamepad axes as binding sources;
- optional gamepad-device selection plus deterministic lowest-device tie breaking for equal-magnitude any-device axes;
- digital chords/modifiers across keyboard, mouse buttons, and gamepad buttons;
- configurable dead zones, saturation, linear/squared/cubic response curves, inversion, and scaling;
- deterministic action held/pressed/released transitions, including same-frame press-and-release taps and context activation changes;
- gamepad button edges added to the F3 frame state so action transitions are consistent across device classes;
- versioned input-map serialization with canonical ordering, round-trip stability, and structural/semantic validation;
- ordered frame-based input replay and injection that resets cleanly and preserves held state across empty frames;
- dependency-free action/binding/replay tests and continued SDL dummy-driver boundary coverage;
- Linux Clang presets for both SDL-enabled and SDL-disabled builds;
- engine version advanced to 0.4.0.

Not yet implemented:

- runtime rebinding capture UI or platform-specific key-name presentation;
- IME pre-edit/composition UI, virtual keyboard control, mouse capture/relative mode, cursor ownership, or haptics;
- network input prediction/rollback or replay-file persistence;
- ECS/world ownership, rendering, physics, assets, or gameplay features.

Recommended F5: establish a narrow ECS/world foundation. Pin and isolate the ECS dependency, define world/entity ownership and component registration, run deterministic fixed-step systems in explicit phases, and cover lifecycle/order behavior in headless tests. Keep rendering, physics, asset cooking, scene authoring, and gameplay outside that milestone.

## F4 verification

- Linux Clang 18.1.3 SDL-enabled configure and strict-warning build completed successfully.
- All five SDL-enabled tests passed, including the SDL dummy-video platform test and the SDL-to-action boundary assertion.
- Linux Clang 18.1.3 SDL-disabled configure and strict-warning build completed successfully without fetching or linking SDL.
- All four dependency-free headless tests passed.
- The action/binding/replay suite passed deterministic context, chord, device selection, response processing, transition, validation, canonical round-trip, and repeated replay cases.
- Repository formatting and whitespace/error diff checks passed.

## Milestone F5 — World ownership and fixed systems

Implemented in version 0.5.0:

- a separate `GameEngine::World` module, with no SDL or external ECS dependency;
- noncopyable/nonmovable worlds and opaque transient entity handles with unique world ownership;
- monotonically allocated, never-reused entity serials, including across reset, with exhaustion checks;
- explicit typed component registration, validated unique names, and stable registration metadata;
- const/mutable component access and creation-ordered, caller-owned query snapshots;
- FIFO deferred entity creation/destruction and component insertion/replacement/removal;
- reset that clears entities, values, and pending commands while preserving component registration;
- sequential `begin`, `update`, and `end` fixed phases with ascending order/name tie-breaking;
- explicit between-tick system activation and rejection of structural mutation or recursive execution during callbacks;
- integration through the existing application's fixed-update context, without a second time accumulator;
- explicit exception behavior: discard uncommitted work, release guards, propagate the error, and retain completed work;
- deterministic tests for stale/null/foreign handles, reset, deferred ordering, resource ownership,
  phase visibility, registration-order independence, exceptions, and multiple render cadences.

Backend decision: the earlier Flecs introduction is deferred. Ordered standard-library storage
establishes a dependency-free correctness baseline, not a production-performance archetype ECS.
See [WORLD_FOUNDATION.md](WORLD_FOUNDATION.md) for the complete contract and limitations.

Rendering, physics, planets, scene authoring, hierarchy, assets, jobs, and gameplay remain outside
F5. No uploaded Aether implementation was imported.

### F5 verification

- GCC 13.3.0 / CMake 4.4.3 / Ninja 1.13.2: strict-warning SDL-disabled build passed; all 5 CTest tests passed.
- GCC 13.3.0: SDL-enabled build passed with SDL 3.4.14's dummy/offscreen backends; all 6 CTest tests passed,
  including the existing SDL dummy-driver input/action boundary coverage.
- SDL configuration used the existing pinned source checkout and `SDL_UNIX_CONSOLE_BUILD=ON` because
  this session lacks X11/Wayland development packages. This is not desktop-window verification.
- The world suite passed 100 consecutive repetitions. The GCC undefined-behavior-sanitized
  headless build passed all 5 tests with `-fsanitize=undefined -fno-sanitize-recover=all`.
- SDL dummy-driver host smoke passed: version 0.5.0, 4 ticks, 4 frames, clean shutdown.
- Clang-format 18.1.8 checks passed on all new C++ files using the explicit style recorded in
  `F5_PULL_REQUEST.md`; Git whitespace/error diff checks passed.
- Hosted Ubuntu 24.04 Clang 18.1.3 verification passed on published commit `0b38327`:
  SDL-disabled 5/5 tests, SDL-enabled 6/6 tests, dummy-driver smoke (4 ticks/4 frames), and diff checks.
  This closes the earlier local Clang/toolchain blocker.
- Verification run: https://github.com/Islandyout/engine/actions/runs/34502950596
- F4 and F5 are merged into main; F5 integration completed through PR #8.

Next work follows the visible delivery sequence in [AETHER_REVIEW.md](AETHER_REVIEW.md).

## Field Lab — Browser demonstration

PR #9 merged the C++ WebAssembly demonstration into main. Movement, action-context
masking, deferred entity changes, and deterministic input replay use the existing engine
modules; Canvas provides the browser presentation. Engine version remains 0.5.0.

The deployment follow-up adds desktop/mobile browser interaction tests, screenshot
artifacts, and GitHub Pages deployment of the tested build on main. PR builds never deploy.
Select GitHub Actions as the Pages publishing source; see FIELD_LAB.md.

Verified before the deployment follow-up: hosted WebAssembly build and deterministic
simulation tests passed in run 34549055600; native SDL/headless CI passed in run
34549055579. Follow-up browser and deployment results are recorded in its pull request.
Native rendering, production physics, planets, and scene authoring remain unimplemented.

## Aether evaluation and seeded fields

The supplied archive has been evaluated selectively; see [AETHER_REVIEW.md](AETHER_REVIEW.md)
for exact provenance, reproduced defects, verification limits, and adoption decisions.
Only seeded random generation is adapted into C++ in this slice. Field Lab demonstrates
seeded placement, reset, and replay. Native rendering and physics are still future work.

## F6 — Native visual playground (0.6.0)

Implemented: SDL-free CPU box renderer with depth buffering, a native desktop playground,
action-driven movement/orbit/zoom, deferred creation/removal, world reset, and headless
snapshot export. SDL window-surface presentation stays within the platform implementation.

The Aether seeded generator drives initial box heights. Camera and geometry references
inform the visual path; the CPU renderer is not a WebGPU/Vulkan port. See
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md) for scope, tests and controls.

Native GPU rendering, general mesh/texture loading, physics and editor integration remain
open. All Aether subsystems are tracked for further adoption; no broad feature-completion
claim is made by this milestone. Verification results are recorded in the F6 pull request.

## F7 — Native model and texture path (0.7.0)

Imported the CC0 Aether bench and an albedo generated by Aether's planks pattern.
The native player entity displays that mesh through the depth-tested raster path.
Added a bounded offline GLB cooker, versioned native asset reader, UV sampling, asset
packaging, provenance hashes, and malformed-input/render tests.
See [ASSET_PIPELINE.md](ASSET_PIPELINE.md) for supported formats and remaining adoption work.

## F8 — BTAI editor integration (0.8.0)

Integrated BTAI's TypeScript authoring/module/scene foundation into `apps/editor`.
The browser workspace now creates/selects/renames/duplicates/deletes/reparents real
scene entities, edits component data, exports/imports scenes, and supports undo/redo.
A Three.js viewport displays document entities and the bundled Aether GLB. Play
uses the existing C++ World and FixedSystems compiled to WebAssembly through an
atomic, bounded position/velocity bridge. Pause/Stop preserve authoring data.

Added authoring regression tests, native bridge tests and browser workflow coverage.
Fixed the inherited Windows asset-test byte-fill conversion warning. This combined
release includes F6/F7's native playground and asset work. See BTAI_EDITOR.md for
provenance, exact supported behaviors and remaining editor/runtime integration.

## F9 — Editor transform tools (0.9.0)

Added move/rotate/scale viewport gizmos, local/world space and configurable movement
snapping (plus rotation/scale increments). A drag previews on the presentation
object and commits one validated authoring edit on release; Escape restores the
original transform. Playback disables editing. Added component dropdown metadata,
derived read-only fields and reset-to-default controls. Extended canvas fallback
to display gizmo overlays. Eight editor domain tests and both renderer browser
workflows cover the new behavior alongside existing scene/persistence operations.

## Native scene consumption

Added `engine::parse_scene_document` (`include/engine/scene/scene_document.hpp`,
`source/engine/scene/scene_document.cpp`), a bounded native reader for the BTAI
editor's "format 1" scene JSON, and wired it into the native playground as
`engine_playground --scene scene.json`. This closes the "native scene consumption"
gap named in BTAI_EDITOR.md's next-work list: an editor-exported scene layout can
now be opened by the native renderer.

Only `Transform`, `Renderable`, and `Name` are shape-validated and interpreted;
the editor's other ten component types (Rotation, Scale, Velocity, Acceleration,
RigidBody, Collider, Health, AIState, Pedestrian, Vehicle, AnimationState) are
accepted as opaque JSON objects, not validated field-by-field or given native
runtime behavior. Parent/child references are validated (bounds, generation, no
cycles) but hierarchy is not applied to placement. See
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#opening-an-editor-exported-scene) for
the full compatibility notes.

### Verification

- `engine_scene_tests` covers the parser's accept and reject cases directly:
  valid documents with Transform/Renderable/Name and an opaque component, wrong
  `format`, malformed JSON, an unknown component name, a Transform missing its
  position, a non-numeric position field, a cyclic parent reference, an
  out-of-range parent index, a non-array `entities` field, and a non-object
  document.
- `engine_playground_scene_headless` runs the playground headless against
  `tests/fixtures/editor_scene.json` (two visible entities, one hidden, one with
  no Transform) as a CTest case.
- `engine_playground_tests` exercises the loader through `playground::Scene`
  directly: a document entity is placed at its Transform position, an invisible
  entity and a Transform-less entity are both skipped, and pressing reset
  reloads the same document rather than the built-in scene.
- Manually confirmed the fixture actually changes the rendered frame: a
  `--snapshot` of the fixture differs byte-for-byte from the default scene's
  snapshot, and visually shows two boxes at the fixture's authored positions
  next to the existing bench/player.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings;
  all 11 CTest cases (up from 9) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed all 11, so the
  new hand-written JSON parser and loader triggered no undefined behavior on
  the accept or reject paths exercised by the tests above.
- `git diff --check` reported no whitespace issues on the changed files.

## F10 — Physics: gravity, collision and a controllable character (0.10.0)

Added `engine::physics` (`include/engine/physics/physics.hpp`,
`source/engine/physics/physics.cpp`): a `RigidBody` (velocity + grounded flag)
integrates gravity and moves any entity that also has a `Box`; a `Collider`
marks another `Box` entity as a static AABB obstacle. `physics::step` runs
each fixed tick, resolving every rigid body out of the ground plane (`y = 0`)
and out of overlapping colliders along the axis of least penetration, zeroing
the resolved velocity component and setting `grounded` only when the
resolution was upward. This is the "Physics: collision, gravity and a
controllable character" item in [AETHER_REVIEW.md](AETHER_REVIEW.md)'s agreed
delivery sequence — no Aether physics code is used; the implementation is
native and independently written, informed only by the sequence's own scope
(box collision, gravity, a controllable character — no rotation, no
continuous/tunneling-safe sweep).

Wired into the native playground: the player now has a `RigidBody` and a new
Shift-to-jump control that only triggers while grounded; the seven field
boxes, any crate spawned with Space, and boxes placed from a loaded editor
scene all carry a static `Collider`, so the player physically stops at them
instead of passing through. The rendered bench mesh now tracks the player's
actual vertical position (it previously always drew at `y = 0`), so jumping
and landing are visible. Engine version advanced to 0.10.0. See
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#physics) for full scope and
limitations.

### F10 verification

- `engine_physics_tests` (new) covers: gravity accelerating an airborne body
  downward; a falling body settling to rest exactly on the ground plane with
  zeroed vertical velocity; an already-grounded body not sinking on the next
  step; a moving body resolved and stopped out of a side collision; a falling
  body landing and resting flush on top of a static platform (marked
  grounded); a non-static collider never pushing a body; and a non-positive
  `dt` being a no-op.
- `engine_playground_tests` and `engine_scene_tests` pass unchanged: the
  existing action-movement assertions only check the player's X position,
  which physics does not touch, and entity-count assertions are unaffected by
  adding components to existing entities.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings;
  all 12 CTest cases (up from 11) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed all 12.
- The SDL-enabled desktop preset could not be configured in this sandbox
  (missing X11/Xcursor development packages, a pre-existing environment
  limitation unrelated to this change); the new code does not touch any
  SDL-guarded path, and the same logic is exercised by the headless build
  above. Worth a real SDL/desktop CI run before merging.

## F11 — Native scene export (0.11.0)

Added `engine::serialize_scene_document` (`include/engine/scene/scene_document.hpp`,
`source/engine/scene/scene_document.cpp`): the exact inverse of `parse_scene_document`
for the fields `SceneDocument` models (name, parent, `Transform`, `Renderable`),
producing compact "format 1" JSON that both the native reader and the editor's own
`parseSceneText`/`deserializeScene` (`apps/editor/src/scene/SceneSerializer.ts`) accept.
Wired into the native playground as `Scene::export_document()` (snapshots every current
`Box` entity, player included, as a `Transform` plus a visible default `Renderable`; no
name/parent, and no size or color, since neither the format nor the playground's `World`
carries them) and a new `engine_playground --save-scene scene.json` CLI flag that writes
that snapshot and exits immediately. This is the "Scene workflow: save/load" item in
[AETHER_REVIEW.md](AETHER_REVIEW.md)'s agreed delivery sequence, completing the native
side (editor-side load, save and property editing already existed — see
[BTAI_EDITOR.md](BTAI_EDITOR.md)); it does not add editor-equivalent property editing to
the native playground itself, only the ability to persist and reopen a live layout as the
shared scene format. Engine version advanced to 0.11.0. See
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#saving-a-scene) for full scope.

### F11 verification

- `scene_document_tests.cpp` (extended) covers `serialize_scene_document` in isolation: a
  built document's name, parent, Transform position, and Renderable fields round-trip
  exactly through serialize then parse, including a name needing JSON escaping
  (quote/backslash/newline) and negative/fractional coordinates; an entity with none of
  those fields round-trips to an equally empty entity; and an empty entity serializes an
  explicit `"components":{}` rather than omitting the shape.
- `engine_playground_tests` (extended) covers `Scene::export_document()` directly: it
  captures every `Box` entity (count matches `world.query<Box>()`), and the exported
  document round-trips through `serialize_scene_document`/`parse_scene_document` to
  reproduce the player's exact position.
- `engine_playground_save_scene_headless` (new CTest case) runs `engine_playground
  --headless --save-scene` as an end-to-end smoke test of the CLI flag. Manually confirmed
  the written file both parses back with `--scene` (loads without error, 4 ticks/3 frames)
  and contains the expected 8 entities (player plus the seven default field boxes) with
  well-formed `Transform`/`Renderable` JSON.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13
  CTest cases (up from 12) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed all 13.
- Same SDL/desktop CI gap as F10: not verified against the SDL-enabled preset in this
  sandbox; the new code has no SDL-guarded path.

## F12 — Playable slice: platform path and goal (0.12.0)

Adds `Scene::place_platform_path()` to the native playground's default scene: three static
`Collider` platforms at `z = 6` (clear of the player's spawn and the field boxes), each
0.5 units taller than the last, plus a gold, non-solid goal marker on the final one.
`Scene::won()` becomes true and stays true once the player's `Box` overlaps the goal's
`Box`, checked each tick by a new `playground.goal` system using a new public
`physics::overlaps(Box, Box)` — the same overlap test `physics::step` already used
internally, exposed for non-physical trigger checks that shouldn't also push anything out
or zero velocity. This is the "Playable slice: one small environment demonstrating the
intended game experience" item in [AETHER_REVIEW.md](AETHER_REVIEW.md)'s agreed delivery
sequence, completing it — a minimal 3D platformer chosen as that experience: jump across a
short ascending path to a goal. The goal is exempt from the "remove" control (the one entity
that can end the level is not deletable by ordinary input) but not from `reset()`, which
recreates it from scratch along with everything else. See
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#playable-slice) for full scope, including why a
diagonal approach to the platforms is blocked by design rather than a bug.

### F12 verification

- `physics_tests.cpp` (extended) covers `physics::overlaps` directly: overlapping boxes,
  separated boxes, and two boxes sharing an exact face (zero penetration) reporting no
  overlap.
- `engine_playground_tests` (extended) scripts a two-phase input sequence — pure `z`
  approach clear of every platform's `x`-footprint, then pure `x` traversal with periodic
  jump taps (jump is edge-triggered, so the key is toggled to get each fresh press) — and
  asserts `Scene::won()` is false at the start, becomes true within a generous tick budget,
  and that the goal entity is never destroyed by that input. This was arrived at
  empirically: an initial diagonal-approach script got the player stuck against a
  platform's `z`-face (documented above and in code) before ever reaching the goal, which is
  correct collider behavior, not a test bug, and is why the shipped script and its comments
  describe the two-phase order deliberately.
- Also updated the pre-existing action/spawn/remove/reset entity-count assertions in
  `engine_playground_tests` (8 → 12 baseline: player, 7 field boxes, 3 platforms, 1 goal),
  which needed no other changes — the "action movement" test's original 10-tick,
  x-only, z = 3 path stays clear of the platforms' new z = 6 row entirely.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13
  CTest cases (same count as F11 — this milestone changed no test count, only test content
  and one new physics_tests.cpp case) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed.
- Same SDL/desktop CI gap as F10/F11: not verified against the SDL-enabled preset in this
  sandbox (missing X11/Xcursor packages); the new code has no SDL-guarded path beyond the
  existing title-string update. Worth a real desktop run to confirm the platform path feels
  right interactively, not just kinematically.

## F13 — Unified Box lighting and sustained flight (0.13.0)

Two independent, non-overlapping changes shipped together: real directional lighting for
the `Box` primitive, and a flight control. Deliberately picked as a pair because they touch
different files and share no state (`box_view.cpp` vs. `scene.hpp`'s move system) — the two
tracks a rendering-plus-physics/movement round can safely run without either blocking or
interfering with the other, not because they're related in what they do.

**Box lighting**: `box_view.cpp`'s `BoxView::draw()` (used for the player, platforms, field
boxes, crates, goal, and floor — every visual element except the one bench mesh) previously
shaded each cube face from a hardcoded, physically arbitrary six-entry brightness table.
It now uses `face_light()`, the exact same fixed light direction and Lambertian falloff
`draw_mesh()` already applied to a normal-carrying mesh vertex, computed at compile time
per axis-aligned face normal (a cube face's normal is always one of the six unit axes, so
this needs no per-pixel or per-box work). A face angled away from the light now gets only
the flat ambient floor, matching what a backfacing mesh normal already got — real variation
by angle instead of a canned per-face constant.

**Flight**: holding "jump" (Shift) while airborne now sustains a climb instead of leaving
the player to a single decaying jump arc. Each tick still held and not grounded, the move
system resets `velocity.y` to a flat `fly_speed` (4.0); physics then applies that tick's
gravity on top, netting a steady climb rather than an ever-accelerating one. Releasing stops
the reset and gravity alone takes back over. This is deliberately the smaller, more directly
useful piece of "general physics/character controller" capability for superhero-style
traversal, chosen over a broader (and, on investigation, harder to justify — see below)
multi-collider resolution change.

A design note worth recording: the first candidate for this round's physics-track item was
iterating collider resolution to convergence (a few passes per step instead of one), to
harden the documented "only one obstacle resolved per overlap per tick" limitation. Built,
then tested against a realistic corner case (a body overlapping a wall and a perpendicular
platform simultaneously) — the existing single-pass code already resolved it correctly.
Rather than keep searching for a contrived case to justify it, that change was set aside
undone in favor of flight, which is both smaller and directly serves the stated goal
(superhero-style traversal) rather than a robustness property with no demonstrated failure
in this codebase's actual scenes.

### F13 verification

- `engine_playground_tests` (extended): a new Box-lighting case renders an isolated white
  box under the default camera and asserts a genuinely bright face (>200), a genuinely
  dimmer-but-still-lit face (100–200), and a real gap between them (>30) — proving per-face
  variation exists, not one flat shade, without hardcoding the exact literal values (which
  were separately confirmed empirically: the three visible faces render at ~156/184/226,
  matching `face_light()`'s computed values for the +X/+Z/+Y axes exactly). A new flight
  case holds jump for 180 ticks and asserts still-airborne, `velocity.y` staying above 2.0
  (a steady climb, not decay), and climbing more than 5 units beyond an early sample —
  then releases and asserts `velocity.y` goes negative (gravity resumes).
- The pre-existing scripted-platforming test needed a real fix, not just updated numbers:
  its old fixed-cadence press/release timer (toggle every 15 ticks) predates flight and,
  once flight existed, would re-press before the player had landed from the previous hop,
  engaging sustained flight instead of a fresh liftoff and sending the script off the
  intended path. Fixed by tying the jump key to the player's live `grounded` state each
  tick instead of a timer — press the instant it's grounded, release otherwise — which
  both matches how a real player would bunny-hop this path and cannot accidentally engage
  flight. See [Playable slice](NATIVE_PLAYGROUND.md#playable-slice) for the same story in
  the user-facing docs.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13 CTest
  cases (same count as F12 — no new CTest targets) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed.
- Same SDL/desktop CI gap as F10–F12: not verified against the SDL-enabled preset in this
  sandbox; the new code has no SDL-guarded path.

## F14 — Camera follow and combat basics (0.14.0)

Two independent changes, again picked because they touch different files and share no
state: `OrbitView` gained a `target` (`include/engine/graphics/box_view.hpp`,
`source/engine/graphics/box_view.cpp`), and the default scene gained a stationary,
defeatable enemy (`apps/native_playground/scene.hpp`).

**Camera follow**: `BoxView::draw()` and `draw_mesh()` previously projected world positions
relative to the world origin only — the camera orbited and zoomed, but never actually
tracked anything, so moving far enough would carry the player off screen. `target` (default
`{0,0,0}`, so every existing caller renders identically to before) is now subtracted from
world-space positions before projecting; the playground's move system sets
`camera.target = box.center` every tick, so the player is always centered.

**Combat basics**: `place_enemy()` adds one stationary target near spawn with a `Health`
component (60 max) and deliberately no `Collider`. Pressing "attack" (F) while overlapping
it — `physics::overlaps`, the same test the goal uses — deals `attack_damage` (20); three
hits defeats it, latching `Scene::enemy_defeated()`. This is the first slice of the
"combat/ability system" pillar: intentionally minimal (one static target, no retaliation,
no cooldown beyond the natural edge-trigger), not a combat AI or ability system yet.

A real bug surfaced and was fixed during this milestone, not shipped: the enemy was
originally given a `Collider` like every other obstacle, on the reasoning that it should
also block movement. Testing showed this made "attack" nearly unusable — physics resolves
any solid overlap to exactly zero penetration each tick (pushes the body out until it just
touches), and `physics::overlaps` is a strict inequality test that reports zero penetration
as no overlap, so a solid enemy could essentially never register as "in range." Fixed by
making the enemy non-solid, like the goal, which is also what makes overlap detection
(rather than a proximity/reach radius) a coherent design for both.

### F14 verification

- New camera test: after 20 ticks of movement, `camera.target` exactly equals the player's
  `Box.center` (a direct per-tick assignment, so exact equality is the correct check, not a
  tolerance).
- New combat test: walks the player onto the enemy, confirms the overlap, then lands three
  scripted attacks (F is edge-triggered like jump, so the key is released and re-pressed
  each time) — asserts `Health.current` after each hit (40, then 20), `enemy_defeated()`
  staying false through two hits, the entity no longer alive and `enemy_defeated()` true
  after the third, and a fourth attack afterward being a safe no-op (still defeated, no
  crash).
- Updated the pre-existing action/spawn/remove/reset entity-count assertions for the new
  baseline (13, up from 12: player, 7 field boxes, 3 platforms, 1 goal, 1 enemy).
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13 CTest
  cases (same count — no new CTest targets) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed.
- Same SDL/desktop CI gap as F10–F13: not verified against the SDL-enabled preset in this
  sandbox; the new code has no SDL-guarded path.

## F15 — HUD health bar (0.15.0)

The combat basics F14 shipped had zero visual feedback: `Health` was an internal number with
no way to see it change except a console line at defeat. Adds `BoxView::draw_bar(x, y,
width, height, ratio, color)` (`include/engine/graphics/box_view.hpp`,
`source/engine/graphics/box_view.cpp`): a 2D screen-space overlay drawn directly into the
pixel buffer after whatever `draw()`/`draw_mesh()` already rendered — a fixed background
fill, then a `color` fill over the ratio-scaled left portion — ignoring the depth buffer and
camera entirely, so it always sits on top at a fixed screen position. `Scene::enemy_health_ratio()`
(`apps/native_playground/scene.hpp`) exposes `Health.current / Health.max` as an
`std::optional<float>`, `nullopt` once the enemy is gone rather than a stale ratio; the
playground draws a red bar at `(20, 20)`, `200×16`, whenever that is not `nullopt` (both in
the render loop and the `--snapshot` path).

Deliberately scoped to bars only, not text: a real font/glyph renderer is a separate,
larger piece of work (the engine has no text rendering anywhere yet), and a bar alone
already answers "is combat visible" without it.

### F15 verification

- New `draw_bar` tests: a half-full bar samples the fill color on the left half and the
  background color on the right; ratio 1.0 fills the entire width; ratio 0.0 is all
  background; an out-of-range ratio (2.5) is clamped rather than rejected; a bar that would
  draw outside the 800×500 frame is rejected; a non-finite ratio is rejected; calling before
  any `draw()` has established a frame is rejected.
- New `enemy_health_ratio()` test: 1.0 at full health, `40.0/60.0` after one scripted attack
  (matching the F14 combat test's own hit math), `nullopt` once the enemy is defeated.
- A real test bug was caught and fixed while writing these: the first draft reused the
  `boxes` vector from an earlier test in the same file to establish a frame for `draw_bar`,
  but that vector had already been mutated into a degenerate box (`size.x = 0`) by the
  "reject degenerate box" case just above it — `draw()` correctly threw. Fixed by using a
  fresh, valid box literal instead of the shared, already-mutated one.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13 CTest
  cases (same count — no new CTest targets) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed.
- Same SDL/desktop CI gap as F10–F14: not verified against the SDL-enabled preset in this
  sandbox; the new code has no SDL-guarded path.

## F16 — Ranged "blast" ability (0.16.0)

The second combat option, and the first traveling projectile: pressing "blast" (G) spawns a
`Projectile` (`apps/native_playground/scene.hpp`) — a `Box` plus a `velocity`/`lifetime`,
deliberately not a `physics::RigidBody` so it flies straight instead of arcing under
gravity — aimed at wherever the enemy's `Box` was at press time. A new
`playground.projectiles` system moves it every tick, destroying it on overlap with the enemy
(dealing `blast_damage`, 15 — weaker than melee's `attack_damage`, 20, since ranged is an
option, not a strict upgrade) or once its 1.5s lifetime runs out unused. `blast_speed`
(8 units/s) is fast enough to close a typical engagement distance well inside that lifetime.

Melee and ranged combat now share one defeat path: `Scene::damage_enemy(World&, float)`
factors out "apply damage, and on defeat destroy the entity and latch `enemy_defeated_`",
previously duplicated only inside the melee system, now called from both it and the new
projectile system.

### F16 verification

- New test: stops the scripted approach short of actually overlapping the enemy (proving
  this exercises genuine ranged combat, not melee with extra steps), confirms pressing
  blast spawns exactly one entity, then steps until the world shrinks back down (the
  projectile self-destroying) and asserts `Health.current` dropped by exactly
  `blast_damage` — distinct from `attack_damage`, proving the two abilities are actually
  different, not the same number under two names.
- Verified empirically before writing that test (a standalone trace, not guesswork): a
  single blast at a realistic engagement distance (~2 units) reaches the enemy in ~9 ticks,
  well inside the 90-tick (1.5s) lifetime budget, and the world's entity count round-trips
  (13 → 14 on spawn → 13 again on impact) exactly as expected.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13 CTest
  cases (same count — no new CTest targets) passed. A separate GCC 13.3.0 build with
  `-fsanitize=undefined -fno-sanitize-recover=all` also passed.
- Same SDL/desktop CI gap as F10–F15: not verified against the SDL-enabled preset in this
  sandbox; the new code has no SDL-guarded path.

## F17 — Real physics in the browser editor (0.17.0)

Everything F10–F16 built (physics, combat, flight, camera, HUD) landed exclusively in
`apps/native_playground`, never in `apps/editor` — the only place the repository owner
actually opens the built engine. The editor's WASM bridge (`apps/editor/runtime/bridge.cpp`)
never called `engine::physics::step`; `editor_tick()` just added `velocity/60` to position
every tick, so Play mode could not fall, land, or collide, no matter what the document
authored. This closes that gap for gravity and ground collision, the physics foundation
everything else in F10–F16 was built on, using the *same* `engine::physics` module the
native playground uses — not a reimplementation.

`Runtime` now registers `engine::Box` and `engine::physics::RigidBody` (replacing the old
ad hoc `Body{x,y,z,vx,vy,vz}` struct) plus `engine::physics::Collider` — registered so
`physics::step`'s `query<Box, Collider>` does not throw on an unregistered type, even
though no entity is given a `Collider` yet. `editor_add` now takes the entity's authored
size (`sx,sy,sz`, from its `Scale` component) alongside position/velocity, and writes a
`Box{center, size}` per entity so ground resolution rests the entity's actual authored
dimensions, not a hardcoded unit cube; `editor_value` reads `Box.center` instead of the
old struct's fields. A final `is_child` flag skips giving a `RigidBody` to any entity
with a `Parent`: the physics module has no notion of hierarchy, and a child's position is
parent-relative, not world-space, so simulating it against the world ground plane would
resolve it against a plane it isn't actually at (`physics::step` only touches `Box` +
`RigidBody` pairs, so a childless `Box` alone passes straight through untouched). The one
new fixed system, `editor.physics` (`FixedPhase::update`, order 10, matching the native
playground's own `playground.physics` system order), calls
`engine::physics::step(world, 1.0F/60.0F)` — real gravity (-18 units/s²) and ground-plane
resolution at y=0 — every tick. `main.ts`'s `syncRuntime()` now reads each entity's
`Scale` and whether it has a `Parent` alongside the position/velocity it already read, and
passes them into the four new `editor_add` parameters; no other TypeScript changed.

Deliberately scoped to gravity + ground plane only, not `Collider`-driven obstacles,
`Health`, or combat: those are real, separate follow-up work (see
[BTAI_EDITOR.md](BTAI_EDITOR.md#real-c-runtime-connection)), and this is the smallest slice
that proves Play mode runs genuine engine physics rather than a placeholder.

Three issues were caught by Codex's automated review on the PR and fixed before merge,
not deferred:

- **Quadratic `physics::step`.** `step()` called `world.query<Box, Collider>()` inside its
  per-body loop; `World::query()` scans every entity, so this was quadratic in entity count
  even with zero colliders (as the editor bridge always has today) — a real problem once a
  caller (the editor, capped at 1,024 entities, all rigid bodies) could plausibly hit it,
  unlike the native playground's small, hand-authored scenes. Fixed in
  `source/engine/physics/physics.cpp` itself, not just the bridge: the collider query is
  now taken once before the body loop and reused, since the fix belongs in the shared
  module every caller gets, not a bridge-local workaround.
- **Box size ignored authored `Scale`.** `editor_add` always created a unit `Box`
  regardless of the entity's actual authored scale, so a scaled entity's ground rest
  position didn't match its visible size — a height-4 box would settle with its center at
  y=0.5, embedding its bottom 1.5 units into the visible ground. Fixed by threading `Scale`
  through as described above.
- **Hierarchy children simulated in world space.** An entity with a `Parent` has a
  parent-relative local position, but the bridge was feeding it straight into physics as if
  it were a world-space position and resolving it against the world ground plane — visibly
  wrong (a child would settle relative to its parent, not the world, and could appear to
  accelerate twice once the parent's own transform was reapplied on top in Three.js). Fixed
  by excluding any entity with a `Parent` from simulation entirely, per the reviewer's own
  suggested alternative, rather than attempting full world-space transform composition
  (recursive parent-chain flattening) as a follow-up to a follow-up in the same PR.

### F17 verification

- Extended `tests/editor_bridge_tests.cpp` (built and run natively, without Emscripten, by
  linking `bridge.cpp` directly — same pattern as before): a new case drops an entity from
  `y=5` and steps 120 ticks, asserting it comes to rest at `y=0.5` (a unit box's half-height,
  resting on the ground plane) rather than free-falling forever or landing at `y=0`.
- The existing "does velocity move a body over 60 ticks" case still passes with the same
  entity now carrying `Box`/`RigidBody` instead of the old `Body` struct; its horizontal
  (`x`) assertion is unaffected by gravity, which only acts on `y`. Its tolerance moved from
  `1e-10` to `1e-4`: `Box`/`RigidBody` use `float`, not `double`, fields (matching every
  other physics/graphics type in the engine), and 60 accumulated single-precision steps
  measurably round differently than the old double-precision accumulation did — traced with
  a standalone diagnostic before touching the test (the actual drift is ~3e-6) rather than
  loosening the tolerance to make a failure disappear without understanding it.
- Checked `tests/browser/editor.cjs`'s Play/Pause/Stop case by hand: it asserts
  `Transform.position.x` after Stop, but Stop rebuilds the viewport from the untouched
  authoring document (`main.ts`'s `stop` handler never writes runtime state back into
  `doc`), so nothing this change does to `editor_tick()` can affect that assertion.
- New `editor_bridge_tests.cpp` cases for the three review fixes: a `1×4×1` box dropped
  from `y=5` rests at `y=2` (its own half-height), not `y=0.5` (a unit box's); non-finite
  and non-positive sizes are rejected the same way non-finite positions already were; and a
  child entity (`is_child` nonzero) placed at a position that reads as under the ground
  plane in world-space terms, with nonzero velocity, comes out of 120 ticks completely
  unchanged — proving it was never handed to `physics::step` at all, not merely resolved
  differently.
- `engine_physics_tests` (the native playground's own physics regression suite, unrelated
  to the bridge) still passes unchanged after hoisting the collider query in
  `physics.cpp` — same 13/13 CTest count, confirming the hoist is a pure performance
  change with no behavioral difference for existing callers.
- Confirmed `engine::physics::step` and its `Box`/`RigidBody`/`Collider` types add no link
  dependency beyond `source/engine/physics/physics.cpp` itself (no `box_view.cpp` or other
  graphics-library symbols) before adding that one file to `tools/build_editor.sh`'s `em++`
  command line and to `engine_editor_bridge_tests`'s CMake link libraries.
- Linux Clang 18.1.3 strict-warning headless build passed with zero warnings; all 13 CTest
  cases (same count — no new CTest targets) passed. A separate GCC 13.3.0 build of the
  bridge and its test with `-fsanitize=undefined,address` also passed.
- Not verified: the actual Emscripten/WASM compile and the Playwright browser suite
  (`tests/browser/editor.cjs`) — this sandbox has no Emscripten toolchain. CI's real emsdk
  3.1.64 build and browser test run is the verification of record for the WASM/browser
  side of this change, same as every editor-bridge change before it.

## F18 — Field Lab removed; the editor is the site (0.18.0)

The repository owner pointed out that the published site's root (`https://islandyout.github.io/engine/`)
was Field Lab (F-entry above), a standalone isometric "collect the signals" browser demo
with its own separate WASM build, unrelated to the editor at `/engine/editor/` one click
away — a second, non-editor way to interact with compiled engine content, directly against
the standing directive that the editor is the only way to build and play games. It also
duplicated what F17 just proved the editor itself can now demonstrate (real, compiled C++
running live in the browser), so it no longer served a purpose distinct from confusion.

Removed outright: `apps/field_lab/main.cpp`, `web/field-lab/`, `tools/build_field_lab.sh`,
`tests/field_lab.cjs`, `tests/browser/field_lab.cjs`, `docs/FIELD_LAB.md`. Nothing
engine-level was lost in the deletion: Field Lab was built entirely on already-shared core
types (`engine::SeededRandom`, `engine::InputReplay`, priority input contexts) that live in
`include/engine/core` and `include/engine/input` and are independently used and tested by
the native playground and `core_tests`/`action_tests` — Field Lab consumed them, it never
owned them. `docs/AETHER_REVIEW.md` gets a note pointing this out rather than being rewritten,
since it is a dated provenance record, not living documentation.

The editor becomes the deployed site's root instead of living one path segment under a demo:
`apps/editor/vite.config.ts`'s `base` moves from `/engine/editor/` to `/engine/`, its `outDir`
from `build/field-lab/editor` to the flat `build/site`; `tools/build_editor.sh` follows the
same rename and now also copies `third_party/aether/LICENSE` (previously only Field Lab's
build script did — the bench asset's attribution needs to survive at the new root without
depending on the app that's gone). `.github/workflows/field-lab.yml` is replaced by
`editor.yml`: the Field Lab compile/test steps are gone, the Pages deploy path points at
`build/site`, and the workflow's own `name:` changes to "Editor browser build" — the `build`
and `deploy` job ids are kept unchanged from before, since those (not the workflow's display
name or file name) are what a branch protection rule's required-check list actually matches
against. The editor's own header swaps its "Field Lab" link (now pointing at nothing) for a
"View source" link to the GitHub repo — draining the one genuinely reusable affordance
Field Lab's own header had, rather than just deleting it.

### F18 verification

- `tests/browser/editor.cjs`: `root` moved to `build/site`, and the Play-mode navigation URL
  from `/engine/editor/` to `/engine/` (the new root) — checked for any assertion on the old
  "Field Lab" header link text first; there was none, so nothing else needed to change.
- Confirmed nothing else in the repository still referenced `field-lab`/`field_lab`/`Field Lab`
  in a way that assumed the app or its build output still existed, by grepping the whole tree
  after the edits (not just guessing the file list was complete): `README.md`,
  `docs/BTAI_EDITOR.md`, and the two docs above were the only living documentation that named
  it; `docs/IMPLEMENTATION_STATUS.md`'s own earlier F-entry is left as the historical record it
  is, per this file's append-only convention.
- Confirmed `third_party/aether/LICENSE` is still bundled independently into every native
  download by `.github/workflows/c-cpp.yml` (unrelated to this change) before concluding the
  editor's own copy of it was additive, not a fix for something already broken.
- Not verified here: the actual `editor.yml` Pages workflow run (this sandbox cannot run
  GitHub Actions) — same as every editor/browser change, CI is the verification of record,
  and this entry additionally can't be confirmed as *not* breaking a required-status-check
  rule from inside this sandbox; watched on the PR instead.

## F19 — Model catalog (0.19.0)

The repository owner supplied the original `aether-complete.zip` archive again and asked
where its other 132 GLB assets had gone — `docs/AETHER_REVIEW.md` had only ever recorded
importing the bench, leaving the rest cataloged but never pulled in. Verified the resupplied
archive against the SHA-256 already recorded in `assets/CREDITS.md`
(`c70cac7397eed5ee9941d88bc1afa4740b68aecc26a61042fab5a71ac211dd72`) before touching it —
it matched exactly, so this is the same archive, not a different one under the same name.

Surveyed every kit GLB's glTF JSON (node/mesh/skin/animation counts, not just header/JSON
validity as the original F-review checked) to find out how much of the kit
`tools/cook_static_mesh.py`'s narrow single-node/no-skin/no-texture contract already
covers: 90 of 132 (buildings, furniture, nature, roads, signs) are exactly one node and one
mesh with no skin, animation, or embedded texture — structurally identical to the bench
that already works. 14 more (all of `vehicles/`) have multiple nodes (separate wheel
meshes) and would need the cooker extended for hierarchy. The remaining 28 (all of
`animals/` and `people/`) are rigged and animated — genuinely out of scope until the engine
has an animation system, matching the original review's own call on this.

Realized mid-survey that the cooker's contract is native-renderer-specific, not a bridge to
cross for the editor at all: the browser editor already renders `.glb` files directly
through Three.js's own `GLTFLoader` (that's how the bench works today), which handles
multi-node hierarchy and (though unused here) skinning without any cooking step. So instead
of extending the cooker, brought in the 103 non-rigged assets (90 single-node plus the 14
multi-node vehicles — Three.js doesn't care about node count) as `assets/source/kit/**`,
deduplicating the kit's own `furniture/bench.glb` against the already-imported
`assets/source/bench.glb` (identical file, confirmed by hash) rather than storing it twice.

`apps/editor/src/scene/modelCatalog.ts` is a generated manifest (103 entries: id, category,
name, path) — ids 2–104, reserving 0 (default box) and 1 (bench) as already-public
`Renderable.mesh` values. Two ways to use a catalog entry, both going through it:

- The Project/Content panel's new category/model pickers and "Add from catalog" button
  spawn an entity with that `Renderable.mesh` id, awaiting the model's `GLTFLoader.loadAsync`
  (cached per id) before spawning so the very first render already shows the real model
  instead of a placeholder box that then swaps.
- The inspector's existing `Renderable.mesh` dropdown (`PropertyMetadata.ts`, previously a
  2-option Box/Bench enum) now lists all 103 entries too, so an already-placed entity's model
  can be changed the same way its other components already are — the catalog isn't
  spawn-only.

`rebuild()`'s mesh selection still handles bench (id 1) as a special case (unchanged, tests
depend on it), then checks a `Map<number, THREE.Group>` cache for catalog ids; a cache miss
kicks off (and dedupes, via a `Map<number, Promise>`) a background load and falls back to
the default box until it resolves, then re-`rebuild()`s — the same pattern the bench already
used, generalized to N ids instead of one. This makes loading a previously-saved scene that
references a catalog id (not just the "Add" button's own already-awaited path) work
correctly too.

`assets/CREDITS.md` gets one prefix row (`source/kit/**`) covering all 103 files, not 103
rows — same CC0 1.0 grant the bench's own row already cites, same source archive, matching
the convention the *original* Aether kit's own CREDITS.md used for exactly this reason ("a
generated kit needs one row rather than one per file"). `tools/build_editor.sh` gets one more
line (`cp -r assets/source/kit build/site/kit`) alongside its existing bench copy.

### F19 verification

- New `apps/editor/tests/modelCatalog.test.ts`: catalog ids are unique and all ≥2 (never
  collide with the reserved box/bench values), `catalogCategories` exactly matches the set of
  categories actually referenced by entries (not a separately hand-maintained list that could
  drift), and every entry's `path` resolves to a real file under `assets/source/kit` — this
  last check is a real regression guard for the generated-manifest-vs-actual-files drift that
  a hand-maintained list would risk silently.
- `npm run typecheck`, `npm test` (11/11, up from 8), and `npm run build` in `apps/editor`
  all pass; confirmed the built `assets/index-*.js` bundle actually changed size (the new
  manifest module got included, not silently dropped).
- Manually replicated `build_editor.sh`'s asset-copy steps (can't run the em++ half of that
  script here) and served the real `build/site` output over HTTP with the exact fixed server
  logic from `tests/browser/editor.cjs`: `/engine/`, `/engine/bench.glb`, and spot-checked
  catalog paths from three different categories (`kit/buildings/apartment-1.glb`,
  `kit/signs/sign-crossing.glb`) all return 200 — not just that the files exist on disk, but
  that the exact paths the manifest and the server logic agree on actually line up end to end.
- Extended `tests/browser/editor.cjs`: selects the "signs" category, clicks "Add from
  catalog", and asserts both that "Sign Crossing" (the alphabetically-first signs entry, so
  deterministic without touching the model dropdown) appears in the hierarchy and that the
  entity count increments by exactly one.
- Confirmed the archive's SHA-256 before extracting or trusting anything in it, since the
  filename alone ("aether-complete1.zip") doesn't prove it's the same file the original
  review evaluated.
- Not verified here: the actual Emscripten build and the extended Playwright browser test
  — this sandbox has no Emscripten toolchain, same as every prior editor-bridge change. CI's
  real build is the verification of record.

## F20 — Animated models in the editor (0.20.0)

The repository owner asked for the system needed to bring F19's 28 excluded
rigged/animated assets (`animals/**`, `people/**`) into the editor too, and whether the
source archive had any already-solved animation code worth reusing rather than building
from scratch. It does: `src/anim/` is a ~2,600-line procedural locomotion system (a
continuous idle→walk→run→sprint gait driven by actual velocity, with inertia, lean,
banking and footstep events) — genuinely substantial prior work, but written against
Aether's own `Skeleton`/`Pose` classes, not Three.js bones, so it is real adaptation
work to reuse, not a copy-paste. That port is real, separate, larger follow-up work,
not attempted here.

What *is* immediately reusable, and what this does instead: every animals/people GLB
already carries its own baked `AnimationClip`s (checked per-file, not assumed from one
sample) — people have `idle, walk, run, sprint, talk, sit, wave`; quadrupeds have
`walk, trot, run, idle, graze`; birds have `idle, peck, walk, fly` — on a consistent,
near-standard humanoid bone naming (`hips, spine, chest, shoulder.L/R, upperArm.L/R, ...`).
Three.js's own `AnimationMixer`/`AnimationClip`/`SkeletonUtils` already play exactly this
kind of data; no custom playback engine was needed for a first pass.

Imported all 27 individual character/animal files as `assets/source/kit/animals/**` and
`assets/source/kit/people/**`, appended to `modelCatalog.ts` as ids 105–131 (the
existing 2–104 kept their ids unchanged — regenerating the whole manifest alphabetically
would have silently reordered `animals` before `buildings` and shifted every id from the
already-merged F19 catalog). Excluded `people/_animation-library.glb`: confirmed by
inspecting its own glTF JSON that every individual character file already carries its own
copy of the clips it needs, so the shared library file is a generation-time source, not a
placeable model.

`SkeletonUtils.clone` replaces the plain `.clone(true)` F19 used for static props for any
entry marked `animated: true` — a bare `THREE.Object3D.clone()` does not correctly
duplicate a `SkinnedMesh`'s bone bindings, silently producing a mesh that renders in bind
pose but never actually deforms. Each animated instance gets its own `AnimationMixer`
bound to its own clip set (`apps/editor/src/editor/main.ts`'s `rebuild()`, in an
`AnimState` kept parallel to the existing `objects` array, reset alongside it on every
rebuild). `apps/editor/src/editor/animationClips.ts`'s `pickClipName(names, speed)` — a
small, independently unit-tested pure function — selects a clip each frame from the
entity's *measured* ground speed (the same position delta over time the render loop
already needed), tiered idle/walk/trot-or-run/sprint and falling back down the tier, and
finally to whatever the model actually has, since not every rig shares the same clip set.
Mixers advance every rendered frame in both Edit and Play mode — a placed character never
sits perfectly still, matching the source archive's own locomotion.js comment that
"stillness reads as broken rig" — while ground speed, and so anything but "idle", stays
at zero until Play mode actually moves the entity.

Three real issues were caught by Codex's automated review on the PR and fixed before
merge, not deferred:

- **Vertical motion counted as ground speed.** The original speed measurement was full
  3D `distanceTo`, so a falling body (gravity) or the physics ground correction snapping
  it up could read as ground speed and wrongly trigger a walk/run clip with no horizontal
  motion at all. Fixed by measuring X/Z displacement only, in a new pure, unit-tested
  `groundSpeed()` (`apps/editor/src/editor/animationClips.ts`).
- **Speed measured on render frames, not simulated ticks.** `object.position` only
  changes on a frame where a fixed 60 Hz tick actually ran; on a display refreshing
  faster than that, most frames would read zero displacement and the frame a tick did
  run would read a full tick's displacement over a few milliseconds of real time —
  flickering between clips whose every switch calls `reset()`, so the animation barely
  progressed on a 120/144 Hz display. Fixed by moving clip selection out of the
  per-render-frame block into one that only runs in Play mode when at least one tick
  executed that frame, using `steps / 60` (the actual simulated time those ticks cover)
  as `groundSpeed()`'s time delta instead of the render frame's wall-clock `dt`. The
  mixer itself still advances every render frame regardless, for smooth playback
  interpolation — only clip *selection* is tick-aligned.
- **The canvas (no-WebGL) fallback rendered every animated model frozen in bind pose.**
  `CanvasRenderer` projects each mesh's raw position attribute through
  `object.matrixWorld`; it never applied a `SkinnedMesh`'s bone matrices, and never called
  `skeleton.update()` (normally `WebGLRenderer`'s job) at all, so the mixer's own
  output never reached this rasterizer's projection even the math had. This was latent
  since F19 (no catalog entry was skinned before F20), but F20's own new browser-test
  addition (adding an "animals" entry) would have exercised it on the CI matrix's
  `EDITOR_NO_WEBGL=1` run. Fixed by implementing the standard GPU skinning formula
  (bindMatrix → weighted bone matrices → bindMatrixInverse) on the CPU in
  `CanvasRenderer.ts`, applied per vertex for a `SkinnedMesh` before the existing
  `matrixWorld` transform, with `skeleton.update()` called once per such mesh per frame
  first so `boneMatrices` actually reflects the mixer's current pose.

### F20 verification

- New `apps/editor/tests/animationClips.test.ts`: idle at near-zero speed; walk, then
  trot/run, then sprint as speed rises; falls back correctly for a rig missing a tier
  (a bird with no "trot"/"run"/"sprint" still lands on "walk", not undefined); falls back
  to a model's first clip when none of the tiered names exist at all; returns `undefined`
  for a clipless model rather than throwing.
- `apps/editor/tests/modelCatalog.test.ts` needed no changes and still passed against all
  131 entries (it iterates `modelCatalog` generically rather than asserting a hardcoded
  count) — a real regression check that adding entries didn't silently break the earlier
  invariants (unique ids, categories matching what's referenced, every path resolving to a
  file on disk), not just "the test still runs."
- Confirmed by inspecting glTF JSON directly (not assumed): bone names across sampled
  people rigs and sampled quadruped/bird rigs, that every individual character file (not
  just `_animation-library.glb`) carries its own embedded clips, and that
  `kit/animals/fox.glb` (CC0, aether-assetgen) is a different file by hash from the
  archive's top-level `assets/fox.glb` (the Khronos Sample Models Fox, CC BY 4.0) that
  `docs/AETHER_REVIEW.md`'s original review explicitly kept out — confirming this import
  didn't accidentally pull in the one asset that review deliberately excluded.
- Extended `tests/browser/editor.cjs` with a second catalog add (the "animals" category,
  "Cat") after the existing "signs" one, exercising the `SkeletonUtils.clone` +
  `AnimationMixer` path specifically, not just the static-model path F19's test covered —
  this same test now also exercises the canvas-fallback skinning fix, since the suite
  already re-runs the whole file with `EDITOR_NO_WEBGL=1`.
- New `apps/editor/tests/animationClips.test.ts` cases for `groundSpeed()`: zero for
  purely vertical motion; correct magnitude for a known 3-4-5 X/Z displacement; identical
  result for the same total displacement measured over 1 tick vs. 3 ticks (the
  frame-rate-decoupling guarantee, checked directly rather than trusted by inspection);
  zero for a non-positive time delta rather than `Infinity`/`NaN`.
- `npm run typecheck`, `npm test` (19/19, up from 15 before these fixes), `npm run build`
  in `apps/editor`: all pass.
- Not verified here: the actual Emscripten build and Playwright run, and — more
  significantly for this entry than most — what the animation actually looks like
  rendered (this sandbox has no Emscripten toolchain and no way to view a WebGL canvas).
  Correctness here rests on unit-testing the pure clip-selection logic and on Three.js's
  own `AnimationMixer`/`SkeletonUtils` being mature, widely-used primitives, not on having
  watched a character actually move.

## F21 — The bench joins the catalog it predates (0.21.0)

The repository owner, looking at the live editor, asked for the bench to stop being "out
on its own": a standalone "Add Aether bench" button existed alongside the F19/F20 model
catalog's own category/model pickers and "Add from catalog" button — two different ways
to place a model, one of them a special case for exactly one model. The bench predates
the catalog (0.9.0), so this was accumulated history, not a deliberate design.

Folded it in as the catalog's own id 1 (`{ category: "furniture", name: "Aether Bench",
path: "./bench.glb" }`), keeping its existing path (the root-level `bench.glb`, not
`kit/furniture/bench.glb`, deduplicated away in 0.19.0 as the identical file) and its
existing id — `Renderable.mesh: 1` is a public contract every scene saved since 0.9.0 may
already use, so it could not simply move to a fresh id at the end of the list. Removed:
the standalone button and its click handler, the dedicated eager `GLTFLoader().load()`
call at startup (the bench now loads lazily through the same `catalogCache`/
`loadCatalogModel` path as every other entry, the first time anything actually
references id 1 — a freshly loaded saved scene, or a new "Add from catalog" pick), the
`let bench` variable, and `rebuild()`'s `meshId === 1 && bench` special case (its
`meshId >= 2` guards on the generic catalog path became `>= 1`, and that's the entire
diff needed to make id 1 behave like any other static, non-animated entry). Also removed
`PropertyMetadata.ts`'s hardcoded `{ label: "Aether bench", value: 1 }` inspector-dropdown
option, since `modelCatalog` supplies it now and the two would otherwise duplicate.

Only id 0 (the default box a mesh renders as before any catalog entry has loaded) stays
outside the catalog — it isn't a placeable model at all, just a fallback.

Codex's review caught one real issue before merge: the fallback branch's lazy-load
callback (`rebuild()`'s `loadCatalogModel(meshId)?.then(() => rebuild())`) attached a
fresh completion handler per *entity*, not per *id*. A scene with N entities sharing one
uncached catalog id — bench included, now that it's a normal, frequently-duplicated
entry instead of a special case with its own single dedicated loader — triggered N
independent `rebuild()` calls once the (correctly deduplicated, single) underlying load
resolved, each re-cloning the entire scene: O(entities) redundant full-scene rebuilds for
what is, functionally, one load finishing. Fixed by extracting the "attach at most one
completion handler per key while a load for it is in flight" pattern into a small,
independently unit-tested `loadOnce()` (`apps/editor/src/editor/loadOnce.ts`), rather than
patching another ad hoc `Set` guard inline — the same coalescing bug could recur for any
other frequently-duplicated catalog model, not just the bench.

### F21 verification

- `apps/editor/tests/modelCatalog.test.ts`: the "no id collides with the reserved 0/1
  range" invariant became "no id collides with 0" (1 is now legitimately in the catalog);
  a new case asserts exactly one entry has id 1 and its name mentions "Bench"; the
  path-resolution test now branches for id 1 (resolves against `assets/source/bench.glb`
  directly) instead of assuming every path starts with `./kit/`.
- `apps/editor/tests/transform.test.ts`'s existing `Renderable.mesh` metadata case
  asserted the bench option sat at a fixed array index (1) — true only by accident of the
  old hardcoded-then-spread array order, and false now that bench is sorted into the
  catalog alongside the rest of `furniture`. Fixed to find the bench option by its value
  (1) and label instead of trusting position, which is what the assertion actually meant
  to check.
- Extended `tests/browser/editor.cjs`: replaced `#bench` (now removed) with the same
  "select furniture, select id 1, Add from catalog" flow every other model now uses,
  selecting the model explicitly by id rather than relying on it sorting first (it does,
  since "Aether Bench" precedes "Barrier" alphabetically — moved the catalog entry itself
  ahead of "Barrier" to match, since it had been appended after it by mistake — but the
  test shouldn't depend on catalog ordering to place the one entity it most needs to get
  right, unlike the "signs" case further down, which deliberately does rely on
  alphabetical-first for a narrower reason: determinism without touching the model
  dropdown at all). Updated the entity-name assertions from "Aether bench" to
  "Aether Bench" to match the catalog's Title Case naming convention (matching every
  other entry, e.g. "Sign Crossing").
- New `apps/editor/tests/loadOnce.test.ts`, using controllable fake promises rather than
  real network loads: five calls for the same key while a load is in flight start it
  exactly once and resolve the completion callback exactly once (the exact N-entities
  case Codex flagged, reproduced directly rather than trusted by inspection); a rejection
  still clears the key and fires the reject callback once; a key can be retried with a
  fresh load after its previous one has settled; `start()` returning `undefined` (no
  catalog entry for that id) touches nothing.
- `npm run typecheck`, `npm test` (24/24, up from 20 before this fix), `npm run build` in
  `apps/editor`: all pass. Full native rebuild + `ctest`: all 13 cases pass (no C++
  changed this round).
- Manually rebuilt `build/site` and confirmed `/engine/bench.glb` still resolves
  (unchanged path, unchanged `build_editor.sh` copy step — this round only changed how
  the *editor* references it, not where it's served from).
- Not verified here: the actual Emscripten/Playwright run — this sandbox has no
  Emscripten toolchain, same as every editor-bridge change. CI's real build is the
  verification of record.

## F22 — Player control: WASD, jump/flight, camera follow (0.22.0)

The repository owner asked for everything the native playground (F10–F16) can do that
the editor still can't, in priority order, starting with the actual blocker: nothing in
the editor could be *controlled*. Play mode only ever simulated whatever velocity an
entity was authored with; there was no way to move anything with a keyboard, and no
camera that followed a moving entity, so nothing else on the list (collision, combat,
flight, HUD) could really be felt even once built. This closes that gap: a new `Player`
marker component, WASD ground movement, Shift jump/sustained-flight (ported from the
native playground's own tuned feel, not reinvented), and a camera that follows.

`Player` (`apps/editor/src/scene/{Components,Scene,SceneSerializer}.ts`,
`apps/editor/src/authoring/CommandInterpreter.ts`) is a genuinely empty marker
component — its presence on an entity, not any field on it, is what the bridge treats
as "drive this with input." Threaded through the same four files every prior component
addition touched (Components' interface, Scene's component map, SceneSerializer's
name list + `normalizeComponent` case, CommandInterpreter's own name list +
`defaultComponent` case), plus the Project/Content "Add component" dropdown.

`apps/editor/runtime/bridge.cpp` gets: a `PlayerMarker` tag component; `editor_add`'s
existing parameter list gains `is_player` (its 11th, following the same
incremental-extension pattern `is_child` and, before it, `sx/sy/sz` used) — ignored for
a child, same as velocity, since a parent-relative entity has no `RigidBody` to drive;
two new exports, `editor_input_begin_frame()` and `editor_key(code, down)`, feeding the
`Runtime`'s existing (previously never-fed) `InputState`; and a new `editor.move` fixed
system at phase order 0 (before `editor.physics`'s order 10, so this tick's input lands
before physics integrates it) that, for every `Box+RigidBody+PlayerMarker` entity, sets
`RigidBody.velocity.x/z` directly from held WASD (not the native playground's own
direct-`box.center` mutation — physics::step integrates x/z the same way it already
integrates y, so this is more consistent with the bridge's existing design, not a
divergence from it) and applies the native playground's exact jump/fly logic
(`pressed(jump) && grounded` → liftoff at `jump_speed`; `key_down(jump) && !grounded` →
sustained climb at `fly_speed`, the same two tuned constants) unchanged.

`editor_key`'s `code` is a small, explicit bridge-owned contract (0=W, 1=A, 2=S, 3=D,
4=Shift) via `key_for()`, not `engine::Key`'s own enum ordinals — those are free to
change independently of this bridge's exported ABI, and binding to them directly would
make an unrelated engine header edit a silent, unversioned break in the JS↔WASM
contract. `editor_input_begin_frame()` must be called once per rendered JS frame,
before draining that frame's queued key events, mirroring the native platform's own
`begin_frame()`-then-apply-events loop (`source/engine/runtime/application.cpp`) — get
this backwards (or skip it) and `key_pressed()`/`key_released()` stop reading as
single-frame edges, which is exactly the class of bug that turned a discrete jump tap
into runaway sustained flight earlier in this project's own native playground work
(see F13's changelog entry) — so the editor's own frame loop drains `keyQueue` via
this call at the very start of its Play-mode branch, before ticking, not synchronously
from the DOM `keydown`/`keyup` handlers themselves, which only ever push into the queue.

Camera follow needed no bridge change at all: the editor already reads every entity's
position from C++ every frame to update its Three.js object; the frame loop just also
copies the tagged entity's position into `OrbitControls.target` before its own
`controls.update()` call, so mouse orbit/pan/zoom around that recentered target keep
working exactly as they did before — following only moves *what's orbited*, not who's
driving the camera. The status bar's new `Player (x, y, z)` (one decimal, Play mode
only) reuses that same lookup and made an otherwise hard-to-verify browser behavior
directly assertable in a test, which is also a genuine, independently useful bit of UX
(seeing where you actually are), not test-only scaffolding.

### F22 verification

- Extended `tests/editor_bridge_tests.cpp` first, natively, before touching a line of
  JS or bridge glue beyond the minimum to compile: a non-player entity holding D for 30
  ticks doesn't move at all (the `PlayerMarker` query actually gates behavior, not just
  "any `RigidBody` responds"); a player entity moves under held D/A/W/S independently
  (each of the four keys individually verified, not just one and assumed), stops
  immediately (no coasting) the tick after release; a single jump tap arcs up under
  gravity and lands back at rest once released; holding jump while airborne climbs
  monotonically (checked every tick, not just start/end) well past a single jump's
  reach, and still falls and lands normally once released. All of this against the
  bridge's real `editor_add`/`editor_tick`/`editor_key`/`editor_input_begin_frame`
  exports — not a reimplementation of the same logic for testing purposes.
- New `apps/editor/tests/document.test.ts` case: attaching `Player` via
  `attach_component` yields exactly `{}`; it survives a save/load JSON round-trip
  (proving `SceneSerializer`'s new case actually reaches disk-format, not just
  in-memory state); `remove_component` cleanly removes it.
- `npm run typecheck`, `npm test` (25/25, up from 24), `npm run build` in
  `apps/editor`: all pass.
- Extended `tests/browser/editor.cjs`: spawns a fresh entity (resting at its default
  y=0.5, no authored velocity to muddy the picture), tags it `Player`, enters Play,
  and holds `d` through Playwright's real keyboard API (a genuine DOM `keydown`, not
  `editor_key()` called directly — that path is what the native test above already
  covers exhaustively) until the status bar's own `Player (x, ...)` readout reports
  `x > 1`; confirms Stop still reverts to the unchanged authoring document (position
  still exactly its spawn default) the same way the existing play/pause/stop case
  already does for a different entity.
- Full native rebuild + `ctest`: all 13 cases pass. GCC 13.3.0 build of the bridge and
  its test with `-fsanitize=undefined,address` (now also linking
  `source/engine/input/input.cpp`, needed for the first time by this round —
  `InputState`'s methods were declared but never actually called before): clean.
- Not verified here: the actual Emscripten/Playwright run, and what the movement and
  camera follow actually look like rendered — this sandbox has no Emscripten toolchain
  or WebGL. Correctness rests on the native bridge test's exhaustive coverage of the
  actual movement/jump/flight algorithm (identical C++ code path, not a reimplementation
  for testing) plus the browser test's real-keyboard integration check, not on having
  watched a character move on screen.

## F23 — Collision: `Collider` obstacles block movement (0.23.0)

Round 2 of the "finish all six" plan (see F22): the world you build in the editor now
actually blocks the player, instead of every `RigidBody` — the player included — passing
straight through anything else placed in the scene. `engine::physics::step` already
implemented generic `Box+RigidBody` vs. `Box+Collider` resolution (used by the native
playground, F10) and `bridge.cpp` already registered the `Collider` component; this
round is entirely "consult data that was already being carried but ignored," not new
physics.

`editor_add`'s parameter list gains a 12th, `is_collider` — same incremental-extension
pattern `is_player` (F22), `is_child`, and `sx/sy/sz` before it used — set from
`doc.scene.has(entity, "Collider")` in `apps/editor/src/editor/main.ts`'s `syncRuntime()`.
When nonzero and the entity isn't a child, the bridge sets `engine::physics::Collider{}`
on it (defaulting `is_static = true`), the same generic obstacle type `physics::step`
already resolves any `Box+RigidBody` entity out of along its axis of least penetration —
so this is nothing player-specific; a plain `RigidBody` entity with authored `Velocity`
is blocked identically, verified directly. Like `is_player`, `is_collider` is ignored for
a child entity: its `Box` is parent-relative, not world-space, so treating it as a world
obstacle would resolve other bodies against a box that isn't actually where it renders —
the same reasoning F17/F22 already applied to excluding a child from physics/`Player`
generally. `Collider`'s own `type`/`halfExtents`/`radius` fields remain unconsumed:
`engine::physics` has no shape concept beyond a `Box`'s AABB anywhere in the engine, so
an authored `Sphere` collider resolves as its bounding box's AABB, same as `AABB` — not
a gap specific to this round.

### F23 verification

- Extended `tests/editor_bridge_tests.cpp` first, natively: a static `Collider` obstacle
  stops a `Player` entity driven straight at it via held D — the player's x settles at
  the obstacle's near face and stays there for far longer than an unblocked crossing
  would take, never passing through; a plain `RigidBody` entity (no `Player` tag, just a
  constant authored `Velocity`) is blocked the same way, proving the resolution is
  generic physics, not something special-cased for the player; a `Collider` authored on
  a hierarchy child is *not* turned into a world obstacle — an unrelated mover sails
  straight past where it sits, confirming the same child-exclusion `Player`/`RigidBody`
  already get. All three against the bridge's real exports.
- `npm run typecheck`, `npm test` (25/25, unchanged — `Collider` itself isn't new
  authoring surface, only newly consulted at runtime), `npm run build` in
  `apps/editor`: all pass.
- Extended `tests/browser/editor.cjs`: spawns an obstacle entity, adds `Collider` to it
  via the Add-component dropdown, positions it in the path of the `Player`-tagged entity
  the F22 test left parked at the origin, re-enters Play, holds `d` through Playwright's
  real keyboard API, and confirms the status bar's live `Player (x, ...)` readout stalls
  at the obstacle's near face rather than climbing past it.
- Full native rebuild + `ctest`: all 13 cases pass. GCC 13.3.0 build of the bridge and
  its test with `-fsanitize=undefined,address`: clean.
- Not verified here: the actual Emscripten/Playwright run — this sandbox has no
  Emscripten toolchain or WebGL, same limitation as F22. Correctness rests on the native
  bridge test's exhaustive coverage of the actual `physics::step` resolution path
  (identical C++ code, not a reimplementation) plus the browser test's real-keyboard
  integration check.

## F24 — Combat: melee, ranged blast, and a Health HUD (0.24.0)

Round 3 of 3 in the "finish all six" plan (see F22, F23) — the last gap with the native
playground: the `Player` can now fight. `Health` (`current`/`maximum`) was already an
authored component (unconsumed, like `Collider` was before F23); `bridge.cpp` gains its
own local `Health`/`Projectile` structs (ported, not shared, from the native playground's
own — neither is a general engine primitive there either) and two new fixed systems.

**Melee** (`editor.combat`, order 20, matching the native playground's own combat system
order): press F while the player's `Box` overlaps a `Health` entity's `Box` — the same
overlap test `Collider` resolution (F23) and the native playground's own goal/combat
checks use — and every entity it's touching takes `attack_damage` (20), the native
playground's own constant, unchanged. **Ranged**: the blast-fire logic lives inside the
existing `editor.move` system (order 0), matching where the native playground's own
blast-spawn logic lives (its single "move" system handles movement, spawn, blast and
remove together) rather than a separate system. Press G to fire a `Projectile` (velocity
+ 1.5s lifetime, no gravity, ported from the native playground unchanged) from the
player's position toward whichever `Health` entity is currently *nearest* — the editor's
own generalization of the native playground's single hardcoded `enemy` target, since
nothing here is otherwise player- or enemy-specific. A new `editor.projectiles` system
(order 15, between physics and combat, again matching the native playground's own
ordering) moves each projectile and, on overlapping any `Health` entity other than its
own `owner` (a new `Projectile` field, set at creation — without it a blast could damage
whoever fired it, since it spawns at the shooter's own position and briefly still
overlaps it), applies `blast_damage` (15) and destroys it; past its lifetime with no hit,
it's destroyed unconsumed. A shared `damage()` helper applies the reduction and destroys
the target at 0, for both attacks.

Neither attack reads `InputState::key_pressed()` directly. `editor_tick()`'s own doc
comment already noted a rendered frame can cover zero to five fixed ticks sharing one
`editor_input_begin_frame()` call; `key_pressed()` stays true for every tick in that
batch, so a frame with zero ticks would silently drop a press before any tick ever
observed it, and a five-tick catch-up frame would fire it once per tick instead of once
per press (caught by review on this round's own PR, not by the native tests below, which
always ticked immediately after setting input and so never exercised the zero-tick case).
Two new `Runtime` fields, `pending_attack`/`pending_blast`, set by `editor_key()` on a
genuine F/G keydown and consumed (cleared) by the first tick that acts on them, decouple
"a press happened" from frame/tick timing entirely — the fixed systems above capture
`this` instead of taking a stateless lambda, the only reason that's needed anywhere in
this bridge so far.

`editor_add` gains a 13th/14th param pair, `hp_current`/`hp_max` — `hp_max <= 0` is the
"no Health" sentinel (a real `Health` always has a positive max), following the same
incremental-extension pattern every prior round used. Like `is_collider`, ignored for a
child (a world-space overlap test can't work against a parent-relative box). Because
combat can now destroy an authored entity mid-session — nothing else in this bridge ever
did — `editor_value()` and a new `editor_alive()` export both guard against a dead
`Entity` handle first (previously safe by omission, since nothing destroyed a synced
entity before this round); JS uses `editor_alive()` to hide a defeated entity instead of
snapping it to the origin. Projectiles have no authored entity of their own (spawned
entirely at runtime), so they don't fit the existing `entities`-indexed `editor_value()`
scheme at all; two more new exports, `editor_projectile_count()`/`editor_projectile_value()`,
let JS enumerate and draw however many currently exist, re-queried fresh each call since
JS only ever calls them back-to-back within one frame.

On the editor side: a pooled set of small Three.js meshes (grown/shrunk to match
`editor_projectile_count()` each Play-mode frame) renders projectiles, since they have no
place in the existing `objects`/`rebuild()` array. The per-frame position sync only ever
forces an entity's mesh *invisible* on `editor_alive()` reporting it dead, never visible —
`rebuild()` already set each mesh's starting visibility from its own authored
`Renderable.visible`, and an entity that's still alive never needs that touched again
(an earlier version of this forced every alive entity visible unconditionally, silently
overriding an authored `visible: false`; caught by the same review pass as the pending-edge
fix above). A second canvas (`#hud`), layered over
the renderer's own via DOM order and `pointer-events: none` so it never steals viewport
interaction, draws a small screen-space bar above every alive `Health` entity each
Play-mode frame — the editor's equivalent of the native playground's own
`BoxView::draw_bar` (see [HUD](NATIVE_PLAYGROUND.md#hud)), reading a projected screen
position from Three.js instead of a native renderer's own camera math. The status bar
gains a text companion for whichever entity is currently selected, `Selected health: NN%`
or `Selected: defeated` — genuinely useful (precise numeric value, screen-reader
accessible) the same way F22's `Player (x, y, z)` readout was, not test-only scaffolding,
though it is what makes combat's outcome assertable from a browser test at all, the same
role that readout played for player movement.

### F24 verification

- Extended `tests/editor_bridge_tests.cpp` first, natively: melee damages every `Health`
  entity the player overlaps and defeats (destroys) one at 0 health, never damages the
  attacking player itself even when it also carries `Health` (self-overlap is trivially
  true); a blast fired at a single target hits and damages it; blast targets the
  *nearest* of several `Health` entities, not simply the first found; a blast with no
  `Health` entity anywhere is a no-op (nothing spawned, mirroring the native playground's
  own `enemy.has_value()` guard); a blast that never reaches a far-off target expires on
  lifetime and deals no damage. All against the bridge's real exports, including the new
  `editor_alive()`/`editor_projectile_count()`/`editor_projectile_value()`.
- Two more cases added after review caught the pending-edge and owner-exclusion bugs
  (both below): a press applied via `editor_key()` and then deliberately starved of any
  tick in that same "frame" (simulated by calling `editor_input_begin_frame()` a second
  time before any tick runs, exactly what a real zero-tick browser frame would do) still
  lands once the next tick actually runs — proving `pending_attack`/`pending_blast`
  survive the frame boundary that would have already cleared a bare `key_pressed()`; and
  a blast fired by a `Player` that also carries `Health` never damages the shooter itself
  despite spawning at its own position, while still going on to hit the real target.
- `npm run typecheck`, `npm test` (25/25, unchanged — `Health` itself isn't new authoring
  surface, only newly consulted at runtime), `npm run build` in `apps/editor`: all pass.
- Extended `tests/browser/editor.cjs`: two `Health`-tagged targets (one weak and
  overlapping the player, one at range), F and G driven through Playwright's real keyboard
  API, verified entirely through the new status-bar readout — a real end-to-end path, not
  `editor_value()` called directly.
- Full native rebuild + `ctest`: all 13 cases pass. GCC 13.3.0 build of the bridge and its
  test with `-fsanitize=undefined,address`: clean.
- Not verified here: the actual Emscripten/Playwright run, and what the HUD bars/blast
  projectile actually look like rendered — this sandbox has no Emscripten toolchain or
  WebGL, same limitation as F22/F23. Correctness rests on the native bridge test's
  exhaustive coverage of the actual damage/targeting/lifetime algorithm (identical C++
  code, not a reimplementation) plus the browser test's real-keyboard integration check.

## F25 — Movement feel: camera-relative WASD, facing, jump weight, vehicle driving (0.25.0)

Direct user feedback after F22–F24 shipped: WASD felt "flipped," the run animation looked
unnatural, jump was stiff, and `Vehicle` did nothing when added. Root-caused each before
fixing anything (see the F25 verification section for how), then built
`examples/demo-game.json` to dogfood the fixes together, per the same feedback's own
request.

**"Flipped" WASD** was never a sign bug: movement was locked to fixed world axes (W was
always world -z) while the viewport camera starts at a diagonal angle and can be freely
orbited, so *any* camera angle other than dead-on -z made some keys feel wrong — a
structural issue, not a typo. Fixed by making on-foot movement camera-relative: a new
export, `editor_set_camera_forward(x, z)`, feeds the camera's live horizontal facing into
`Runtime::camera_forward_x/z` once per rendered frame (`apps/editor/src/editor/main.ts`,
via `camera.getWorldDirection()`), and `editor.move`'s on-foot branch now computes
`right = cross(forward, up)` and resolves W/A/S/D against `forward`/`right` instead of raw
world x/z. Backward-compatible by construction: `camera_forward_x/z` defaults to world
`(0, -1)`, so a `Runtime` nothing ever calls the new export on — every native test written
before this round, none of which call it — reproduces the exact old fixed-axis behavior
bit-for-bit, which is what let all of them keep passing unmodified.

**Unnatural running** turned out not to be primarily a mocap-quality problem: the bigger
issue is that nothing ever rotated a moving entity's mesh to face its direction of travel,
so a rigged character played a forward-run clip while sliding sideways or backwards
relative to its own fixed orientation — the "moonwalking" look. Fixed entirely in
`apps/editor/src/editor/main.ts`'s animation-clip-selection loop (no bridge change needed):
each tick batch now also computes `atan2(dx, dz)` from the same position delta already used
for `groundSpeed()`, and turn-rate-limited `object.rotation.y` toward it whenever speed is
above the existing idle threshold. Skipped for a `Vehicle` entity, whose facing comes from
its own exact steered heading instead (below) rather than a delta-inferred one that would
lag and wobble mid-turn. Clip quality itself (the actual joint motion baked into each
Aether-kit GLB) is not something this round changed or can fully judge without a browser to
look at — this fix addresses the structural cause available evidence pointed to first.

**Stiff jumping** — a pure vertical translation with nothing else reacting to it — gets a
cheap squash-and-stretch: the player mesh stretches tall while rising, squashes while
falling, and eases back to its authored scale once vertical speed settles near zero,
scaled from the actual authored `Scale` captured when Play starts (`playerBaseScale` in
`main.ts`) rather than a hardcoded 1. Player-only (the reported complaint), and explicitly
skipped for a `Vehicle` entity — a car visibly deforming like a jumping character would
read as a rendering bug, not a style choice.

**`Vehicle` doing nothing** was confirmed exactly as suspected: `VehicleComponent` (just
`{archetype: number}`) was authored data from the start, like `Collider` and `Health`
before their own rounds, but nothing in the bridge ever consulted it — adding the
component visibly changed nothing, which was itself the bug. Now, an entity with both
`Player` and an authored `Vehicle` gets a new bridge-local `Heading{yaw, speed}` component
(`editor_add`'s 15th param, `is_vehicle`) and a different movement model in `editor.move`:
W/S accelerate/reverse (`vehicle_accel` = 6 units/s², clamped to
`vehicle_max_forward`/`vehicle_max_reverse` = 9/4 units/s) along the vehicle's own heading
with momentum and drag (coasts to a stop, doesn't halt dead on key-up), A/D steer that
heading (`vehicle_turn_rate` = 2.2 rad/s) rather than strafing sideways. Self-relative by
construction (W always means "accelerate forward," A/D always mean "turn"), so nothing
about it depends on world-axis orientation the way the old on-foot model did — driving
never had the "flipped" problem foot movement did, even before the camera-relative fix.
Simplified arcade model, not real car physics: constant turn rate regardless of speed, no
traction curve. A vehicle always starts facing world +z, since `editor_add` has no
`Rotation` input to seed a better initial heading from — documented, not silently wrong.
`editor_value`'s field 4 exposes `Heading.yaw`, which `main.ts` applies directly to
`object.rotation.y` each Play-mode frame for a `Vehicle`+`Player` entity (verified
algebraically consistent with glTF's own +Z-forward convention: a Y-axis rotation of `yaw`
sends local +Z to world `(sin(yaw), cos(yaw))`, exactly the formula `editor.move` already
uses for `velocity.x`/`velocity.z`).

`examples/demo-game.json` (new) is a small hand-authored "format 1" scene — a drivable car
(`Player`+`Vehicle`, mesh 98 "Sedan") inside a four-`Collider` walled arena with one
obstacle crate, two `Health` targets, and two backdrop buildings — exercising every system
from F22 through this round together, per the feedback that asked for exactly that. Loads
only through the editor's own `Open` button: `Player`/`Vehicle` aren't in
`engine::parse_scene_document`'s recognized-component list, so `engine_playground --scene`
rejects it outright (confirmed by reading `source/engine/scene/scene_document.cpp`'s own
`known_components` list, which the native playground uses to validate — not a new gap this
round introduced). `apps/editor/tests/demoScene.test.ts` loads it through the editor's own
`EditorDocument`/`validateSceneDocument` path (the same one `Open` uses) and asserts entity
counts, the car's components, and that every referenced catalog mesh id still exists — a
real regression guard against the schema and the example drifting apart, not a one-time
eyeball check.

### F25 verification

- Extended `tests/editor_bridge_tests.cpp` first, natively: with the camera facing world
  +x instead of the default, D (camera-relative "right") moves along +z and W moves along
  +x — never world +x/-z — proving the mapping actually follows the camera, not just that a
  constant got renamed; every pre-existing WASD/jump/collision/combat test kept passing
  unmodified, proving the default-camera-forward path is bit-for-bit the old behavior.
  Vehicle: steering alone (no throttle) turns `Heading.yaw` without moving the entity at
  all (velocity is `speed * trig(yaw)`, and speed is still zero); held throttle's per-tick
  position delta grows tick over tick (a >10x ratio between the 2nd and 30th tick's delta),
  proving genuine acceleration rather than an instant constant velocity; releasing the
  throttle keeps it moving for several more ticks (coasting) before settling to an exact,
  stable stop (drag clamped at zero, not oscillating past it); sustained full throttle caps
  its per-tick advance at exactly `vehicle_max_forward`/60 once the ramp finishes.
- `npm run typecheck`, `npm test` (26/26, up from 25 — the new
  `apps/editor/tests/demoScene.test.ts`), `npm run build` in `apps/editor`: all pass.
- Extended `tests/browser/editor.cjs`: adds `Vehicle` to the existing WASD-tested player,
  holds `w` through Playwright's real keyboard API, and confirms the status bar's own
  `Player (x, y, z)` readout advances by more than one full unit — a real end-to-end path,
  not `editor_value()` called directly.
- Full native rebuild + `ctest`: all 13 cases pass, zero warnings. GCC 13.3.0 build of the
  bridge and its test with `-fsanitize=undefined,address`: clean.
- Not verified here: the actual Emscripten/Playwright run, or what any of this looks or
  feels like rendered and driven by hand — this sandbox has no Emscripten toolchain, no
  WebGL, and no way to play the game interactively, the same limitation as every prior
  round. This round's fixes were root-caused from reading the actual movement/rendering
  code (confirmed the camera starts at a diagonal angle; confirmed nothing ever set
  rotation from movement direction; confirmed `Vehicle` was read nowhere in the bridge) and
  the native/TypeScript tests verify the resulting algorithms precisely, but whether the
  run cycle now genuinely looks natural, or the vehicle genuinely feels good to drive, is
  something only playing it in a real browser can confirm.

A review pass on this round's own PR caught three further issues, fixed in the same PR
before merge: the squash-and-stretch recomputed (and could flicker) on a rendered frame
that ran zero fixed ticks — now gated on `steps > 0`, the same guard the animation-clip
selection already used; a non-square vehicle's `Box.size` stayed fixed to its authored
world-axis dimensions while its rendered mesh turned to face its heading, so a 90-degree
turn made the visible car far wider than what it actually collided with — `Heading` now
also carries the footprint's half-extents, and `editor.move` recomputes `Box.size.x/z`
every tick as that footprint's own rotated-rectangle axis-aligned bounding box at the
current yaw, verified natively by placing a wall only a *turned* long vehicle's footprint
can reach; and `examples/demo-game.json`'s north/south arena barriers only spanned the
gap between the east/west walls, not past them, leaving roughly four-unit corner gaps
the car could drive out through — widened to fully overlap the side walls.

## F26 — Catalog-model `Scale` normalization (0.26.0)

F25 shipped without ever running in a real browser (no Emscripten/Playwright in that
sandbox). This round built the actual WASM runtime and played `examples/demo-game.json`
by hand, per the same "make a real game and iterate" feedback F25 was already responding
to — and found the scene nearly unplayable: the Player Car rendered nearly as long as the
arena's own boundary walls, which also made its steering look wrong (it wasn't; it was
just too oversized to read).

Root cause: `BTAI_EDITOR.md` documents an authored `Scale` component as an entity's
literal world-space size, the same dimensions `engine::physics::Box` uses — but
`rebuild()` in `apps/editor/src/editor/main.ts` applied it directly
(`object.scale.set(s.x, s.y, s.z)`) to catalog GLB meshes on top of their own baked-in
real-world dimensions (the bundled sedan is ~4.7m long, ~2.2m wide before any scale),
stacking scale on scale. `Player Car`'s authored `Scale{1.8, 1.3, 4.0}` — an
ordinary car size — rendered at roughly `{3.9, 1.9, 18.8}`. Fixed by caching each
catalog model's own rest-pose bounding-box size (`CachedModel.nativeSize`) when it
loads, and normalizing an authored `Scale` by that native size before applying it to a
catalog-backed object, so the rendered size matches the literal authored value (and the
physics `Box`, which already read `Scale` directly and was never affected). The
`BoxGeometry` placeholder used before a catalog model finishes loading keeps the old
direct behavior, since it's already a unit cube. `examples/demo-game.json`'s two
backdrop buildings had no authored `Scale` at all, so they rendered at native size too —
one of them is a ~24×30×19m office-tower model, dwarfing the 8-unit-radius arena from
only 11 units away; given real dimensions and moved farther out to read as a skyline
backdrop instead of looming over the play area.

A review pass on this round's own PR caught one further issue: the viewport's transform
gizmo drags a catalog-backed object's own (now-normalized) three.js `scale`, but the
gizmo's mouse-up handler persisted that normalized value directly as the new authored
`Scale`, so dragging a model's scale handle would save the wrong (much smaller) number
and the model would visibly shrink on the very next rebuild. Fixed by converting the
gizmo's before/after scale back through the same `nativeSize` before building the
`set_component` command, so a scale drag on a catalog model now saves literal
dimensions like every other authoring path.

### F26 verification

- `npm run typecheck`, `npm test` (26/26), `npm run build` in `apps/editor`: all pass.
- Built the real Emscripten/WASM editor runtime and ran `tests/browser/editor.cjs`
  (genuine WebGL via Playwright, `--enable-unsafe-swiftshader`) end to end: all existing
  coverage, including vehicle driving, still passes unmodified.
- Played `examples/demo-game.json` by hand in that same real browser session — forward,
  steering, reverse, melee, blast — and confirmed via screenshots that the car and
  backdrop buildings now render at correct, readable proportions, and that the car's
  turning reads correctly once it's no longer oversized (it always was correct; F25's
  own algebraic proof of the yaw-to-rotation mapping held throughout — the earlier
  in-sandbox uncertainty about it was this bug, not that proof).

## F27 — Wiring up `AIState` and `Pedestrian` (0.27.0)

An engineering audit of the editor against Unity/Unreal/Godot/Bevy/PlayCanvas (prompted
by direct feedback that the demo scene "looked like foolishness") found `AIState` and
`Pedestrian` fully authorable in the editor — saved, reloaded, inspected — but never
read by the simulation: an entity tagged `AIState` behaved identically to one without
it. Same bug class as `Vehicle` before F25, just not yet caught. This round wires both
up to real autonomous behavior instead of leaving them inert or removing them.

`apps/editor/runtime/bridge.cpp` adds an `AIAgent` component (bridge-local, the same
pattern as `Heading` for `Vehicle`) that drives its own `RigidBody` velocity each tick
via a new `editor.ai` system, without ever reading `InputState`: it wanders on its own
(alternating random-direction Walking/Running phases with Idle rests, each a randomized
1–3s), chases the nearest `Player` once one comes within `ai_sense_radius` (6 units),
and flees instead once its own `Health` ratio drops to or below `ai_flee_health_ratio`
(30%) — fleeing outranks chasing, and applies even to a `Pedestrian`-tagged entity,
since self-preservation isn't hostility. A `Pedestrian` marker (mirroring `Heading`
needing `PlayerMarker`) makes an `AIAgent` never enter Chasing regardless of proximity —
a harmless wanderer, not a hostile one. Wander direction and phase length come from a
small per-entity xorshift32 PRNG seeded from the entity's authoring order, not wall-clock
time, so the whole pattern is exactly reproducible run to run — required for
`editor_bridge_tests.cpp` to assert on it at all. `editor_add` gained `is_ai`/
`is_pedestrian` params (17 total now); `editor_value`'s field 5 exposes `AIAgent.state`
as a plain int matching `AIStateName`'s declared order, `-1` for no `AIAgent`. Two of
`AIStateName`'s seven values are never actually produced: `Driving` is reserved for a
possible future AI-controlled `Vehicle`, which this round doesn't implement; `Dead` is
unreachable in practice since `editor.combat` already destroys a `Health` entity outright
the tick it hits 0, before this system could ever observe and label it.

On the JS side, the only change needed was passing `isAi`/`isPedestrian` through to
`editor_add` in `syncRuntime()` — F25's own facing-toward-movement and speed-based
animation-clip selection already runs over every entity's measured position delta, not
just the Player's, so an animated catalog model (a `Npc`/`Hero`) tagged `AIState` picks
up correct walk-cycle animation and facing for free. `main.ts` also gained a
`selectedAiReadout` in the status bar — `Selected AI: <state> (x, z)` for whichever
entity is selected during Play, the same pattern `selectedHealthReadout` already used for
`Health` — both to make an NPC's live decisions watchable without eyeballing the
viewport, and because the black-box browser test below needs some UI-visible signal to
assert against.

`examples/demo-game.json`: both `Target Drone` targets gained `AIState` (no
`Pedestrian`) — they now chase the player on approach and flee once hurt, instead of
standing still to be shot at. A new `Bystander` entity (`AIState` + `Pedestrian`, an
animated `Npc` model) wanders the arena harmlessly. `apps/editor/tests/demoScene.test.ts`
updated to match (11 entities now, both targets and the bystander asserted to carry the
right components).

### F27 verification

- Extended `tests/editor_bridge_tests.cpp` first, natively: an `AIAgent` with no
  `Player` anywhere moves on its own from tick one (state Walking or Running, never
  Idle, and measurably displaced from spawn after 1s — the shortest possible wander
  phase); a non-`Pedestrian` `AIAgent` within sense radius reports Chasing from tick one
  and closes the distance; the same setup with low `Health` reports Fleeing and widens
  the distance instead; a `Pedestrian` in range never reports Chasing, falling back to
  wander; and a chasing `AIAgent` stops at a `Collider` wall exactly like the existing
  Player-vs-`Collider` case, proving the AI system's velocity write goes through the
  same physics resolution as everything else rather than bypassing it.
- `npm run typecheck`, `npm test` (26/26, `demoScene.test.ts` updated in place rather
  than growing the count), `npm run build` in `apps/editor`: all pass.
- Full native rebuild + `ctest`: all 13 cases pass. GCC 13.3.0 build of the bridge and
  its test with `-fsanitize=undefined,address`: clean.
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/editor.cjs`
  (genuine WebGL via Playwright): a fresh entity given `AIState` through the real
  inspector UI, with Play started with no key ever pressed for it, reports Chasing and a
  closing x-position through the new status-bar readout — a real end-to-end path, not
  `editor_value()` called directly.
- Played the updated `examples/demo-game.json` by hand in that same real browser
  session: both `Target Drone`s and the `Bystander` visibly move on their own — the
  `Bystander` walked the full width of the arena, with correct walk-cycle animation and
  facing, entirely from F25's existing position-delta-driven systems and zero new
  rendering code.

## F28 — Scripting hook: embedded Lua `Script` component (0.28.0)

An engineering audit comparing this editor against Unity/Unreal/Godot/Bevy/PlayCanvas
concluded the one gap that actually matters is that every piece of gameplay behavior —
walk, drive, melee, blast, wander/chase/flee — is a hardcoded C++ system; there was no
way to add new gameplay logic without editing and recompiling the engine itself. Every
comparable real engine gives an author that from inside the editor. This round closes
that gap with a `Script` component: attach it to any entity, write Lua in the inspector,
and it runs.

Lua 5.4.7 is vendored (`third_party/lua/`) rather than depending on an external package,
so the same interpreter runs identically native and in the WASM browser build — chosen
specifically for that native/browser parity. Only the `base`, `table`, `string`, `math`,
`utf8`, and `coroutine` standard libraries are available to a script: `os`, `io`, and
`package`/`require` aren't just left unopened at runtime, their source files
(`loslib.c`, `liolib.c`, `loadlib.c`, `ldblib.c`) are excluded from the build entirely,
so no script can touch the filesystem, spawn a process, or load another module, however
it's written. `load`/`loadstring`/`dofile`/`loadfile` are nilled out after the base
library opens, closing the one remaining way a script could generate and run new code at
runtime. A `lua_sethook` instruction-count watchdog (2,000,000 instructions per tick)
catches a runaway `while true do end` deterministically, independent of the host
machine's speed. A script that fails to compile or errors at runtime is reported once
through an error callback and then permanently skipped — never retried, never crashes
the rest of the simulation — the same "never crash on bad input" posture as scene
loading.

`engine::script::Runtime` (`include/engine/script/script.hpp`,
`source/engine/script/script.cpp`) owns one `lua_State` per scripted entity in a side
table, not inside the ECS `Script` component itself — `Script` stays the trivially
copyable `{source: std::string}` that `World::Store<T>`'s `std::map`-backed storage
expects, while the VM's lifetime and any raw pointers live in `Runtime`, created lazily
and torn down when the entity's `Script` is removed. Each fixed tick, `Runtime::step`
builds a fresh `self` table (`x`/`y`/`z` mirroring the entity's `Box.center`, read-only;
`vx`/`vy`/`vz` seeded from the entity's current `RigidBody.velocity`) and calls the
script's `on_tick(dt)` if defined, then writes `self.vx`/`vy`/`vz` back to
`RigidBody.velocity` — the same "script/AI writes velocity, physics integrates it"
convention `Player`, `Vehicle`, and `AIAgent` already use, so a scripted entity collides,
falls, and is blocked by `Collider`s exactly like everything else.

`apps/editor/runtime/bridge.cpp` registers `engine::script::Script`, runs
`editor.script` as a `FixedPhase::update` system, and adds two new numeric-ABI-breaking
exports — `editor_set_script_source(int index, const char *source)` and
`editor_script_error(int index)` — since the existing `editor_add`-style exports are all
`double`s and can't carry a string. The WASM build already had no string marshaling
wired up at all, so `tools/build_editor.sh` now also passes
`-sEXPORTED_RUNTIME_METHODS=ccall`, and the TS side calls these two through
`runtime.ccall(...)` instead of a direct `_functionName()` call.

On the TS side, `Script` is a normal component: `Components.ts`/`Scene.ts` add the type,
`CommandInterpreter.ts` gives it a starter `on_tick` template when added through the
inspector's "Add component" dropdown, and `SceneSerializer.ts` validates `source` as a
string on load. `PropertyMetadata.ts` gained a `multiline` flag so `Script.source`
renders as a `<textarea>` in the inspector instead of a single-line `<input>` — the only
field in the editor that needs more than one line. `main.ts`'s status bar gained a
`selectedScriptErrorReadout` (`· Script error: <message>`) — a script's only feedback
that something's wrong is otherwise a silently inert entity with no visible cause.

Scripting is deliberately scoped to the browser editor this round: `engine::script` is
ordinary shared engine-core code, reusable from `apps/native_playground` in principle,
but wiring it into the native playground wasn't done here — the goal was making a game
through the existing editor, not expanding the native playground's own surface.

### F28 verification

- `tests/script_tests.cpp` (new, native): a script that writes `self.vx`/`vy`/`vz` moves
  the entity through real physics integration; `self.x`/`y`/`z` reflect `Box.center` but
  writing to them has no effect; an entity with `Script` but no `on_tick` is a no-op, not
  an error; a compile error and a runtime error are each reported to the error handler
  exactly once and the entity is skipped on every later tick, never retried; `os`/`io`
  are unavailable to a script (calling them errors, doesn't hang or crash); an infinite
  loop is caught by the instruction watchdog instead of hanging the test; removing
  `Script` from an entity tears down its VM; two scripted entities keep fully isolated
  Lua state from each other.
- Extended `tests/editor_bridge_tests.cpp`: `editor_set_script_source` drives real
  movement with zero input; a compiling-but-broken script's error surfaces verbatim
  through `editor_script_error`; an entity with no `Script` set reports no error.
- Full native rebuild + `ctest`: all 14 cases (up from 13) pass. GCC 13.3.0 build with
  `-fsanitize=undefined,address`: clean, including through the vendored Lua sources
  linked in (compiled separately, outside this project's own `-Wall -Wextra -Wpedantic
  -Wconversion -Wshadow -Werror` flag set, since they're third-party code).
- `apps/editor/tests/document.test.ts`: `Script` attaches with the starter template,
  edits round-trip through save/load, and a malformed (non-string) `source` is rejected
  on load. `npm run typecheck` and `npm test` (27/27, up from 26) both pass.
- Built the real Emscripten/WASM editor runtime (Lua compiled in via a new
  `tools/build_editor.sh` step, `runtime.js` growing from ~131KB to ~451KB) and ran it
  through genuine WebGL via Playwright: attached `Script` to a fresh entity through the
  real inspector UI, gave it a sin/cos orbiting `on_tick`, hit Play, and confirmed via
  before/after screenshots that the entity visibly moved under the script's own control
  with no key ever pressed — then confirmed separately that a deliberately broken script
  surfaces its exact Lua error (`')' expected near 'this'`) through the status bar
  instead of failing silently. `tests/browser/editor.cjs` gained a permanent assertion
  version of both checks.
- Post-review fixes (Codex): `error()` with a non-string argument (a table, `nil`, a
  number — all valid Lua) no longer hands `lua_tostring`'s null straight to
  `std::string`'s constructor; `error_text()` now goes through `luaL_tolstring`, which
  always produces real text. Editing an entity's `Script.source` — including one that
  was previously broken — now recompiles from scratch on the next `step()` instead of
  either continuing to run the old VM's stale source or staying permanently skipped over
  a source that no longer exists. `self.vx`/`vy`/`vz` values that aren't finite (`0/0`,
  `math.huge`) are now rejected the same way a non-number already falls back to
  "unchanged this tick", instead of propagating NaN/infinity into `RigidBody.velocity`
  and from there into physics. Four new checks added to `tests/script_tests.cpp` covering
  all three; full `ctest` (still 14/14 executables) and the real-browser suite re-verified
  clean.

## F29 — Prefabs: author once, place many, edit-propagates (0.29.0)

The roadmap that followed the engine audit named prefabs a Tier 1 item alongside
scripting: author "Player Car" once, place ten, edit the source and every instance
updates. This round adds that as a new `PrefabInstance` component and a
`PrefabDefinition` scene concept, entirely in the browser editor's TypeScript
authoring layer — no bridge or engine-core changes, since a prefab is a relationship
between authored data, not new simulated behavior.

The model is **live-shared, not copy-on-place**: an instance entity stores only its
own `Transform`/`Name`/`Parent`/`PrefabInstance` (placement and identity are always
per-instance); every other component type — `Health`, `Renderable`, `RigidBody`,
`Collider`, `Vehicle`, `AIState`, `Pedestrian`, `Player`, `AnimationState`, `Script`,
`Velocity`, `Acceleration` — is defined once on the shared `PrefabDefinition` and
read live by every instance. Editing a shared value through any one instance's
inspector is instantly visible on every other instance, with no separate "apply to
all" step and no risk of an instance drifting out of sync. The accepted trade-off for
v1: no per-instance override of a prefab-defined value — an instance that needs to
differ belongs to a different prefab. This was an explicit design choice (asked of
the user directly, given the real alternative — copy-on-place with an explicit
re-apply step, closer to Unity/Godot — trades that zero-staleness guarantee for
per-instance overrides) rather than assumed.

`Scene.ts` gains `prefabableComponentNames`/`PrefabableComponent` (the single runtime
source of truth for which component types a prefab can define, also driving the
compile-time type) and `PrefabDefinition`, plus a `prefabDefs` map and the read-side
API: `resolve()` (an entity's own literal data if any, else its prefab's, mirroring
`get()` for the placement/identity types that are never prefab-defined) and
`effectiveHas()`/`effectiveComponentNames()` built on it. `CommandInterpreter.ts`
gains three commands — `create_prefab` (captures a plain entity's current prefabable
components into a new named definition, removing them from the entity's own storage
and replacing them with a `PrefabInstance` reference), `place_instance` (a new entity
with just `Transform` + `PrefabInstance`), and `unlink_instance` (materializes an
instance's currently-resolved data as its own literal components and detaches it,
standalone from then on) — and routes `set_component`/`attach_component`/
`remove_component` to the shared prefab definition instead of the entity itself
whenever the target entity is an instance and the component type is prefabable, so
every existing inspector edit path "just works" for a prefab instance without the UI
needing to know the difference.

`SceneSerializer.ts` adds an optional top-level `prefabs` map to `SceneDocument`,
serialized/deserialized alongside entities and validated the same way everything
else is (an entity's `PrefabInstance.prefab` must name a prefab actually present in
the document). `main.ts`'s inspector shows a banner ("Instance of prefab X…" plus an
Unlink button) for an instance, and a "Make prefab…" button otherwise; the dock's
Project panel gained a prefab picker and "Place instance" button, mirroring the
existing "Add from catalog" flow. Every one of `main.ts`'s ~30 `doc.scene.get`/`has`/
`getComponentNames` call sites — the inspector's field rendering, `syncRuntime()`,
`rebuild()`, every status-bar readout — now goes through `resolve()`/`effectiveHas()`/
`effectiveComponentNames()` instead, so a prefab instance's shared data reaches the
actual WASM simulation and every display path with no separate wiring per call site
(safe uniformly: those resolved accessors agree exactly with the literal ones for
every type a prefab can't define, which is everything Transform/Rotation/Scale/Name/
Parent/PrefabInstance touches).

### F29 verification

- Extended `apps/editor/tests/document.test.ts`: creating a prefab moves a
  component off the source entity onto the shared definition; a second instance
  shares that data from the moment it's placed; editing the shared component
  through either instance updates both; `Transform` stays independent per
  instance; unlinking materializes the current value and freezes it against later
  shared edits; save/load round-trips the `prefabs` map and rejects a
  `PrefabInstance` referencing an unknown prefab. `npm run typecheck` and
  `npm test` (28/28, up from 27) both pass.
- Full native rebuild + `ctest`: unaffected, still 14/14 (this round touches no
  C++).
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/
  editor.cjs` (genuine WebGL via Playwright): made a prefab from a real entity
  through the inspector's "Make prefab…" button, placed a second instance through
  the dock's prefab picker, edited `Health.maximum` on one instance through the
  real inspector field and confirmed the other instance's own field read back the
  same new value live, then unlinked one instance and confirmed it kept its
  materialized value through a further shared edit that no longer reached it.
- Post-review fixes (Codex, on PR #36): `set_velocity`/`set_physics`/`set_ai_state`/
  `trigger_animation` read/wrote a linked instance's component directly instead of
  through `writeComponent`, silently creating an entity-local override that stopped
  following the shared prefab -- now routed the same way `set_component` already was.
  `unlink_instance` handed the unlinked entity the prefab's own component objects by
  reference rather than `structuredClone`d copies, so a later in-place edit (those
  same four commands mutate their component in place) on the "unlinked" entity could
  still corrupt the prefab and every instance still linked to it. `place_instance`
  allocated its entity before validating `transform`/`name`, leaking an unreachable,
  un-undoable entity on a validation failure -- inputs are parsed first now, matching
  `spawn_entity`'s own convention. The prefab picker built its `<option>`s through
  raw `innerHTML` string interpolation, which mis-parses a name containing `"`, `<`,
  or `&` instead of just displaying it -- rebuilt with the `Option` constructor, the
  same pattern already used elsewhere in this file. `serializeScene`'s prefab map was
  built through incremental bracket assignment on a plain object literal, so a prefab
  named `__proto__` would invoke that key's legacy setter instead of creating a real
  own property and silently vanish from the saved file -- rebuilt through
  `Object.fromEntries` instead, immune to the same footgun `JSON.parse` already is.
  Four new cases added to `document.test.ts` covering all of the above; `npm run
  typecheck` and `npm test` (32/32, up from 28) both pass; the real-browser suite
  gained a check placing an instance of a prefab named `Boss "Red" & Co` through the
  picker, re-verified clean end to end.

## F30 — Audio: a Sound component and real Web Audio playback (0.30.0)

Closes Tier 1's last item: "currently there is none at all." A `Sound` component
picks a clip from a small bundled catalog and plays it through the real Web Audio
API, starting when Play begins and stopping when it ends — the same Play-mode-scoped
lifecycle `Script`'s `on_tick` and `AIAgent` already run under, not an
event-triggered one-shot system (no "play this when melee lands"): that needs the
bridge to expose which tick a combat/collision event actually fired, which this
round deliberately doesn't add, the same "stay in the browser editor, don't chase a
bigger system" scoping this session has held to since the scripting round.

Sound needed real audio content, and this project had no audio asset pipeline (only
the bundled 131-model kit, itself originally a user-supplied archive rather than
something fetched live — outbound network to CC0 sources like kenney.nl is blocked
by this sandbox's own egress policy). The user supplied four Kenney.nl CC0 1.0 sound
packs (~350 files total); a curated 10-file subset — not an exhaustive import — went
into `assets/source/audio/` under new catalog-friendly names, covering the existing
demo scene's combat/world sounds: two loop-friendly ambiences (engine idle, force
field hum) and eight one-shot stingers (melee/metal hit, explosion, glass break,
bell, door open/close, coin pickup). Full provenance, pack hashes, and the
original-filename mapping are in `assets/CREDITS.md`. `apps/editor/src/scene/
soundCatalog.ts` mirrors `modelCatalog.ts`'s shape; `tools/build_editor.sh` copies
`assets/source/audio/` into `build/site/audio/` alongside the existing model-kit copy
step.

`Sound { clip, volume, loop, autoplay }` is a normal component throughout: it's
prefab-shared like `Renderable`/`Script` (`prefabableComponentNames` in `Scene.ts`),
serializes/validates through `SceneSerializer.ts` (`volume` a new `unitInterval`
helper clamps to `[0,1]`, rejecting out-of-range rather than silently clamping — same
posture as `RigidBody.mass must be positive`), and gets a starter default and
inspector dropdown (`PropertyMetadata.ts`'s `Sound.clip`, grouped by category) the
same way every other component does.

Playback itself lives entirely in `main.ts`, mirroring `loadCatalogModel`'s
promise-cache pattern (`soundBufferPromises`/`soundBuffers`) for `fetch` +
`AudioContext.decodeAudioData`, evicting a failed load the same way a failed model
load already does. `startSounds()` runs once when Play begins (after
`syncRuntime()`), starting a `AudioBufferSourceNode` per live `autoplay` Sound
(resolved through the prefab, like everything else in `syncRuntime()`) into a
per-clip `GainNode` for `volume`, tracked in `activeSounds` keyed by entity index.
Pause suspends the whole `AudioContext` — every currently-playing sound's actual
output pauses in place, not just muted while still running out its buffer
underneath — and the Play button, when it doubles as Resume (`doc.mode ===
"pause"`), resumes it; Stop tears every tracked source down. An async clip load that
resolves after its Play session already ended (a second Stop/Play cycle, or Stop
itself) checks `doc.mode` before ever calling `.start()`, so it can't leak a sound
into a scene that's no longer playing.

### F30 verification

- Extended `apps/editor/tests/document.test.ts`: attaching `Sound` gets sensible
  defaults; edits round-trip through save/load; `volume` outside `[0,1]` is rejected
  on load; `Sound` is prefab-shared like every other prefabable component (editing
  one instance's clip updates a sibling instance live). `npm run typecheck` and `npm
  test` (33/33, up from 32) both pass.
- Full native rebuild + `ctest`: unaffected, still 14/14 (this round, like prefabs,
  touches no C++ — it's entirely the browser editor's TypeScript authoring/runtime
  layer).
- Built the real Emscripten/WASM editor runtime (with `build/site/audio/` now
  present) and ran it through genuine WebGL via Playwright, with `AudioContext`
  monkey-patched before any app code runs (`page.addInitScript`, no test-only hooks
  added to the shipped app) to observe real `start`/`stop`/`suspend`/`resume` calls:
  attaching a looping `Sound` through the real inspector dropdown and hitting Play
  produced a real `start` call; Pause produced `suspend`; Play again (resuming)
  produced `resume`; Stop produced `stop`. Added as a permanent assertion sequence to
  `tests/browser/editor.cjs`.
- Post-review fixes (Codex, on PR #37), both real races in `startSounds()`: (1) an
  already-cached clip's synchronous playback path checked `doc.mode` before the Play
  handler had actually set it to `"play"`, so every already-decoded clip went silent
  from the second Play onward — `doc.mode` is now set before `startSounds()` runs,
  not after. (2) a clip still mid-decode when Stop, then Play again, happened before
  it resolved attached both Play sessions' callbacks to the one shared decode
  promise (`loadSoundBuffer`'s cache is keyed by clip id, not by session), so both
  fired and the second `activeSounds.set()` left Stop unable to reach the first,
  leaking a looping source until the page reloaded — a `playSession` counter, bumped
  on every fresh Play and captured per callback, now rejects a stale session's
  callback before it can start a source. Verified by temporarily reverting the fix
  and confirming a new regression test in `tests/browser/editor.cjs` genuinely fails
  against the old code (times out waiting for the second `start`), then passes clean
  once restored; the second race is reproduced deterministically via a test-only
  `decodeAudioData` gate the harness can hold open and release on cue, not by
  hoping real network/decode timing happens to line up.

## F31 — Real physics shapes: Collider spheres and raycasting (0.31.0)

Opens Tier 2 ("a real small engine") with the roadmap's own first item, sequenced
ahead of lighting/particles because raycasting is a dependency later gameplay
(aiming, AI line-of-sight) needs. Closes a second "authored but inert" gap in the same
class as `AIState`/`Vehicle` before their own rounds: the browser editor's inspector
has offered `Collider.type` ("AABB"/"Sphere") and a `radius` field for a while
(`PropertyMetadata.ts`), but `engine::physics::Collider` had no shape field at all —
every collider, however authored, resolved as an AABB derived from `Box.size`, and
`radius` was silently discarded before it ever left the browser.

`physics.hpp`/`physics.cpp` gain `ColliderShape { Box, Sphere }` and a `radius` field
on `Collider` (both default to the old behavior — `Collider{}` is unchanged, so every
existing box-shaped scene resolves identically to before). A falling or moving body now
resolves out of a sphere obstacle via closest-point-on-box-to-sphere-center, pushed
along the separation vector and zeroed on whichever velocity axis that push was
dominantly along — the same "zero one axis, report if pushed upward" contract the
existing box resolver already used, so `grounded` (resting on top of a sphere) works
the same way it does for a box platform. A new `raycast()` casts a ray against every
static `(Box, Collider)` entity (slab method for Box, the standard quadratic for
Sphere) plus the ground plane, returning the closest hit or `std::nullopt` — exposed
as a C++ API for future gameplay to call, deliberately not wired to a script/bridge
surface or to dynamic (`RigidBody`) movers this round; both are natural follow-ups,
not this one's.

`apps/editor/runtime/bridge.cpp`'s `editor_add` gains two trailing params,
`collider_shape` and `collider_radius` (validated whenever `is_collider` is set,
matching the existing box-size validation pattern), and actually constructs the
`Collider` the browser authored instead of always defaulting to Box — the only bridge
change this round needed, since the authoring surface already existed.
`apps/editor/src/editor/main.ts`'s `syncRuntime()` reads the resolved `Collider`
(through a prefab, like everything else it resolves) and passes its `type`/`radius`
through instead of discarding them.

### F31 verification

- Extended `tests/physics_tests.cpp`: a falling body lands and rests flush on top of a
  sphere collider (grounded, at the correct height); a moving body is pushed out and
  stopped by a sphere collider from the side; `raycast()` hits a box collider at the
  expected distance/point and ignores one past `max_distance`; hits a sphere collider
  too, picking the closer of two candidates in range rather than whichever was queried
  first; hits the ground plane when nothing else is in the way; normalizes a
  non-unit-length direction internally (distance/point stay in real world units); is a
  no-op for non-positive `max_distance`.
- Extended `tests/editor_bridge_tests.cpp`: a large-radius (1.5) sphere collider stops
  an approaching mover much farther from its own center than the existing unit-box
  obstacle case does, proving the authored radius is what's actually resolved against,
  not just accepted and ignored. All ~40 existing `editor_add` call sites updated to
  the new 19-parameter signature (appending `0, 0.5` — Box shape, an always-valid
  radius — preserves every existing test's behavior unchanged).
- Full native rebuild + `ctest`: all 14 cases pass. GCC 13.3.0 build with
  `-fsanitize=undefined`: clean, including the new closest-point/separation-vector and
  ray/AABB slab and ray/sphere quadratic math.
- `npm run typecheck` and `npm test` (33/33, unaffected — no TS component/serializer
  changes needed since `Collider.type`/`radius` already existed) both pass.
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/
  editor.cjs`: a Vehicle drove freely past a point in open ground, then a Sphere
  collider (radius 1.5) placed 3 units ahead stopped the same vehicle at almost exactly
  the analytically-predicted contact distance (`+1.0`, not the `+2.0` a same-radius box
  obstacle — or the old, shape-ignorant behavior — would have produced instead),
  confirmed through the existing `Player (x, y, z)` status-bar readout rather than
  reaching into the page's internals.

## F32 — Animation lighting fix, and Quaternius CC0 catalog additions (0.32.0)

User report: the bundled Aether-kit `animals/**`/`people/**` animations "look weird,"
unsure whether it's the joints or the animations themselves — alongside three
user-supplied Quaternius CC0 1.0 animation packs to investigate wiring up.

Diagnosis came first, deliberately, before touching any asset: a Playwright script
placed a Hero under a real `Player` component and drove it forward in Play mode,
dumping every bone's live `getWorldPosition()` mid-stride — every joint tracked its
parent correctly, no drift, no detached limb. A second, fully isolated render (same
`GLTFLoader` / `SkeletonUtils.clone` / `AnimationMixer` calls as `main.ts`, outside the
editor entirely, both with and without cloning, both a single `walk` clip and a full
idle→walk crossfade) reproduced nothing wrong either, across every clip on both a
person and a quadruped. What actually was visibly off — a cow's near-black
`belly_cow` material rendering as a blown-white/pure-black patchy mess — turned out to
be a real, independent bug: `main.ts` constructed its `THREE.WebGLRenderer` with no
`toneMapping`/`outputColorSpace` set at all, so the scene's `HemisphereLight(3)` +
`DirectionalLight(3)` (already fairly hot for `NoToneMapping`) clipped bright faces to
solid white and crushed dark ones to solid black on the kit's flat PBR materials —
most visible on already-dark materials, worst on a low-poly mesh with abrupt per-face
normals. Fixed by setting `renderer.toneMapping = THREE.ACESFilmicToneMapping` and
`renderer.outputColorSpace = THREE.SRGBColorSpace` right after construction — a pure
rendering fix, zero asset changes. The Aether kit's remaining look (chunky, ball-jointed
low-poly limbs) is that kit's own style, not a bug: two early screenshots that seemed to
show a "detached leg" or "giant balloon shoulder" turned out to be the same diagnostic
mistake this round started by catching in the animal case — the default "First entity"
box, or in the second case another catalog model, sharing the same `[0,0,0]` spawn
origin `catalog-add` always uses, rendered on top of and mistaken for the character.

Separately, the three supplied Quaternius packs (`animal_animations`, `Universal
Animation Library[Standard]`, `Universal Animation Library 2[Standard]`) are wired in as
*new* catalog entries, not a replacement for the Aether kit — nothing in it was actually
broken, so there was nothing to swap out:

- `assets/source/kit/people/mannequin_f.glb` (catalog id 132, "Mannequin F"): Quaternius's
  "Female Mannequin" mesh/skin, which ships with no animations of its own, combined with
  6 clips selected from `Universal Animation Library[Standard]`'s `UAL1_Standard.glb`
  (same 67-bone skeleton, verified node-name/order match) via a new one-off script,
  `tools/import_quaternius_mannequin.py`, renamed to this project's own convention:
  `idle`/`walk`/`run`/`sprint`/`talk`/`sit`.
- `assets/source/kit/animals/{wolf,husky,stag,alpaca}.glb` (catalog ids 133-136): four
  self-contained species converted from the `animal_animations` pack's `.gltf` (embedded
  base64 buffer, no external textures) to single-file `.glb` via another new one-off
  script, `tools/import_quaternius_animals.py`, with `Idle`/`Walk`/`Gallop` renamed to
  `idle`/`walk`/`run` (their other clips — `Attack`, `Death`, `Eating`, etc. — are kept
  under their original names; `pickClipName` only looks for the renamed three, plus
  `trot`/`sprint` which this pack doesn't have, and falls back gracefully when absent).

Neither import script is wired into `tools/build_editor.sh` — both were run once against
the user-supplied source archives, which (like the Aether/Kenney archives before them)
aren't part of this repo, so they're kept for provenance/reproducibility rather than as a
build step. See `assets/CREDITS.md` for pack hashes and the exact clip-rename mapping.

### F32 verification

- No C++/bridge changes this round (pure browser-editor rendering fix + new bundled
  catalog assets); native `ctest` suite untouched, still 14/14.
- `npm run typecheck` and `npm test` (33/33, including the existing `modelCatalog.test.ts`
  checks that every catalog id is unique and every catalog path resolves to a real file
  on disk — both pass against the 5 new entries with no changes needed) both pass.
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/editor.cjs`:
  places "Mannequin F" (people) and "Wolf" (animals) by label from the catalog dropdown
  and confirms both appear with no page error, alongside the whole existing suite (still
  zero accumulated `pageerror`s across the full run).
- Manually verified the diagnosis and the fix through the same real Playwright/Chromium
  harness, outside the permanent suite: bone-world-position dump during live `Player`
  movement (all joints correctly parented); isolated raw-`GLTFLoader` renders of `walk`/
  `run`/`sprint` clips sampled across their full duration, with and without
  `SkeletonUtils.clone`, with and without the idle→walk crossfade (no defects in any);
  before/after screenshots of the cow's tone-mapping fix; and idle/walk/run/sprint
  screenshots of both new "Mannequin F" and "Wolf" showing correctly connected, smoothly
  posed limbs throughout.

## F33 — AnimationState made real: per-model clip selection/preview (0.33.0)

User request, right after F32 shipped the new catalog entries: "id like to able to
select the animation movement from a list and apply it to any human or animal." Turned
out the data model for exactly this already existed — `AnimationStateComponent` (`clip`,
`time`, `looping`) has been fully wired through `Components.ts`, `SceneSerializer.ts`
(save/load validation), `Scene.ts` (component registry), `CommandInterpreter.ts` (a
`trigger_animation` console command, generic add/remove/reset via the inspector's "Add
component" dropdown), and covered by a `document.test.ts` unit test — since a much
earlier round. But nothing in `main.ts`'s `rebuild()` or its Play-mode ground-speed clip
switcher ever *read* it: the exact "authored but inert" bug class `AIState` (F27),
`Vehicle` (before F25), and `Collider` shape (F31) each had before their own rounds.

`clip` changes from `number` (an arbitrary, semantically-empty index — `document.test.ts`
literally tested `clip: 3` with no meaning behind the 3) to `string`, and this is a
genuine type change, not a compromise: unlike `Sound.clip`, which indexes one shared
`soundCatalog.ts` list, every animated catalog model has its own, differently-named clip
set (a Cow's `walk`/`trot`/`run`/`graze`, a Hero's `wave`/`sit`/`talk`), so a numeric
index can't mean the same thing across models the way it already does for sound. `""`
is the default and means "no authored override" — automatic ground-speed-based selection
(`animationClips.ts`'s `pickClipName`) behaves exactly as before.

The inspector can't express this with `PropertyMetadata.ts`'s existing static
`options: [...]` lookup (used for `AIState.state`, `Collider.type`, `Renderable.mesh`,
`Sound.clip`) — those are fixed at module load, but which clips exist depends on
*this* entity's own `Renderable.mesh`. `main.ts` special-cases `AnimationState.clip`
inline in its generic component-field renderer instead: a new `animationClipOptions(entity)`
resolves the entity's `Renderable.mesh` to a catalog entry, reads that model's own cached
`AnimationClip[]`, and returns `"(Automatic)"` plus each clip's own name — same
`<select>` rendering path every other enum field already uses, just fed dynamic options
instead of `PropertyMetadata`'s static ones. No animated model resolved yet (still
loading, or not an animated catalog entry) disables the dropdown down to just
`"(Automatic)"` rather than offering choices that can't apply.

Consumption is two small additions, not a new animation system: `rebuild()` (where an
animated entity's `AnimState` is built) checks for a resolved `AnimationState` whose
`clip` names one of that model's own actions; if so, that clip is what plays (with
`looping`/`time` applied via `setLoop`/`clampWhenFinished`/`action.time`) instead of the
automatic "resting" pick — live in Edit mode, not gated on Play, since `mixer.update()`
already runs every frame in both modes. Play mode's own per-tick ground-speed clip
switcher gets the same check and skips picking a `clipName` at all when overridden,
leaving `state.current` alone rather than fighting the authored choice every tick. Face
turning (the same block) is untouched either way — independent visual behavior, not a
clip decision.

### F33 verification

- No C++/bridge/native changes needed: the C++ side has always treated `AnimationState`
  as an opaque JSON blob (`scene_document.cpp`), so the `clip` type change is invisible
  to it — native `ctest` suite untouched, still 14/14.
- Updated `document.test.ts`'s existing `trigger_animation` case from the old
  meaningless `clip: 3` to `clip: "wave"`, asserting the resolved component's `clip`
  round-trips as that string. `npm run typecheck` and `npm test` (33/33) both pass.
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/editor.cjs`:
  attaches `AnimationState` to a live Wolf entity, asserts its clip dropdown is headed by
  `"(Automatic)"` and offers Wolf's own `Eating` clip but not Hero's `wave` (proving the
  options are genuinely per-model, not a fixed list), selects `Eating`, then — since
  `set_component` alone only triggers `rebuild()` (the 3D scene) and not a fresh
  inspector render — clicks away to a different entity and back to force `updatePanels()`
  to rebuild the panel from the document itself before reading the dropdown's value back,
  proving the string actually persisted rather than the click merely landing in the DOM;
  repeats the same round-trip clearing back to `"(Automatic)"`.
- Manually verified the live preview through the same Playwright/Chromium harness outside
  the permanent suite: screenshots of a Hero entity with `AnimationState.clip` set to
  `wave` and to `sit`, and a Wolf set to `Eating`, each showing the model actually posed
  in that clip in Edit mode (arms raised, seated posture, head lowered feeding) — not
  just idling regardless of selection — plus confirming each dropdown lists only that
  specific model's own clip names (Hero: `idle/walk/run/sprint/talk/sit/wave`; Wolf:
  `Attack/Death/Eating/run/Gallop_Jump/idle/Idle_2/.../walk`).

## F34 — Inspector cleanup: grouped components, inline animation clip picker (0.34.0)

Direct user feedback right after F33 shipped, looking at the "Add component" dropdown:
"the component section has gotten confusing and a few are redundant for human use i
think it can be simpler and human user friendly and some feature you say you connected
are not readily apparent." Both complaints are accurate. The dropdown was one flat list
of 16 raw type names (`RigidBody`, `AIState`, `AnimationState`) in roughly declaration
order, with no relationship between adjacent entries — `Velocity`/`Acceleration` (a
low-level physics primitive) sat at the same visual weight as `Player`/`Health` (a
high-level gameplay tag), and components that only make sense *together* (`AIState` +
`Pedestrian`, `Player` + `Vehicle`) were scattered rather than adjacent. And F33's own
new clip picker was reachable only by already knowing "AnimationState" is the thing to
add from that list — nothing hinted it existed.

`PropertyMetadata.ts` gains two small, additive exports: `componentGroups` (an ordered
list of `{label, types}`, now the single source of truth for which component types the
inspector ever offers — `main.ts`'s own hardcoded 16-item array is gone, replaced by
flattening this) and `componentLabel(type)` (a friendlier display name for the handful
that need one — "AI Behavior", "Physics Body", "Animation (advanced)" — falling back to
the type name itself for everything else). Groups, each keeping directly-linked
components together: **Transform** (`Transform`/`Rotation`/`Scale`), **Movement &
Physics** (`Velocity`/`Acceleration`/`RigidBody`/`Collider` — the movement-and-collision
chain), **Gameplay** (`Health`/`AIState`/`Pedestrian`/`Player`/`Vehicle`), **Appearance &
Animation** (`Renderable`/`AnimationState`), **Scripting & Audio** (`Script`/`Sound`).
`main.ts` renders these as real `<optgroup>`s, and the same `componentLabel()` now also
labels each attached component's own card header, so "ANIMATIONSTATE" reads "Animation
(advanced)" there too — the underlying component/command/save-file type name is
untouched everywhere, this is presentation only.

For discoverability: the `Renderable` card itself now grows an "Animation clip" picker
—the exact same per-model `animationClipOptions(entity)` F33 already built, just
relocated — directly under "Model", visible for any animated catalog entry with no
"Add component" detour needed. Picking a clip there reads the entity's current
`AnimationState` if one exists (preserving any `time`/`looping` already set) and calls
`set_component` with just `clip` changed; since `set_component` already upserts
(`writeComponent`'s `scene.add` is add-or-overwrite), this auto-attaches `AnimationState`
with no separate `attach_component` call needed, and the advanced "Animation (advanced)"
card — for anyone who wants `time`/`looping` — appears and agrees automatically on the
next render. Two UI surfaces, one underlying component, always in sync.

### F34 verification

- No C++/bridge/native changes; native `ctest` suite untouched, still 14/14.
- `npm run typecheck` and `npm test` (33/33) both pass, including the existing
  `transform.test.ts` `propertyMetadata()` checks (additive-only change, nothing existing
  altered).
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/editor.cjs`:
  dumps the "Add component" dropdown's `<optgroup>` structure and asserts `AIState`/
  `Pedestrian` share a group, `Player`/`Vehicle` share a group, and the whole movement
  chain (`Velocity`/`Acceleration`/`RigidBody`/`Collider`) shares a group; spot-checks the
  friendlier option text for `AIState`/`RigidBody`/`AnimationState` while confirming the
  option `value` each existing `selectOption(...)` call in this suite already relies on
  is untouched; then, on "Mannequin F" (added earlier in this same test, with no
  `AnimationState` attached), confirms its Renderable card's inline clip picker offers
  its own `sit` clip, selects it, forces a fresh render by reselecting entities, and
  confirms both the inline picker *and* the now-auto-attached advanced card agree on
  `"sit"` — proving the auto-attach path, not just that the click landed.

## F35 — Wiring up Vehicle.archetype and Pedestrian.archetype (0.35.0)

User question right after F34 shipped: "how is archetype used for this" — followed by
"wire it up to something real and coherent with its relevant counterpart" once the
honest answer turned out to be "it isn't." Both `Vehicle.archetype` and
`Pedestrian.archetype` have been authorable and saved (`SceneSerializer.ts`'s own
`unsigned(...)` validation) since early on, but `bridge.cpp`'s native `Heading`/
`Pedestrian` structs never carried the value at all — `struct Pedestrian final {};` was
literally empty — so it round-tripped through save/load with zero effect on simulation.
The exact "authored but inert" bug class `AIState`, `Vehicle` driving itself, and
`Collider` shape each had before their own rounds.

"Coherent with its relevant counterpart" is taken literally: `Vehicle.archetype`'s
counterpart is how the vehicle actually *drives* (the arcade model `editor.move` already
implements), so it now selects one of four real `VehicleTuning` rows —
Car/Sports/Truck/Bus, in that order, Car reproducing the original single-profile
`vehicle_accel`/`vehicle_drag`/`vehicle_max_forward`/`vehicle_max_reverse`/
`vehicle_turn_rate` constants exactly (so archetype 0, the default, drives identically to
before this round) and the other three deliberately distinct on every axis, not just
uniformly scaled: Sports faster and grippier on every number including drag, so it sheds
speed on throttle release about as fast as Car despite a much higher top speed; Truck and
Bus both trade accel/top speed/turning for *lower* drag (less engine braking, more coast)
-- heavier vehicles, slower to get going and slower to stop, Bus more so, since drag sets
coast-down time (`max_forward / drag` seconds to a stop from top speed) and a bigger
number there means less time coasting, not more. `Pedestrian.archetype`'s counterpart is `AIState`'s own wander
behavior (the thing `Pedestrian` already modifies — see F27's own doc comment on what it
changes), so it selects one of three `PedestrianTuning` rows — Casual/Brisk/Lingering —
scaling wander phase duration and movement speed, Casual (index 0, the default)
reproducing the original `ai_wander_min_phase`/`ai_wander_max_phase`/unscaled-speed
wander feel every `AIAgent` (Pedestrian or not) already used. Only a Pedestrian's own
wander is personalized this way — a hostile `AIAgent` with no `Pedestrian` at all always
gets Casual's tuning regardless, since wander pace isn't a "personality" a non-civilian
entity has. Fleeing stays at `ai_run_speed` unscaled by any archetype either way — a
self-preservation reflex, not a pace choice.

`Heading` and `Pedestrian` (bridge.cpp) each gain an `archetype` field (`VehicleArchetype`/
`PedestrianArchetype`, defaulting to index 0 — Car/Casual — so an entity that never sets
one behaves exactly as before this round). `editor_add` gains two trailing params,
`vehicle_archetype`/`pedestrian_archetype`, validated strictly (a safe, in-range integer)
whenever `is_vehicle`/`is_pedestrian` is set — these are real array indices once stored,
so an out-of-range one would be a same-tick out-of-bounds read the first time
`editor.move`/`editor.ai` ran, not a delayed or cosmetic failure, unlike a merely
"discarded" field before this round. `main.ts`'s `syncRuntime()` now actually reads
`Vehicle.archetype`/`Pedestrian.archetype` and passes them through instead of discarding
them. `SceneSerializer.ts` gains `boundedIndex()` (like `unsigned()`, but rejects a value
outside a fixed-size table's range at load time, with a clear error naming the field,
rather than deferring to `editor_add`'s own runtime bounds check). Both fields are real
`<select>` dropdowns in the inspector now (`PropertyMetadata.ts`'s new `indexedChoice()`
helper, alongside the existing string-valued `choice()`) instead of a bare number input.

### F35 verification

- Extended `tests/editor_bridge_tests.cpp`: Sports covers meaningfully more ground than
  Car under identical sustained throttle for the identical duration (more than the same
  case's own 1.2x margin), Truck less than Car; an out-of-range `vehicle_archetype` (4,
  one past Bus) is rejected outright. Casual/Brisk/Lingering pedestrians -- each the sole,
  first entity in its own session, so all three share the exact same rng seed, isolating
  the archetype as the only variable -- are compared by total path length (not net
  displacement, which a wandering entity can return close to zero regardless of pace)
  over an identical duration: Brisk covers more ground than Casual, Lingering less; an
  out-of-range `pedestrian_archetype` (3, one past Lingering) is rejected outright. All
  ~50 existing `editor_add` call sites updated to the new 21-parameter signature
  (appending `0, 0` — Car, Casual, both always-valid defaults — preserves every existing
  test's behavior unchanged, verified by the full existing suite still passing
  unmodified).
- Full native rebuild + `ctest` across both this project's CI configurations (GCC
  `-fsanitize=undefined`, and Clang with `-DENGINE_WARNINGS_AS_ERRORS=ON` matching CI's
  own `linux-clang` preset): all 14 cases pass clean on both, including the new
  archetype-comparison cases run multiple times each to confirm they're genuinely
  deterministic (same rng seed, same code, same result every run), not narrowly-passing
  or flaky.
- Added `document.test.ts`'s own case: a valid archetype round-trips through
  `set_component` for both `Vehicle` and `Pedestrian`, an out-of-range one is rejected
  (and, critically, does *not* partially apply -- the component's prior valid value is
  still there after the rejected write). `npm run typecheck` and `npm test` (34/34) both
  pass.
- Built the real Emscripten/WASM editor runtime and extended `tests/browser/editor.cjs`:
  reuses the same Player+Vehicle entity the existing Vehicle-driving case already
  exercises, confirms the archetype dropdown offers exactly `Car`/`Sports`/`Truck`/`Bus`,
  and drives it for an *exact tick-count* (not wall-clock -- a headless browser's frame
  pacing isn't reliably 1:1 with real time, discovered the hard way during manual
  verification: an earlier wall-clock-timed check of two separate vehicles showed almost
  no difference between archetypes, until switching to exact simulated-tick parity via
  the status bar's own tick counter revealed a second, compounding bug in that same
  manual check -- two simultaneous Player+Vehicle entities both respond to the same held
  key, and the status readout only ever tracks the first one it finds, so the second
  vehicle's own archetype was never actually being observed at all) under both Car and
  Sports, confirming Sports meaningfully outruns Car; resets the archetype back to Car
  afterward, since the very next case (Sphere-collider blocking) depends on Car's own
  specific physics constants for its calibrated stopping distance. Separately confirms
  the Pedestrian.archetype dropdown offers exactly `Casual`/`Brisk`/`Lingering` and that a
  choice survives a fresh inspector render (the wander-pace math itself is the native
  test's job above, not re-verified pixel-by-pixel here).
- Post-merge fix: a Codex review bot flagged that the PR's first-pushed `vehicle_tuning`
  had Truck (drag 4.0) and Bus (drag 5.0) *higher* than Car's (3.0), the coast-down math
  backwards from the documented intent -- in the subtractive coast model, higher drag
  means a *faster* stop, so the original values made Truck and Bus stop faster than Car,
  not slower. Verified independently (`max_forward / drag`: Car 3.0s, old Truck 1.75s, old
  Bus 1.1s) before fixing: Sports drag 2.0 -> 4.5, Truck 4.0 -> 2.0, Bus 5.0 -> 1.2 (new
  stop times Car 3.0s, Sports 2.89s, Truck 3.5s, Bus 4.58s -- correctly ordered). Added a
  new `tests/editor_bridge_tests.cpp` case exercising the path the bug hid in --
  coast-down after throttle release, not sustained-throttle acceleration, which the
  existing archetype cases never touched -- asserting Truck's and Bus's tick-count to a
  full stop each exceed Car's.

## F36 — Smooth-shaded people kit (0.36.0)

Request after trying the editor with F35's archetypes and 0.32.0's Mannequin F import:
make every `Npc *` catalog character (the Aether kit's own 12 outfit presets -- Casual
1/2, Dress, Elder, Hoodie, Office F/M, Sport, Teen, Uniform, Vendor, Worker) move as
smoothly as Mannequin F, keeping each one's own outfit identity rather than replacing
them with copies of Mannequin F.

Root-caused before changing anything: a Playwright bone-position dump (same technique
0.32.0's own investigation used) confirmed the rig, skinning weights, and gait curves
all track correctly, and the 24-30-sample-per-cycle procedural walk/run clips are dense
enough that Three.js's own quaternion-slerp interpolation between keyframes already
reads as smooth motion. The actual gap is geometry, not animation: the Aether kit's own
generator (`tools/gen/humanoid.mjs` in the user-supplied `aether-complete.zip`, the same
archive F19/F20 imported the pre-baked kit from) builds every limb, the torso, and the
neck as a tapered cylinder (`Geo.cyl()` in `mesh.mjs`) whose side wall is one flat quad
per segment with its own independent Newell normal -- a faceted pipe, not a rounded
limb, at any reasonable segment count. Mannequin F, by contrast, is a Quaternius
sculpted/smooth-skinned mesh by construction. Every major joint (shoulder, elbow, wrist,
hip, knee, ankle, neck) already gets a smooth `sphere()` cap bridging the seam, so
joint pinching was never the issue -- it's specifically the limb *surfaces* between
those caps.

Fix: `mesh.mjs`'s `Geo` gains `cylSmooth()` beside the original `cyl()` (kept --
buildings/vehicles/signs/nature/animals, and even this same file's own helmet-band/belt
trim, all keep calling `cyl()` unchanged, so their look is untouched). `cylSmooth()`
shares vertices around each ring and gives each one a per-vertex normal -- radial,
tilted by `(r0-r1)/h` so a tapering cone still shades correctly -- the same technique
`sphere()` already used. `humanoid.mjs`'s `limb()` (every arm/leg/torso/neck segment
routes through it) calls `cylSmooth()` instead of `cyl()`; nothing else changed --
same skeleton, same outfits/proportions/hair, same `clips()` animation curves, same
clip set (idle/walk/run). Verified visually before touching the repo: a standalone
Three.js/`GLTFLoader`/`SkeletonUtils` harness (outside the editor, same libraries)
rendered the old and new `npc-casual-1.glb` side by side mid-walk-stride -- the old
render shows visibly faceted arms/legs/torso, the new one reads as smooth rounded
limbs, both still clearly the same green-shirt/jeans "Casual 1" character.

Provenance: confirmed the vendored generator reproduces every one of the 13
`people/hero.glb`+`npc-*.glb` files byte-identical to what's already committed *before*
making the `cylSmooth()` change, so this is a verified, isolated modification, not a
drifted reimplementation. Vendored the minimal 8-file dependency closure
`humanoid()`/`clips()`/`skinnedGLB()` actually needs (`third_party/aether/gen/{glb,rng,
materials,buildings,vehicles,assemble,mesh,humanoid}.mjs`, MIT, same grant as the
existing `third_party/aether/LICENSE`) rather than the ~600-file full archive, each file
header-commented with exactly what it is and, for the two modified ones, exactly what
changed. `tools/regenerate_npc_kit.mjs` is the one-shot driver (`node
tools/regenerate_npc_kit.mjs`), using the identical character options
`tools/build-assets.mjs`'s own `people` section already used, so a future generator
change reproduces the same character options automatically instead of needing them
re-copied by hand. `assets/CREDITS.md` gets a new dedicated section (hashes for all 13
regenerated files) and the existing `source/kit/**` "unmodified" prefix row is narrowed
from 130 to 117 files to exclude them, cross-referencing the new section rather than
silently going stale.

### F36 verification

- Confirmed byte-identical regeneration against the already-committed files using the
  vendored generator unmodified, before making the `cylSmooth()` change -- proves the
  vendored slice and the exact character options are faithful to the original pipeline,
  isolating the diff to the one intended change.
- Standalone Three.js harness (real `GLTFLoader`/`SkeletonUtils.clone`/`AnimationMixer`,
  the same libraries and calls the editor itself uses, outside the editor) rendered old
  vs. new `npc-casual-1.glb` and `npc-office-f.glb` mid-walk-stride side by side and
  screenshotted the result: visibly smoother, rounded limbs on the new render, same
  outfit/colours/proportions/joints as the old one -- not a different character.
- `npm run typecheck` and `npm test` (34/34, unchanged -- this round touches no code
  path the existing suite exercises, only the `.glb` bytes at already-tested paths/ids)
  both pass.
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite unmodified end to end: passed, including
  its existing "animated catalog models" and "per-model AnimationState clip
  selection/preview" cases, which load and animate several of the regenerated `Npc *`
  files -- confirms the regenerated `.glb`s parse, skin, and animate correctly in the
  real browser runtime, not just in the standalone verification harness above.
- Not verified here: a full crowd-scene frame-rate comparison (smooth shading is
  effectively free on a GPU already rendering these low-poly meshes -- no additional
  draw calls, textures, or triangles, just shared vertices and different normals) --
  triangle count is unchanged (54,460 across all `people/**`, confirmed against the
  regeneration script's own `--only people` triangle-count log) and file sizes actually
  shrank slightly (vertices are shared instead of duplicated per quad), so a regression
  here would be surprising, but it wasn't separately profiled.
- Post-push fix: a Codex review bot flagged that `cylSmooth()`'s side-wall triangle
  winding disagreed with its own emitted normals. Verified independently two ways before
  fixing: a direct cross-product-vs-stored-normal comparison against the generated
  files' actual accessor data (a standalone script, not trusting the bot's claim on
  its word), and a hand recomputation of the exact triangle the bot cited, both
  confirming the winding really was backwards. Reversed it and regenerated. Then went
  a step further than the finding asked: rendered the *pre-existing, unmodified*
  `sphere()` primitive (every joint cap in this kit, shipped for many rounds) through
  the same direct measurement, and found it has the identical winding-vs-normal
  relationship -- yet a four-angle standalone Three.js render around a character (both
  before and after the `cylSmooth()` fix) showed no visible culling or inside-out
  lighting either way. So this specific mismatch doesn't appear to cause a real defect
  in this renderer -- but the fix is free and brings the geometry in line with the
  standard convention, so it was kept regardless of whether the visible symptom the
  finding predicted actually manifests here.

## F37 — People kit removal, clearing the way for an imported pack (0.37.0)

Request right after F36 shipped: remove `Hero` and every `Npc *` catalog entry (the
procedurally-generated Aether kit characters, ids 119-131) outright, to make way for
importing a user-supplied, skeleton-rigged character pack.

`modelCatalog.ts` drops those 13 entries; their `.glb` files
(`assets/source/kit/people/{hero,npc-*}.glb`) are deleted from the repo, not just
delisted. The `third_party/aether/gen/**` generator slice and
`tools/regenerate_npc_kit.mjs` driver F36 vendored specifically to rebuild these 13
files are removed too -- nothing else in the repo ever referenced either, so once the
files they regenerate are gone, they're dead weight, not a reusable tool worth
keeping around speculatively. Ids 119-131 are freed, not reassigned: a still-saved
scene referencing one now renders as the default box (`main.ts`'s existing
`loadCatalogModel()`/`loadOnce()` cache-miss path already handles an id with no
`modelCatalog` entry this way -- confirmed by reading that path, not assumed), not a
crash or a silent id collision with whatever's imported next.

`assets/CREDITS.md` is updated to match: the F36 "People kit regeneration" section
(no longer accurate -- those files don't exist anymore) is replaced with a short
removal note, the `source/kit/**` prefix entry's aside about hero/npc is reworded from
"regenerated, see that entry" to "regenerated then deleted, no longer in this repo,"
and the "27 rigged/animated `animals/**` and `people/**` entries" claim (accurate when
written) is corrected to "14 rigged/animated `animals/**` entries," since `people/**`
no longer has any Aether-kit entries of its own (Mannequin F, a separate Quaternius
import, is untouched).

The requested import itself -- a 734 MB file supplied as a Google Drive share link --
is not done in this round: `drive.google.com` is blocked by this sandbox's egress
proxy policy (a hard `403`, not a flake; the proxy's own guidance is to report a
blocked host, not retry or route around it), so the file couldn't be fetched here.
Reported to the user; the session's established pattern for a file this size is a
direct upload into the conversation (every prior asset import -- the Aether kit itself,
the Kenney audio packs, the three Quaternius packs -- arrived this way, never via URL
fetch), which the import + skeleton-wiring work in a follow-up round depends on.

### F37 verification

- `npm run typecheck` and `npm test` pass; `modelCatalog.test.ts`'s existing checks
  (unique ids, every path resolves to a real file, categories match) cover the removal
  correctly without modification -- they're computed from `modelCatalog`'s actual
  contents, not a hardcoded count, so 13 fewer entries and 13 fewer files just means
  13 fewer things checked, not a broken assumption.
- Grepped the whole editor source, its tests, and the browser black-box suite for any
  hardcoded dependency on ids 119-131 or the `Hero`/`Npc *` names before deleting
  anything: `document.test.ts`'s "Hero" is an arbitrary `spawn_entity` name string, not
  a reference to the catalog entry; `editor.cjs`'s "not Hero's clip set" is an assertion
  message explaining why `wave` shouldn't appear in Wolf's own clip list, not a spawn of
  the Hero model. Neither depends on the removed entries actually existing.
- Read (not assumed) `main.ts`'s `loadCatalogModel()`/`loadOnce()` fallback path to
  confirm a removed id degrades to the default box rather than throwing, before writing
  that claim in `assets/CREDITS.md`.
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite unmodified end to end: passed -- it never
  referenced `Hero` or any `Npc *` entry by name, so removing them changed nothing it
  exercises.
- Not done here: the actual character import and skeleton wiring the removal was
  requested to make way for -- blocked on getting the 734 MB file some way this
  sandbox's network policy allows.

## F38 — Mannequin F (Mixamo), a real rigged-and-animated import (0.38.0)

The follow-up F37 set up for: a real "rig a skeleton onto a character and have it
perform animations" import, landing this round.

The originally-supplied 734 MB Google Drive link (F37) resolved, once uploaded to a
GitHub release instead (`drive.google.com` stayed blocked throughout), to 263
animation-only Rokoko Motion Library FBX files -- no mesh, a different skeleton
convention (Autodesk HumanIK, `Character1_*` bone names, identity rest rotations)
than anything in this catalog. A first-pass retarget onto Mannequin F's own skeleton
(per-bone rest-pose quaternion correction, the standard technique) was built and
tested -- and produced a visibly broken, twisted/collapsed pose (screenshotted and
shown to the user before proceeding further), confirming the two rigs' local bone
axis conventions don't line up under a simple correction. Not pursued further: a
correct general retargeter needs real per-bone axis analysis (swing/twist
decomposition), a substantially larger undertaking with no guaranteed result without
an interactive tool to tune it. The Rokoko pack itself was scrapped rather than
shipped half-working.

Recommended Mixamo's free Auto-Rigger instead, which sidesteps retargeting entirely
by rigging *and* animating the same mesh in one pass rather than trying to reconcile
two independently-authored rigs. `mannequin_f.glb`'s own mesh was re-exported
mesh-only (no rig) as `mannequin_f.obj` via Three.js's `OBJExporter`, handed to the
user to run through Mixamo's Auto-Rigger and animation library (`mixamo.com` is
blocked here same as every other new domain this round hit), and the resulting three
animated FBX files (`Flying`, `Firing Rifle`, `Punching`) were supplied back as direct
uploads.

Landed as a new, separate catalog entry (id 137, `Mannequin F (Mixamo)`) rather than
merged into id 132 -- Mixamo's own skeleton (`mixamorig*`, 57 bones) shares no bind
pose or bone naming with Mannequin F's original Quaternius rig, so the two aren't
interchangeable. See `assets/CREDITS.md` for the merge/re-export details and the one
accepted quality loss (the original two-tone lavender/orange material didn't survive
the OBJ round trip -- Mixamo's pipeline received untextured, uncolored geometry and
fell back to flat grey; recolored to a single flat lavender rather than shipping grey).

### F38 verification

- Post-push fix: a Codex review flagged that the shipped `flying` clip's hips
  position track travels ~21 m forward over the clip -- since none of this
  character's three clip names match `pickClipName`'s tiers, `flying` (first by
  insertion order) is the one that plays automatically and loops, so a placed
  entity would visibly drift away and snap back every 2.63s, even at rest in Edit
  mode. Verified independently against the actual exported track data (not just the
  finding's own numbers) before fixing: confirmed a 21.1 m Z range on `flying`'s
  hips, and near-zero drift already on `firing_rifle`/`punching`. First fix attempt
  (subtracting a constant frame-0 offset) was wrong and didn't actually remove the
  drift, only shifted where it started from -- caught by re-checking the exported
  data after rebuilding, not assumed correct. Fixed properly by detrending each
  clip's hips track (subtracting a straight-line start-to-end interpolation, not a
  constant, from every frame) before export, re-verified the fix against the actual
  re-exported file (`flying`'s Z range is now sub-2cm, matching the other two
  clips), and re-rendered all three `flying` timepoints in the same standalone
  harness to confirm the pose itself was untouched by only editing the position
  track, not any rotation track.
- Verified all three uploaded FBX files share the *exact* same 57-bone skeleton (name-
  set comparison, not just eyeballing) before merging their clips onto one mesh --
  confirms this is a safe clip merge, not something that would silently misapply one
  clip's tracks to a differently-named bone in another.
- Rendered the merged result with a standalone Three.js/`GLTFLoader`/`SkeletonUtils`
  harness (same libraries and calls the editor itself uses, outside the editor),
  screenshotted mid-clip for `flying` and `firing_rifle`, and separately caught
  `flying` near its own start pose -- a fully recognizable, correctly-proportioned
  "Superman-style" horizontal flying pose, arms forward and legs trailing, confirming
  the skeleton, skinning, and animation all survived the FBX-parse-and-re-export
  round trip intact. No twisting, collapse, or disconnected limbs, unlike the
  abandoned Rokoko retarget attempt earlier this round.
- Confirmed `pickClipName`'s existing fallback (`return names[0]`, see
  `animationClips.ts`) handles a model with none of the tiered idle/walk/trot/run/
  sprint names present -- this character always falls through to its first clip under
  automatic ground-speed selection, which is documented, existing, harmless behavior
  (the same fallback Wolf's `Eating`-only-reachable-manually clips already exercise),
  not a new code path needing a change.
- `npm run typecheck` and `npm test` pass; `modelCatalog.test.ts`'s existing checks
  (id uniqueness, path-resolves-to-a-real-file, categories) cover the new entry
  correctly with no test changes needed, same as F37's removal.
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite unmodified end to end: passed.
- Not verified here: the exact Mixamo Auto-Rigger joint placement (the user did that
  step in Mixamo's own UI, outside this sandbox) -- taken on faith that Mixamo's own
  established rigging pipeline placed joints reasonably, same as every other
  externally-sourced rig this project has imported without re-deriving the rigger's
  own correctness from scratch.

## F39 — Lighting (Tier 2 roadmap item, 0.39.0)

A real, authorable `Light` component: any entity can now carry a Point, Spot, or
Directional light (color, intensity, and Point/Spot's own range and Spot's own cone
angle), spawned as an actual `THREE.PointLight`/`SpotLight`/`DirectionalLight` --
not just the scene's fixed hemisphere+sun ambience every entity has always shared,
which is untouched. A single-file bloom post-process (`UnrealBloomPass`, subtle and
always on, no per-scene toggle) rides along, matching this project's existing
preference for fixing the default look rather than exposing a render knob (F32's
tone-mapping fix is the same call).

First surprise going in: does a purely visual/presentational component need native
`bridge.cpp` changes at all? Checked `editor_add`'s own ABI (21 positional doubles)
before assuming so -- it carries only simulation-relevant state (position, physics
flags, Vehicle/Pedestrian archetype, Collider shape); `Renderable`, `AnimationState`,
`Script`, and `Sound` are *never* in it, confirming (not assumed) that presentational
components live only in the TS-side `EditorDocument`/`Scene` and are never touched by
the native bridge at all. `Light` follows exactly that precedent: zero `bridge.cpp` or
`editor_bridge_tests.cpp` changes this round, the smallest surface of any component
addition so far.

Registration follows the same six-point pattern every component needs (missed one on
the first typecheck pass -- `Scene.ts`'s own internal `components` map literal, a
seventh point this project's other component-addition rounds didn't call out
explicitly, so recorded here for the next one): `Components.ts` (the `LightComponent`
interface), `Scene.ts` (`SceneComponents`, the internal per-type `Map` literal,
`prefabableComponentNames` -- Light is prefab-shared like Renderable/Sound),
`SceneSerializer.ts` (`componentNames`, `normalizeComponent`'s validation case),
`CommandInterpreter.ts` (its own separate `componentNames` list, `defaultComponent`'s
case), and `PropertyMetadata.ts` (the `Light.type` dropdown, field labels, and the
"Appearance & Animation" group, alongside Renderable/AnimationState).

`main.ts`'s `rebuild()` gives each entity an always-visible `anchor` group carrying
its Transform/Rotation/Scale -- this, not the mesh/box object itself, is what's
pushed into the `objects`/`animStates` arrays (the parenting-reattachment loop,
raycast-picking, gizmo attach, and every runtime-driven position/rotation write in
`frame()` all index by that). The mesh/box object and the spawned light are both
*children* of `anchor`, siblings of each other rather than the light being a child
of the mesh -- see the F39 post-push fix note below for why that distinction
matters. Being a child of `anchor` means the light inherits the entity's own
position/rotation for free, and the existing box/mesh placeholder still marks the
entity and stays what gets selected, since a bare light has no geometry of its own
to click. Recreated fresh on every `rebuild()`, same as every mesh here -- nothing
caches or reuses a light, so there's nothing extra to dispose when one is removed or
edited. Color is a
plain `Vec3` (0-1 RGB, matching `THREE.Color`'s own component range) rather than a
hex string or 0-255 triplet, reusing the same generic Vec3 inspector rendering
`Transform.position` already has, so no new UI code was needed for a "color picker."
range/angle are Point/Spot-only and Spot-only respectively but validated and stored
unconditionally on every type -- the same "meaningless but harmless off-type field"
precedent `Collider.halfExtents`/`radius` already established, rather than threading
a type check through validation for one number.

### F39 verification

- Post-push fix: two Codex findings on the PR, both verified correct against
  three.js's actual source/behavior before fixing, not taken on faith. (1) Spot and
  Directional lights each construct their own separate `target` Object3D
  internally (confirmed via `SpotLight.js`'s own source) that isn't part of the
  scene graph by default and so never inherits an entity's transform -- with the
  light parented directly under the entity's mesh/box object as first shipped, the
  target stayed pinned at world origin forever, meaning rotating the entity could
  never actually aim a Spot/Directional light. (2) three.js's render traversal
  skips an invisible object's *entire* subtree, lights included, when gathering
  active lights each frame -- with the light childed under the mesh/box object as
  first shipped, toggling `Renderable.visible` off also silently killed the light,
  coupling two components that should be independent (no way to author a hidden
  emitter with a still-active light). Fixed both by restructuring `rebuild()`
  around the always-visible `anchor` group described above: the light is now a
  sibling of the mesh, not its child, so `Renderable.visible` no longer reaches it;
  and Spot/Directional lights get their own `target` parented as a child of the
  light itself (offset along local -Z), so the target's world position now follows
  the light's own world rotation instead of staying fixed at the origin. Verified
  with a standalone script against the real vendored three.js (not a
  reimplementation): confirmed the light has no invisible ancestor after hiding the
  mesh, and confirmed a Spot light's aim direction actually rotates (90 degrees
  around Y measurably moved the beam from -Z to -X) purely from rotating the
  entity's anchor. Re-ran `npm run typecheck`, `npm test` (35/35), a fresh
  Emscripten/WASM build, and the full `tests/browser/editor.cjs` black-box suite
  after the fix -- all pass.
- `npm run typecheck` and `npm test` (36/36, up from 34) pass. New test: `Light`
  attaches with sensible defaults, edits round-trip through save/load, `color`'s
  0-1 bound and `angle`'s (0, PI/2] bound are each rejected with a clear message
  naming the field (not a generic failure), an invalid `type` string is rejected,
  and `Light` is confirmed prefab-shared (editing one instance's color updates
  every instance live), the same coverage shape `Sound`'s own test already
  established for a comparable component.
- Verified the light itself actually illuminates, not just that the authoring
  round-trips: a standalone, ambience-free Three.js scene (a lone box, zero
  hemisphere/sun lights) went from fully invisible with no `PointLight` present, to
  a dim warm-tinted glow at this round's own default intensity (2), to a bright
  near-saturated surface at intensity 60 -- confirms `createLight()`'s exact
  parameters produce real, scaling illumination, isolated from any inspector-DOM
  interaction uncertainty. A first attempt to verify this by reading the real
  editor's live WebGL canvas pixels via `drawImage`/`getImageData` came back all
  zeros -- `WebGLRenderer`'s default `preserveDrawingBuffer: false` clears the
  drawing buffer before an out-of-frame `page.evaluate` can read it, a known
  gotcha, not a rendering bug -- caught by cross-checking against the isolated
  scene above rather than trusting the zero reading.
- In the full editor (existing `HemisphereLight(3)`/`DirectionalLight(3)` already
  providing strong, neutral ambient light), an added colored point light visibly
  warms/tints nearby surfaces rather than transforming them -- correct, expected
  *additive* behavior for a fill/accent light in an already-lit scene, not a
  weaker or broken effect; the isolated ambience-free test above is what actually
  isolates and confirms the light's own contribution.
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite, extended with a new case: `Light`
  appears in the "Appearance & Animation" Add-component group, its `type` dropdown
  offers exactly Point/Spot/Directional with the documented default, and an edited
  type/color/angle survives a fresh inspector render (the same reselect-and-back
  technique every other persistence assertion in this suite already uses) --
  passed end to end.
- Not done here: a per-scene bloom toggle or intensity control -- deliberately
  out of scope, matching the "fix the default, don't add a knob" call above; a
  shadow-casting option for any light type -- shadow maps are a meaningfully
  bigger addition (shadow camera frustum sizing per light type, performance cost
  for every point/spot light in a scene) better scoped as a follow-up than folded
  into this round unasked.

## F40 — Particles (Tier 2 roadmap item, 0.40.0)

A real, authorable `Particles` component: any entity can now carry a lightweight
point-particle emitter (Sparkle, Smoke, Fire, or Confetti; color, emission rate,
per-particle lifetime, initial speed, and point size), spawned as an actual
`THREE.Points` system -- not a native/bridge feature, matching F39's own
precedent that a purely presentational component lives entirely on the TS side
(`Renderable`/`AnimationState`/`Script`/`Sound`/`Light` already established this;
`Particles` needed zero `bridge.cpp` changes for the same reason).

Registration followed the same by-now-familiar points: `Components.ts` (the
`ParticlesComponent` interface, alongside a `ParticlePreset` union type),
`Scene.ts` (`SceneComponents`, its internal per-type `Map` literal --
double-checked this round specifically since F39 was the one that first missed
it, `prefabableComponentNames` -- `Particles` is prefab-shared like Renderable/
Sound/Light), `SceneSerializer.ts` (`componentNames`, `normalizeComponent`'s
validation case, plus a new `positiveNumber` helper for `lifetime`/`size`, which
-- unlike `nonNegativeNumber` -- reject 0: a zero lifetime or size both size the
point buffer to nothing and render nothing, so they're not a meaningful "off"
state the way Light's 0-range/0-rate are), `CommandInterpreter.ts` (its own
separate `componentNames` list, `defaultComponent`'s case), and
`PropertyMetadata.ts` (the `preset` dropdown, field labels, and the "Appearance &
Animation" group, alongside Renderable/AnimationState/Light).

`main.ts`'s `rebuild()` adds the spawned `THREE.Points` system as another child
of the entity's `anchor` group -- the same always-visible wrapper F39's post-push
fix introduced for exactly this reason, so a Particles emitter's own visibility
is independent of `Renderable.visible` from day one, not something this round had
to separately discover and fix. Simulated every frame in both Edit and Play mode
(`stepParticles()`, called from `frame()` right next to `animStates`' own
per-frame `mixer.update(dt)`) -- as "always on" as a Light, not gated to a
Play-only lifecycle like Script/Sound.

Design notes on the simulation itself:
- Each emitter owns a fixed-capacity pool (`Float32Array` position/color/velocity
  buffers, sized from `rate * lifetime * 1.5` -- how many particles are alive at
  once in steady state, with a safety margin -- capped at a hard `MAX_PARTICLES`
  of 400 regardless of authored values) rather than growing/shrinking a buffer
  every frame. A spawn with no free slot is silently dropped, not queued or
  forced, so a saturated pool caps visually at `capacity` rather than exceeding
  it or crashing.
- `preset` picks a small fixed table (`PARTICLE_PRESETS`) of emission direction,
  spread (how much a spawn's initial velocity is randomized away from that
  direction), and a constant Y "gravity" acceleration -- Confetti's is negative
  (falls), Smoke/Fire's is a small positive value standing in for buoyancy (not
  real buoyancy physics), Sparkle's is zero (omnidirectional, no drift). The same
  "type picks the behavior, the rest are generic authored knobs" split
  `Light.type` already established.
- Particles render additively (`THREE.AdditiveBlending`, `depthWrite: false`) and
  fade by darkening their own vertex color toward black as they age, rather than
  a separate per-vertex alpha channel or a custom shader -- a fully-aged (black)
  particle contributes nothing once additively blended, the same "cheapest stock-
  API technique that still reads correctly" call bloom (`UnrealBloomPass`, F39)
  and Light (no custom shader for `.target` either) already made this project's
  norm. A deliberate simplification: this means every preset glows rather than
  Smoke specifically reading as opaque/alpha-blended smoke -- acceptable for this
  round's scope, not revisited without being asked.
- Particle position/velocity live in the entity's own local space (the `Points`
  system is parented under `anchor`, same as a Light), so particles inherit the
  entity's position/rotation for free and a Fire/Smoke emitter's "up" rotates
  with the entity, same as everything else under `anchor`.

### F40 verification

- Post-push fix: three Codex findings on the PR, all verified correct before
  fixing. (1) `stepParticles()` originally spawned new particles *then* aged
  every alive particle in the same call, including the ones just spawned --
  any authored `lifetime` at or below one frame's `dt` (e.g. 0.01s at 60Hz)
  died and blackened before ever being drawn, despite passing
  `positiveNumber` validation as a legitimate value. Fixed by reordering to
  age-then-spawn (a particle spawned this call isn't touched again until the
  next, guaranteeing at least one rendered frame) and explicitly setting a
  new spawn's color to full brightness at spawn time (it no longer passes
  through the same call's aging loop to get that value). (2) Particle
  positions start at the local origin and only move via direct buffer writes
  (`needsUpdate = true`), which uploads new data but never invalidates
  three.js's cached bounding sphere -- the first automatic frustum check
  would compute and permanently cache a near-zero sphere, so a system whose
  particles later spread beyond it could be wrongly culled whenever the
  entity's own origin left the frustum. Fixed by setting
  `points.frustumCulled = false`, the standard fix for a dynamically-moving
  point cloud like this rather than recomputing bounds every frame. (3) Every
  successful editor command calls `rebuild()` (confirmed by reading
  `execute()` itself, not taken on faith) -- routine property edits, undo/
  redo, renames -- and `createParticles()` allocates a fresh
  `BufferGeometry`/`PointsMaterial` per entity per call, unlike a mesh (which
  reuses `catalogCache`'s shared geometry/material, so nothing new is
  allocated there). Without disposing, any scene with a Particles-carrying
  entity leaked a full set of GPU buffers on essentially every editor
  interaction. Fixed by disposing each emitter's geometry and material in
  `rebuild()` before clearing `particleStates`. Verified (1) with a
  standalone script against real three.js: a particle with `lifetime: 0.01`
  and `rate: 1` (isolated from a same-slot immediate respawn, which an
  earlier, faster-rate version of the same check had conflated with "didn't
  die correctly") renders at full color the frame it spawns and only dies on
  the following frame, never within its own spawn frame. (2)/(3) are
  structural fixes (a flag set once, and freeing what's already allocated)
  verified by code inspection and the full test suite below rather than a
  dedicated numeric check. Re-ran `npm run typecheck`, `npm test` (36/36), a
  fresh Emscripten/WASM build, and the full `tests/browser/editor.cjs`
  black-box suite after the fixes -- all pass.
- Verified the simulation's actual numeric behavior against real three.js math in
  a standalone script (not a reimplementation -- the exact same
  `createParticles`/`stepParticles` logic, copied out of the closure it lives in
  since `main.ts` doesn't export it): steady-state alive count for a Sparkle
  emitter converges on `rate * lifetime` as expected; a spawned particle's color
  starts near-full, fades to roughly half partway through its lifetime, and
  reaches exactly black (and is reclaimed, `alive[i] = 0`) at expiry, not before
  or after; a zero-initial-speed Confetti particle visibly falls (negative Y)
  and a zero-initial-speed Fire particle visibly rises (positive Y) purely from
  each preset's own gravity constant; and an intentionally absurd rate (5000)
  still caps the pool at exactly `MAX_PARTICLES` (400) with the alive count never
  exceeding it. A first pass at this check used a single large timestep and
  wrongly concluded the fade logic was broken -- caught by re-deriving by hand
  that a rate-1 emitter needs a full accumulated second before its first spawn
  fires at all, not a bug in `stepParticles()` itself; corrected the test to step
  at the same ~60Hz cadence `frame()` actually uses, which then matched the
  expected fade curve exactly.
- `npm run typecheck` and `npm test` (36/36, up from 35) pass. New test:
  `Particles` attaches with sensible defaults, edits round-trip through
  save/load, `color`'s 0-1 bound and `lifetime`/`size`'s must-be-positive bound
  and `rate`'s must-be-non-negative bound are each rejected with a clear message
  naming the field, an invalid `preset` string is rejected, and `Particles` is
  confirmed prefab-shared (editing one instance's rate updates every instance
  live) -- the same coverage shape `Light`'s own test established.
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite, extended with a new case:
  `Particles` appears in the "Appearance & Animation" Add-component group, its
  `preset` dropdown offers exactly Sparkle/Smoke/Fire/Confetti with the
  documented default, and edited preset/rate/lifetime values survive a fresh
  inspector render (the same reselect-and-back technique every other
  persistence assertion in this suite already uses) -- passed end to end.
- Not done here: per-particle size animation (shrink-to-zero as it ages,
  alongside the color fade) -- would need a custom `ShaderMaterial` for
  per-vertex point size, a meaningfully bigger addition than this round's scope;
  a burst/one-shot emission mode (spawn N particles once, not a continuous
  rate) -- `rate: 0` already gives "off," and a genuine one-shot needs either a
  Play-mode-triggered event (this project doesn't yet expose combat/collision
  tick timing to the TS side outside AIState) or an authoring-time "trigger now"
  action neither exists for any other component; collision/gravity against
  Colliders -- particles are purely decorative, matching this round's own
  "lightweight, non-collidable" scope, not a native/bridge feature.

## F41 — Asset import, a reusable CLI (Tier 2 roadmap item, 0.41.0)

Every model import into this project before this round -- the 131-entry Aether
kit, the Quaternius animals/mannequin packs, F37/F38's Mixamo import -- hand-rolled
its own one-off script to do the same mechanical steps: load the file, sanity-check
it, copy it into `assets/source/kit/`, and hand-edit `modelCatalog.ts`
(`tools/import_quaternius_*.py`; the Mixamo round's own build script was never even
committed, a scratch file). `tools/import_model.mjs` is that common case done once,
reusable: point it at a local self-contained `.glb` or `.fbx`, give it a category
and display name, and it validates the file, copies/re-exports it into place,
inserts a new `modelCatalog.ts` entry (auto-detecting `animated` from whether the
file actually has `AnimationClip`s, rather than trusting a hand-typed flag), and
prints a `assets/CREDITS.md` draft with the mechanical facts (hash, path, computed
native size) already filled in.

Two things it deliberately does *not* do, both flagged in its own header comment
rather than silently out of scope:
- Combining multiple source files onto one mesh/skeleton -- the Mixamo three-clip
  merge, the Quaternius mesh-plus-shared-animation-library merge
  `tools/import_quaternius_mannequin.py` did -- stays a bespoke, one-off script.
  That kind of merge needs source-specific judgment (which bones actually match by
  name/order, whether root motion needs stripping) a generic tool can't safely
  guess at; F38's own abandoned Rokoko retarget attempt is the cautionary example
  of what guessing at bone correspondence produces.
- Writing `assets/CREDITS.md` itself. A provenance/license claim needs a human (or
  an agent acting on the user's behalf) to actually read and vouch for the source,
  not a script asserting it -- the tool prints a draft with only the facts it can
  verify mechanically (a computed hash, the detected `animated` flag, the resolved
  path) and leaves the actual source/license sentence as a blank to fill in.

Implementation notes:
- Reuses exactly the loader/exporter pattern this session's own ad hoc Mixamo
  import script used (`FBXLoader.parse` on a Node `ArrayBuffer`, `GLTFLoader.parse`
  for `.glb`, `GLTFExporter` with a minimal `FileReader` polyfill for FBX's binary
  re-export path -- Node has no native `FileReader`), now committed and reusable
  instead of rewritten from scratch per import.
- A `.glb` input is copied byte-for-byte to its destination, not re-encoded through
  the exporter -- preserves an exact-copy, hash-verifiable provenance claim
  wherever the source is already self-contained, matching every existing
  exact-copy row in `assets/CREDITS.md`. Only `.fbx` (which the catalog never
  loads directly) goes through `GLTFExporter`.
- A loose `.gltf` (separate `.bin`/texture files, not a single binary blob) is
  explicitly rejected with a clear message rather than silently mishandled --
  every asset this project has ever imported has been a self-contained `.glb` or
  `.fbx`, so resolving a `.gltf`'s external references was left out rather than
  built and left untested.
- New `modelCatalog.ts` entries are inserted right after the *last* existing entry
  sharing the same category, not resorted into alphabetical position -- the file's
  own category blocks already aren't fully contiguous (e.g. `people` ids 132 and
  137 are separated by `animals` entries added in between), so matching that
  established, simpler convention was preferred over reordering the file.
- Ids are never reused, `--id` defaults to one past the current highest id, and
  `--dry-run` performs every step (load, validate, hash, compute the catalog diff)
  without writing `assets/source/**` or `modelCatalog.ts`, so a real run can be
  previewed first.

### F41 verification

- Post-push fix: three Codex findings on the PR, all reproduced against real
  conditions before fixing, not taken on faith. (1) Any model referencing an
  image texture failed deep inside three.js's loaders with a confusing
  `ReferenceError: self is not defined` (`document`/`Image`/`createImageBitmap`
  don't exist in plain Node, and this tool only polyfills `FileReader`) --
  reproduced by hand-constructing a minimal textured `.glb` (a 1x1 PNG as a
  glTF data-URI image) and running it through the actual tool, which confirmed
  the exact crash. Checked first whether this was even reachable: every asset
  in this catalog today is genuinely textureless (checked each bundled `.glb`'s
  own glTF JSON chunk for a non-empty `images` array -- none), so real Node
  image decoding was deliberately not added (a new dependency for a case
  nothing here has ever needed); instead a textured `.glb` is now detected
  up front by peeking its JSON chunk before running the full loader, and any
  other browser-only-global failure (covers `.fbx`, which has no equivalent
  cheap peek) is caught and re-raised as the same clear message. (2) An
  explicit `--id` in the 119-131 gap (ids retired in F37, below the current
  active maximum so the auto-picked default was never at risk) was silently
  accepted, since `existingIds()` only scans currently-declared entries --
  reproduced with `--id 125`. Fixed structurally rather than by parsing prose:
  added `modelCatalog.ts`'s own `retiredCatalogIds` export (a code-level record
  of the same invariant the file's existing comment already states in prose),
  which the tool now also checks. (3) `--category "../../etc"` (or similar)
  would have `path.join` normalize straight through the intended
  `assets/source/kit/` directory, and `tools/build_editor.sh` only ever copies
  that one directory into the deployed site, so a milder escape would silently
  404 at runtime rather than fail loudly at import time -- fixed by validating
  `--category` is a single lowercase, path-safe segment (matching every
  existing category name) before it's ever used in a path. Re-ran every check
  from the first verification pass below plus the three new ones (a
  hand-crafted textured `.glb`, `--id 125`, and two traversal-shaped
  `--category` values) -- all now rejected with a clear, specific error; the
  previously-passing paths (byte-identical `.glb` copy, `.fbx` re-export and
  reload, all four original rejection cases) still pass unchanged. `modelCatalog.ts`
  changed this round (the new `retiredCatalogIds` export), so `npm run
  typecheck`/`npm test` were re-run for real reasons this time (36/36 pass),
  not just as a formality.
- Otherwise a standalone CLI tool under `tools/`, same category as the
  pre-existing `tools/import_quaternius_*.py`/`tools/cook_static_mesh.py` --
  the real Emscripten/WASM build and `tests/browser/editor.cjs` black-box
  suite weren't run this round, zero coverage benefit for the browser-facing
  surface neither this round nor its post-push fix touch (the one
  `apps/editor` change, `retiredCatalogIds`, is covered by `npm test` above).
- Exercised every path against real files, not just read for plausibility:
  imported an existing bundled asset (`kit/nature/rock-small.glb`) as a throwaway
  test entry, first with `--dry-run` (confirmed the printed hash matches an
  independent `sha256sum` of the same file exactly) then for real, and confirmed
  by `diff` that the written copy is byte-identical to the source and by `git
  diff` that the new `modelCatalog.ts` line landed exactly where intended (end of
  the `nature` block, before `roads` begins). Reverted both (removed the test
  file, `git checkout --` the catalog) before committing the tool itself.
- Exercised the `.fbx` path the same way with one of F38's own source files
  (`Punching.fbx`): confirmed `animated` correctly auto-detects true from its one
  `AnimationClip`, and — since a `.fbx` re-export is exactly the kind of step that
  can silently corrupt a rig — reloaded the *written* `.glb` back through a fresh
  `GLTFLoader` in a separate check and confirmed it still parses, still carries
  its one animation clip, and its `SkinnedMesh` still has all 46 bones, rather
  than trusting that "the exporter didn't throw" meant the output was correct.
- Exercised every rejection path against real conditions, not just read for
  plausibility: a duplicate `--id`, a destination file that already exists
  (without `--force`), a nonexistent input path, and an unsupported extension
  (`.md`) each produced the intended clear, specific error and a non-zero exit
  code.
- Not done here: wiring this tool into `tools/build_editor.sh` or CI -- it's a
  manually-run authoring step (a human decides what to import and supplies the
  category/name), the same category as every pre-existing `tools/*.py` script,
  none of which are build-step-wired either.

## F42 — Export/packaging, a standalone player build (Tier 2 roadmap item, 0.42.0)

Lands the "Export/packaging" roadmap item, scoped deliberately: this project's
real visual gameplay (models, lighting, particles, sound) exists only in the
browser build -- `apps/native_playground` renders scenes as flat colored boxes
plus one hardcoded debug mesh (`engine::BoxView`), a simulation-correctness
proof, not a real visual renderer -- so a native standalone executable with
real graphics would mean writing a native glTF loader and 3D renderer from
scratch, well outside one round's reasonable scope. Asked the user to confirm
before committing to either direction; the answer was a standalone *web*
player build, reusing the browser rendering/simulation pipeline this project
has already built and verified across F30-F41 rather than building a new one.

`tools/export_build.mjs <scene.json>` packages one authored scene into a
shareable, self-contained folder: a copy of the already-built editor
(`build/site/`, from `npm run build`/`tools/build_editor.sh`) with the scene
baked in and started automatically, every editor-only affordance hidden.
Critically, this is *not* a separate player codebase to keep in sync with the
editor -- it's the exact same `main.ts`/`style.css`/`runtime.js` build, with:

- A new `.player-mode` CSS class (`style.css`) that hides the title bar,
  New/Save/Open/Undo/Redo/transport toolbar, hierarchy/inspector panels, the
  Project/Console dock, the viewport's own Move/Rotate/Scale/Snap/Grid
  toolbar, and the mode status bar -- pure CSS, not a different DOM tree, so
  every element `main.ts` already builds and wires (`el()` lookups, event
  listeners) keeps working exactly as before, just invisible. Only the
  full-bleed 3D viewport remains.
- `main.ts`'s existing scene-bootstrap block (previously: load from
  localStorage, or spawn a default "First entity") gains a third source: a
  scene baked into the page as `<script type="application/json"
  id="exported-scene">`. Its presence, not a URL flag or build-time branch,
  is what turns a given build into a player -- checked once at startup, not
  threaded through the rest of the file.
- Play is started programmatically (`el("play").click()`) right after that
  bootstrap instead of waiting for a click, so the exported page is already
  playing the moment it's visually ready.

`export_build.mjs` itself: validates the scene JSON parses, copies
`build/site/` into `build/export/<name>/` (or `--out`), rewrites the copy's
`index.html` script/stylesheet references from vite's own absolute
`/engine/assets/...` (correct for where *this project's* editor is deployed,
meaningless for a folder meant to be hosted anywhere or shared standalone) to
relative `./assets/...`, sets `<title>` from `--name` or the input filename,
and injects the scene JSON verbatim before `</body>`. Every bundled kit/audio
asset is copied wholesale rather than trimmed to what the scene actually
references -- simpler and safer than cross-referencing `Renderable.mesh`/
`Sound.clip` ids against the catalogs, at the cost of a larger export than a
single small scene strictly needs.

### A real bug this round found and fixed, not just exercised

Testing the exported player against `examples/demo-game.json` in a real
Playwright browser (not just reading the code for plausibility) surfaced a
genuine pre-existing race, not something the export machinery introduced:
`rebuild()`'s catalog-model-finished-loading callback only calls `rebuild()`
again if `doc.mode === "edit"` -- mid-Play, rebuilding would reset every
entity's simulated position/animation state back to its authored spawn
transform, not just swap in the one placeholder mesh that finished loading,
so that guard is correct, not a bug itself. But a player build starts Play
*immediately*, before any catalog `.glb` fetch has had time to resolve --
making the exact race that guard was never meant to handle the *normal*
case, not a rare one: every catalog-modeled entity rendered as its box
placeholder forever, permanently stuck, confirmed by screenshot (a demo
scene's car and mannequin both showing as plain boxes indefinitely, well
after their `.glb` fetches had actually completed over the network).

Fixed by preloading: the exported-scene bootstrap now collects every
`Renderable.mesh` id the loaded scene references and `await`s
`loadCatalogModel()` for each (already memoized/dedup'd by mesh id, reused
as-is) *before* the first `rebuild()`/auto-Play, so every model is already
cached by the time Play starts and needs no mid-Play swap at all. Re-verified
against the same real Playwright check: the car and mannequin both now
render as their actual models (the mannequin mid-animation, not a T-pose)
within ~1.5s of load, no console errors.

### F42 verification

- Post-push fix: five Codex findings on the PR (two P1, three P2), all
  verified against real conditions before fixing, not taken on faith.
  - P1: the synthetic `el("play").click()` that starts a player build isn't a
    real user gesture, so `startSounds()`'s `AudioContext` would stay
    suspended -- silent -- forever in a real browser, with no visible button
    left to click to fix it. My own first Playwright check of this
    (misleadingly) showed the context running regardless -- traced to
    Playwright-controlled pages reading `navigator.userActivation.hasBeenActive`
    as `true` before *any* interaction at all, an automation-environment quirk
    that doesn't reflect a real user's browser and would have hidden this bug
    from any test relying on it. Confirmed the real mechanism instead by
    force-suspending the context and checking the fix resumes it: fixed by
    resuming on the page's first genuine `pointerdown`/`keydown` (a real,
    trusted Playwright `page.mouse` event, not `element.click()`), which then
    correctly flips a force-suspended context back to `running` and never
    fires a second time.
  - P1: `--out . --force` or `--out build/site --force` would recursively
    delete the repository checkout or the very build source being copied
    from, since `--out` was accepted and `rmSync`'d without checking what it
    resolved to. Fixed with a `destroys()` check rejecting an `--out` that
    is, or contains, the repo root or `build/site`; verified against exactly
    those two cases plus `--out build` (an ancestor of `build/site`), all
    three now refused with a clear error and `build/site` left untouched,
    while the normal default (`build/export/<name>`) still works.
  - P2: the exported `<title>` was interpolated via `String.replace`'s
    string form (where a literal `$` in `--name` is interpreted specially)
    and never HTML-escaped (so `--name` containing `</title>` could inject
    markup). Fixed with an HTML-escape helper and a replacer *function*
    (immune to `$`-pattern interpretation); verified with a deliberately
    hostile `--name` (`</title><script>...`, plus a literal `$&`) producing
    a single, correctly-escaped, inert `<title>` tag.
  - P2: only `</script` was escaped in the embedded scene JSON, not every
    `<` -- HTML's script-data tokenizer has its own escaped/double-escaped
    states triggered by `<!--` followed by `<script`, which a free-text
    field a scene author fully controls (`Script.source`, an entity name)
    could contain, desyncing the parser so the real closing `</script>`
    below gets read as text instead of ending the tag. Reproduced exactly
    that pattern in a real scene and confirmed (before the fix, by
    inspecting the embedded tag's parsed `textContent`) it broke; fixed by
    escaping every `<` as `<`, verified the same reproduction scene
    now loads correctly in a real browser (1 entity, Play mode reached, no
    parse failure).
  - P2: the editor's own `@media (max-width: 900px) { #app { min-width:
    700px } }` rule (sized for the editor's panel-heavy layout) still
    applied under `.player-mode`, clipping/scrolling a full-bleed player on
    any phone narrower than 700px. Fixed with `#app.player-mode { min-width:
    0 }` (its higher specificity wins over the media query's plain `#app`
    regardless of source order); verified at a real 375px viewport --
    `#app` now measures the full 375px with zero horizontal overflow, vs.
    clipped/scrolled before the fix.
  Re-ran the full existing `tests/browser/editor.cjs` black-box suite and
  `npm run typecheck`/`npm test` (36/36) after all five fixes -- still pass,
  zero regression to the ordinary editor.
- Built the real editor (`tools/build_editor.sh`) and exported
  `examples/demo-game.json` (an 11-entity scene: a drivable vehicle, AI-driven
  pedestrians/drones, colliders, catalog buildings) with the actual CLI, not
  a synthetic fixture.
- Verified the exported `index.html` directly: asset references rewritten to
  `./assets/...` (confirmed nothing else in the built JS bundle references
  the old `/engine/` base path, so nothing else needed rewriting), `<title>`
  set, the scene embedded as literal, byte-for-byte JSON text.
- Served the export over a real local HTTP server (fetch() is blocked from
  `file://` origins, so this isn't optional for a meaningful check) and drove
  it with real Playwright, not just reading the code: confirmed
  `#app` carries `.player-mode`, `header`/`nav`/`.dock`/`footer`/
  `.viewport-toolbar` all compute `display: none`, the status bar reaches
  `data-mode="play"` on its own with no click, and (catching the real bug
  above) that the car/mannequin actually render as their real models, not
  boxes, after the preload fix -- zero console errors (the one 404 seen was
  the browser's own automatic `/favicon.ico` request, not anything this
  build serves or is expected to).
- Confirmed zero regression to the ordinary (non-exported) editor: the full
  existing `tests/browser/editor.cjs` black-box suite passes unchanged (same
  bootstrap code path, `exportedScene` simply absent), and `npm run
  typecheck`/`npm test` (36/36) pass.
- Exercised `export_build.mjs`'s rejection paths against real conditions: a
  missing scene file, invalid JSON, an existing output directory without
  `--force`, and a missing `build/site/` (editor not built yet) each produced
  a clear, specific error and non-zero exit; `--force`, `--name`, and `--out`
  each verified to do exactly what they claim.
- Not done here: trimming the export to only the scene's referenced assets
  (see above); a loading-progress indicator during the preload pause (the
  hidden status bar that would normally show this is part of the hidden
  chrome -- acceptable for this round, a multi-second pause on a slow
  connection before Play visibly starts is a rougher edge than a broken
  render, not one); packaging as a downloadable `.zip` rather than a folder
  (the printed `npx serve` hint is the minimum viable "now go host this,"
  not a full distribution/hosting story); a native distributable build (see
  the scoping discussion above -- would need a real native renderer this
  project doesn't have).

## F43 — UI/menu system: authorable screen-space UI (Tier 3 roadmap item, 0.43.0)

Lands the "UI/menu system" roadmap item, scoped by asking the user first (two
real options: an authorable in-game UI component, or a narrower fixed
pause/main-menu pair) -- authorable UI, since it lets a scene author build
either a HUD or a menu out of the same primitive rather than this project
shipping one fixed, non-authorable menu design.

A new `UI` component: `kind` (`Text` or `Button`), `text`, `anchor` (nine
screen-space presets -- every combination of top/middle/bottom x
left/center/right, e.g. `top-left`, `center`), `visibleWhen` (`always`,
`play`, or `pause`), and `action` (Button only; see below). Rendered on the
existing 2D HUD canvas (`main.ts`'s `drawHud()`, previously Health bars
only) at a fixed screen position -- unlike a Health bar, never projected
from the entity's own 3D Transform, since a HUD/menu element has no
meaningful world position. An entity carrying `UI` still gets the usual
placeholder box in the 3D viewport, the same as any other component
combination with no inherent 3D appearance (a Script-only or Sound-only
entity already works this way); author `Renderable.visible: false` on it if
that's unwanted, rather than this component special-casing it.

### A real design flaw found and fixed by actually testing a click, not just rendering

The first design had `Button` carry a free-form `command: string`, a JSON
command executed through the exact same `doc.execute()` path the Authoring
Console's own text box already exposes -- reusing existing infrastructure
instead of inventing a new action vocabulary, and it rendered and hit-tested
correctly in every check. But a real end-to-end test (spawn a Button, enter
Play, click it, check whether its command's effect actually happened) kept
failing, and tracing it down turned up something the design had missed
entirely: `EditorDocument.execute()` (`apps/editor/src/editor/Document.ts`)
unconditionally rejects *every* command while `doc.mode` isn't `"edit"` --
protecting the native runtime/`objects[]`/`animStates[]`'s own per-entity
indexing from a scene mutation arriving mid-Play, the same hazard F42's own
post-push fix (the catalog-model preload race) ran into. Since a Button is
only ever clickable in Play/Pause (never Edit, so authoring a scene can
never accidentally trigger one), the free-form command design meant a
Button's command could *never* actually do anything -- 100% of the time,
not an edge case. This was caught by testing the actual click-through
effect, not by reading the code or checking that the command was stored and
retrievable, which is exactly why the first, wrong design still passed
every check up to that point.

Redesigned `action` as a small, fixed vocabulary instead --
`"restart" | "resume" | "pause" | "quit"` -- each one implemented by
clicking the real, already-correct Play/Pause/Stop transport button that
already does it (`el("play").click()`, etc.) rather than going through
`doc.execute()` at all, exactly the same way those buttons themselves
already take the document through a mode transition. `restart` is the one
action with no existing single button for it, so it chains Stop (which
`rebuild()`s every entity back to its authored state) immediately followed
by Play. This is a narrower vocabulary than the original free-form design,
deliberately: a HUD/pause-menu Button's realistic job -- restart, resume,
pause, quit-to-edit -- is exactly these four actions, and none of them were
ever reachable through the design this replaced.

Click handling: `drawHud()` also populates a `uiButtonHits` array (screen
rects + actions) for every currently-visible Button each frame it draws one;
the existing viewport `pointerdown` handler (previously just 3D
entity-selection raycasting) checks it first, so clicking a Button never
also re-selects whatever 3D object happens to sit behind it on screen.

### F43 verification

- Post-push fix: two Codex findings on the PR, both reproduced against real
  conditions before fixing. (1) A Button's label was drawn off-center for
  every anchor except `"center"` itself: `hudCtx.textAlign`/`textBaseline`
  were reset to `"center"`/`"middle"` *after* the `fillText()` call that
  needed them, not before, so `fillText` still read the anchor's own
  left/top-style alignment while being given the box's *center* point as
  its draw position -- shifting the label toward the box's bottom-right.
  Reproduced with a `top-left`-anchored Button and a pixel scan of the
  rendered text's own horizontal extent versus the button box's: 0.5px off
  center after the fix (previously visibly shifted, confirmed by the same
  scan before it). Fixed by moving the alignment reset before the
  `fillText` call. (2) Two overlapping Buttons (same anchor, or long labels
  on a narrow viewport) hit-tested in paint order, so a click landed on
  whichever was pushed into `uiButtonHits` *first* -- the visually
  bottom/obscured one -- not the one actually drawn on top and visible to
  the click. Reproduced with two same-anchor Buttons with different actions
  (`quit` drawn first/underneath, `pause` drawn second/on top): clicking
  landed on `quit`'s effect before the fix. Fixed by hit-testing
  `uiButtonHits` in reverse (back-to-front, i.e. top-to-bottom visually),
  re-verified the same reproduction now correctly triggers `pause` (the
  visually-topmost button's own action). Re-ran `npm run typecheck`,
  `npm test` (37/37), a fresh Emscripten/WASM build, and the full
  `tests/browser/editor.cjs` black-box suite after both fixes -- all pass.
- `npm run typecheck` and `npm test` (37/37, up from 36) pass. New test:
  `UI` attaches with sensible defaults, edits round-trip through save/load,
  `kind`/`anchor`/`visibleWhen`/`action` are each rejected with a clear
  message naming the field on an invalid value, and `UI` is confirmed
  prefab-shared (editing one instance's text updates every instance live) --
  the same coverage shape every other component's own test already
  establishes.
- Verified rendering and interaction against the real running editor with
  real Playwright, not just DOM/authoring-level checks: a `Text` element
  with `visibleWhen: "always"` actually paints non-transparent pixels on the
  HUD canvas in Edit mode; a `visibleWhen: "pause"` element paints only
  while paused, not otherwise; a `Button`'s rendered position (measured via
  its own computed rect) matches where a real mouse click needs to land to
  hit it -- caught, and fixed as described above, the free-form `command`
  design's total non-functionality this way, not by inspection.
- Verified all four `action`s against the real editor end-to-end, each via
  an actual rendered Button clicked at real screen coordinates, not by
  calling `runUIAction()` directly: `pause` (Play -> click -> `doc.mode`
  reaches `"pause"`), `resume` (Paused -> click -> back to `"play"`),
  `quit` (Paused -> click -> back to `"edit"`), and `restart` (Paused ->
  click -> `doc.mode` returns to `"play"` *and* the fixed-tick counter
  measurably resets to a small number instead of continuing to climb,
  confirming a genuinely fresh Play session started, not just a mode-label
  change).
- Built the real Emscripten/WASM editor and ran the full existing
  `tests/browser/editor.cjs` black-box suite, extended with a new case:
  `UI` appears in its own "UI" Add-component group, its `kind` dropdown
  offers exactly Text/Button with the documented default, edited
  anchor/visibleWhen/action values survive a fresh inspector render, and --
  the one interaction test folded into the permanent suite, not just the ad
  hoc verification above -- a `pause`-action Button placed at `center` and
  clicked for real during Play actually pauses the document. Passed end to
  end.
- Not done here: dynamic/bound text (a live score or timer -- `UI.text` is
  static, authored content; showing a changing value needs either a
  template-binding mechanism or driving `UI.text` from a Script, neither of
  which this round adds); image/icon UI elements (Text and Button cover a
  menu's real needs; an image would need its own asset-loading path
  separate from the 3D model catalog); nine-anchor coverage was chosen over
  free-form pixel offsets for the same "presets over a new coordinate system
  to learn" reasoning `Light`/`Particles` already established for their own
  enums.

## F44 — Save/progress: a scriptable persistence API (Tier 3 roadmap item, 0.44.0)

Lands the "Save/progress" roadmap item, scoped by asking the user first (two
options: a `save(key,value)`/`load(key)` Lua API vs. a no-code "SaveTrigger"
component). The answer was the scripting API — the general-purpose "a game
can remember things" primitive, reusing the `Script` component every game
already authors logic in rather than adding a new special-cased component.

A `save` global table is now exposed to every sandboxed Lua VM
(`engine::script::Runtime`, `source/engine/script/script.cpp`):
`save.set(key, value)` / `save.get(key)`. Deliberately a table with two
fields, not two bare globals named e.g. `save`/`load` as first proposed to
the user — `load` is one of the five base-library names this sandbox
removes specifically to prevent a script loading code from outside its own
source (`open_sandboxed_libs`'s existing `for (const char *global :
{"load", "loadstring", ...})` loop); reusing that exact name for an
unrelated getter would misleadingly suggest it was ever still reachable to a
reader auditing the sandbox. `save.set`/`save.get` share one map
(`Runtime::saved_`) across every entity's VM on that `Runtime` — unlike
`self`, which is strictly per-VM — since the whole point is a game
remembering something regardless of which script (or which play session)
wrote it. Values go through the same `luaL_tolstring` conversion `error()`
already uses, so `save.set(key, {})` is valid Lua that saves a
harmless-if-useless string instead of crashing the host, and a loaded
numeric-looking value still works in arithmetic through Lua's ordinary
string-to-number coercion.

`Runtime` itself has no notion of browsers or files — it only holds the
data in memory for as long as it's alive, same as `self`. Actually
persisting it (and restoring it on the next session) is the host's job,
mirroring how Sound/UI/HUD rendering already live entirely on the browser
side rather than in engine core:

- `Runtime::take_dirty_saves()` returns every key a script has actually
  *changed* via `save.set` since the last call, paired with its current
  value, then clears that pending set — a `set_saved(key, value)` that
  rewrites a key to the exact value it already holds is a no-op, not a
  dirty mark, so a script calling `save.set` with an unchanged value every
  tick doesn't spam the host with the same key forever.
- `Runtime::seed_saved(key, value)` restores a previously-persisted value
  before any script runs — distinct from `set_saved` because seeding is the
  host telling `Runtime` what it already knows, not a new write, so a
  seeded key never itself appears in the next `take_dirty_saves()`.
- Four new bridge exports (`apps/editor/runtime/bridge.cpp`, same
  count-then-indexed-getter idiom `editor_projectile_count`/
  `editor_projectile_value` already established, not a JSON blob — nothing
  else in this file's exported API shape uses one): `editor_seed_save(key,
  value)`, `editor_take_dirty_saves()` (returns how many keys changed),
  `editor_dirty_save_key(index)`, `editor_dirty_save_value(index)`.
- `main.ts` calls `editor_seed_save` once per key, right after
  `editor_commit()` succeeds in `syncRuntime()` (so every previously-saved
  value is visible before the very first tick of a fresh Play session, not
  lazily on first `save.get`), and polls `editor_take_dirty_saves` once per
  rendered frame in `frame()` (not per fixed tick — a save doesn't need
  tick granularity, and `localStorage` writes are comparatively expensive),
  writing each changed key straight to `localStorage`.
- The `localStorage` key is namespaced by `` `game-engine-editor:save:${document.title}:${key}` ``
  — keyed by `document.title`, not a fixed string, because the exported
  standalone player (F42, `export_build.mjs`) sets `<title>` per export;
  two different exported games hosted under the same browser origin (e.g.
  a portfolio site serving several at different paths — `localStorage` is
  origin-scoped, not path-scoped) now get separate save data instead of
  silently sharing, and clobbering, one bucket. Free: it needed zero new
  export-side plumbing, since `<title>` was already set from `--name` or
  the input filename. The ordinary (non-exported) editor's title never
  changes, so its own Play-mode save testing always shares one namespace —
  the same single-editor-instance-per-origin assumption
  `CommandInterpreter.ts`'s own `LocalStorageSceneStore` already makes for
  the document autosave.

### A test bug this round found in its own first attempt, not in the feature

The first version of the real-browser verification (`tests/browser/
editor.cjs`) attached a script that branched on `save.get('seen') == nil`:
set `seen` and move slowly the first time, move fast every time after. Run
against the real WASM build, the *very first* Play session already moved
fast — looking exactly like save data was somehow persisting before any
had ever been written.

The actual cause was the test's own logic, not `save`/`Runtime`: a single
browser-rendered frame can run up to five fixed ticks in a catch-up burst
(`frame()`'s own `while (accumulator >= 1/60 && steps++ < 5)`), and
`save.set`/`save.get` share one `Runtime`-wide map visible to every tick
immediately — including the very next tick in that same burst. So `seen`
was set on the burst's first tick and already non-nil by its second,
several ticks before the test ever got to read the status bar; a "first
ever session" branch measured out to almost entirely the "already seen"
one. This is correct, intended behavior (the whole point of `save` is a
value written now being visible to a read microseconds later, same
`Runtime`, same or a different script) — just not a fact a script's own
read of what it *just wrote itself, moments earlier* can distinguish from
"a genuinely separate prior session wrote this." Confirmed by computing the
exact expected displacement from ticks-mostly-at-1000 rather than
mostly-at-1: it matched the observed position to three significant figures.

Fixed by testing each direction of the round trip against something
independent of same-session script timing instead: direction one
(`save.set` → `localStorage`) checked directly against
`localStorage.getItem(...)` after Stop, not through any script's own later
read; direction two (`localStorage` → `save.get`) planted a value with
`page.evaluate(() => localStorage.setItem(...))` — standing in for a truly
separate prior session, with zero dependency on direction one — before the
very first Play click, so a fresh `Runtime`'s first-ever tick reading it
back can only have come from `editor_seed_save`, never from the same
script's own prior write.

A second, unrelated issue surfaced fixing the first: the rewritten
direction-two check used the entity's `Player` tag and the status bar's
`Player (x, y, z)` readout (same idiom the WASD test earlier in the suite
uses) to observe movement live — but by this point in the suite an earlier
test had already made a *different* entity ("Entity 7") the scene's first
Player-tagged entity, and `playerReadout` is pinned to whichever entity
`syncRuntime()` saw first (`if (isPlayer && playerIndex < 0) playerIndex =
index`), not to whichever one is newest or selected. A second `Player`
entity's own movement is real but invisible to that readout, which is
exactly why the fixed version's `waitForFunction` timed out. Fixed by
tagging the test entity `AIState` instead and reading the already-existing
`Selected AI: <state> (x, z)` readout, which tracks whichever entity is
*selected* (`doc.selection`) regardless of Player status —
`editor.script`'s order-2 write still wins over `editor.ai`'s order-1 one
each tick, the same "whichever system ran last overwrites the other's
velocity write" rule already documented for a Script+AIState combination.

### F44 verification

- Post-push fix: three Codex findings on the PR, all P2, all confirmed
  real and fixed before merge (verified against real browser conditions,
  not taken on faith).
  - "Allow play when local storage is unavailable" — `seedSavedProgress()`
    read `localStorage.length` unconditionally; in a context that denies
    storage access (a sandboxed iframe without `allow-same-origin`, among
    others) that throws a `SecurityError`, which propagated out of
    `syncRuntime()` and back through the Play button's own `try`/`catch`
    *before* it ever reached `doc.mode = "play"` — so Play could never
    start at all, even for a game whose scripts never touch `save`.
    Reproduced with a real page whose `localStorage` getter is patched to
    throw: before the fix, `#play` never set `data-mode="play"`; fixed by
    wrapping the whole scan in one `try`/`catch` (`localStorage.key`/
    `.getItem` would throw the same way mid-scan, not just `.length`),
    treating denied storage as an empty store — confirmed the same page
    now reaches `data-mode="play"` with zero page errors.
  - "Encode save namespace components before joining them" —
    `saveKey()` joined `document.title` and a script's key with a raw,
    unescaped `:`. Title `"Quest:Part"` with key `"score"` and title
    `"Quest"` with key `"Part:score"` produced the *identical* joined
    string, since `:` is valid in both `export_build.mjs`'s `--name` and
    an ordinary Lua string — silently merging two unrelated exported
    games' save data. Fixed by running both components through
    `encodeURIComponent` (which always escapes `:`) before joining;
    verified the two example title/key pairs above now produce distinct
    keys, and added a permanent black-box check confirming the stored key
    is the encoded form, not the raw concatenation.
  - "Keep the render loop alive when persisting a save fails" —
    `persistDirtySaves()` called `localStorage.setItem` with no
    `try`/`catch`; a `QuotaExceededError` (or storage denial) would escape
    `frame()` *before* its own trailing `requestAnimationFrame(frame)`
    call, permanently freezing rendering and simulation over a single
    failed save — and since `editor_take_dirty_saves()` had already
    drained `Runtime`'s own pending set, the value would also be lost
    outright, not just delayed. Reproduced with a real page whose
    `Storage.prototype.setItem` is patched to always throw
    `QuotaExceededError`: before the fix, the fixed-tick counter stopped
    advancing entirely the moment a script's first `save.set` tried to
    persist; fixed by catching per-key, and holding a failed key/value in
    a small `failedSaveWrites` map retried on every later call until one
    succeeds — verified the tick counter keeps climbing throughout a
    sustained failure, and that clearing the failure (letting `setItem`
    succeed again) lets the queued value land in `localStorage` on the
    very next frame, with nothing lost.
  Re-ran `npm run typecheck`/`npm test` (37/37) and the full
  `tests/browser/editor.cjs` black-box suite (extended with the raw-vs-
  encoded-key check above) after all three fixes — still pass, zero
  regression.
- Native unit tests (`tests/script_tests.cpp`, five new cases added to the
  existing 12): `save.set` from one entity's VM is visible to `save.get` in
  a completely separate entity's own VM; `save.get` on a never-set key
  returns Lua `nil`, not an error; `Runtime::seed_saved` is visible to
  `save.get` before any script has run; `take_dirty_saves()` reports a
  changed key exactly once (an unchanged repeated `save.set` doesn't
  re-report it, and `seed_saved` never appears in it at all) and clears the
  pending set once read; a saved value survives a `Script.source` change
  (the per-Instance VM recompiles from scratch, the Runtime-wide save table
  does not). Full `ctest` (14/14 executables, including
  `engine_editor_bridge_tests` after wiring the four new bridge exports)
  re-verified clean.
- Built the real Emscripten/WASM editor and extended the existing
  `tests/browser/editor.cjs` black-box suite with the two-direction check
  described above (fixed after the test bug this round found, not
  hand-waved past it): `save.set` → `localStorage` verified directly via
  `localStorage.getItem`, and `localStorage` → `save.get` verified via a
  value planted with `page.evaluate` before the first-ever Play click,
  observed live through the `Selected AI` status readout. Full suite green
  end to end, zero regression to every earlier component's own case
  (`npm run typecheck`/`npm test`, 37/37, also re-verified clean).
- Not done here: saving a whole table/structured value in one call (`save`
  stores plain strings only, through the same `tostring`-style conversion
  `error()` already uses — a game that wants structured progress data
  authors its own small serialize/deserialize in Lua, e.g. concatenating a
  few `save.set` calls under distinct keys, rather than this round adding a
  JSON encoder to the sandbox); a save slot/multiple-profile concept (one
  flat key-value namespace per exported game, not per player profile within
  it — out of scope for "a game can remember things" as a primitive);
  quota/error handling for `localStorage` filling up (an exported game
  saving a realistic amount of small progress data is nowhere near
  `localStorage`'s typical several-MB-per-origin limit; not worth the
  complexity this round).
