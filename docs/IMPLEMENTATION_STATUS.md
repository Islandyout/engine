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
