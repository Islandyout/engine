# Game Engine

[Open the BTAI editor](https://islandyout.github.io/engine/editor/) · [Play Field Lab](https://islandyout.github.io/engine/)

The integrated editor provides scene authoring, component inspection, undo/redo, JSON save/load and a Three.js viewport connected to the C++ fixed-step world through WebAssembly. See [the editor contract](docs/BTAI_EDITOR.md) for build instructions and supported behaviors.

This repository is the implementation companion to `GAME_ENGINE_BIBLE_v0.6_RESEARCH.md`.

Version 0.9.0 adds move/rotate/scale editor gizmos, snapping, component dropdowns and reset controls. Edits pass through the authoring API and undo/redo. Headless C++ builds remain independent of browser and desktop libraries.

Engine version 0.10.0 adds native physics: gravity, an implicit ground plane, and axis-aligned collision (`engine::physics`), wired into the native playground as a Shift-to-jump controllable character that collides with the field boxes and spawned crates. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.11.0 adds `engine_playground --save-scene`, writing the live world as the same "format 1" JSON the editor loads and saves, completing native/editor scene round-trip. See [Saving a scene](docs/NATIVE_PLAYGROUND.md#saving-a-scene).

Engine version 0.12.0 adds a playable slice: a short jump-across-platforms path to a gold goal marker in the native playground, completing the Aether-review roadmap's delivery sequence. See [Playable slice](docs/NATIVE_PLAYGROUND.md#playable-slice).

Engine version 0.13.0 unifies `Box` lighting with the mesh renderer's real directional light (no more canned per-face brightness table), and adds sustained flight: hold jump while airborne to climb instead of just arcing through one jump. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.14.0 adds camera follow (the player stays centered on screen instead of walking off it — see [Camera](docs/NATIVE_PLAYGROUND.md#camera)) and the first slice of combat: a defeatable enemy near spawn, attacked with F. See [Combat](docs/NATIVE_PLAYGROUND.md#combat).

Engine version 0.15.0 adds the engine's first HUD element: a screen-space health bar for the enemy from 0.14.0's combat, via a new `BoxView::draw_bar`. See [HUD](docs/NATIVE_PLAYGROUND.md#hud).

Run `engine_playground.exe` after building on Windows, or `engine_playground` on Linux.
[Controls, architecture, and verification](docs/NATIVE_PLAYGROUND.md).

## Field Lab browser demonstration

`apps/field_lab` compiles the actual C++ input, action, world, and fixed-system code to
WebAssembly. `web/field-lab` draws an interactive isometric field around that simulation.
Use **New seeded field** for repeatable signal layouts from the adapted Aether generator.
[Archive evaluation and roadmap](docs/AETHER_REVIEW.md).
Move with WASD/arrows or the touch pad, collect signals, place crates, block movement
with a higher-priority context, and record/replay up to 30 seconds of input.

With Emscripten installed, run `bash tools/build_field_lab.sh`, then
`node tests/field_lab.cjs`. Serve `build/field-lab` with a static HTTP server.
The Field Lab workflow compiles and tests the browser artifact on every PR to main.
This is a visualization of the foundation, not the native renderer or production physics.

## Current foundation

- CMake project and Windows/Linux presets
- strict compiler warnings
- explicit fixed-width core types
- RFC-compatible UUIDv4 values and strongly typed engine IDs
- bounded 60 Hz-capable fixed-step clock
- thread-safe structured logging with replaceable sinks
- platform-independent application lifecycle and event contract
- deterministic headless platform for tests and dedicated-server foundations
- bounded fixed-update/render loop with frame pacing and controlled shutdown
- SDL3 desktop backend with an owned resizable, high-pixel-density window
- engine-owned translation for close, suspend/resume, resize, pixel-size, and focus events
- engine-owned keyboard, text, mouse, touch, and gamepad events with per-frame input state
- strong action and input-context identifiers with deterministic priority and activation
- keyboard, mouse, and gamepad bindings with digital chords and optional device selection
- configurable dead zones, saturation, linear/squared/cubic response, inversion, and scaling
- deterministic action press/release transitions, canonical validated persistence, and frame replay injection
- isolated world ownership, non-reused entity handles, and explicit typed component registration
- creation-ordered query snapshots and FIFO deferred structural changes
- fixed systems ordered by phase, numeric order, and stable name
- minimal host executable
- automated core, input/action, world, runtime, and SDL backend tests

## Build on this PC

CMake and a self-contained MinGW/UCRT compiler are installed for the current user. Start a new terminal after installation so the updated command path is visible, then run:

```bat
cmake --preset windows-mingw
cmake --build --preset windows-mingw
ctest --preset windows-mingw
```

The `windows-msvc` preset is retained for machines with a complete Visual Studio C++ workload and Windows SDK. `tools\build_msvc.cmd` is a diagnostic fallback for that toolchain.

The no-SDL configuration verifies that dedicated-server and automation builds remain independent of desktop libraries:

```bat
cmake --preset windows-mingw-headless
cmake --build --preset windows-mingw-headless
ctest --preset windows-mingw-headless
```

Equivalent Linux Clang presets are `linux-clang` and `linux-clang-headless`.

## Input actions

`engine/input/actions.hpp` defines `InputMap`, `ActionSystem`, and the binding types. Active contexts are evaluated by descending priority; once a context at a given priority defines an action, lower-priority bindings for that action are masked. Context identifiers break equal-priority ordering, binding values combine in canonical order, and the final scalar action value is clamped to `[-1, 1]`.

`serialize_input_map` writes the versioned, canonical `game_engine_input_map 1` format. `deserialize_input_map` rejects malformed records, duplicate or invalid identifiers, undeclared references, invalid device controls, duplicate chord members, non-finite processor values, and invalid dead-zone/saturation ranges. `InputReplay` injects ordered event frames into a resettable `InputState` for deterministic headless tests.

Generated output belongs under `build/` or `out/` and is excluded from source control.

## Worlds and fixed systems

Link `GameEngine::World` and include `engine/world/fixed_systems.hpp`. Own a `World` and
`FixedSystems` in your application callbacks; register components and systems before running,
then call `systems.run(world, context)` exactly once from `on_fixed_update`. Do not call it
from `on_render`. The existing application loop remains the only time accumulator.

```cpp
struct Counter { int ticks{}; };
world.register_component<Counter>("counter");
const auto entity = world.create();
world.set(entity, Counter{});
systems.add("counter.advance", engine::FixedPhase::update, 0,
    [](engine::World& current, const engine::FixedUpdateContext&) {
        for (const auto item : current.query<Counter>()) {
            ++current.get<Counter>(item)->ticks;
        }
    });
```

Systems execute in `begin`, `update`, then `end` phases. Within each phase, ascending
numeric order and lexical system name determine execution, independently of registration
order. Direct component-value edits are visible immediately; entity creation/destruction
and component insertion/removal must use `defer_create`, `defer_destroy`, `defer_set`, and
`defer_remove` during execution. Queued changes commit before the first phase and after
each phase. See [the F5 contract](docs/WORLD_FOUNDATION.md) for ownership, reset, pointer
lifetime, errors, determinism limits, and backend decisions.

## Run

Open the desktop engine host and close it with the normal window close button:

```bat
build\windows-mingw\engine_host.exe
```

Run without a window for dedicated-server or automation work:

```bat
build\windows-mingw\engine_host.exe --headless
```

Run a hidden four-tick SDL startup/shutdown check:

```bat
build\windows-mingw\engine_host.exe --smoke
```
