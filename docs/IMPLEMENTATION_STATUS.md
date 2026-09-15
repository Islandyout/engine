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
