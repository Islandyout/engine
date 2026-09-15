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
