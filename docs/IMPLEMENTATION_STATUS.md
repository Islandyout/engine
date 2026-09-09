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
