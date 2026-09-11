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
