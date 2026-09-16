# Game Engine

[Open the editor](https://islandyout.github.io/engine/) — build and play games entirely through it; this is the only supported way to play what you build.

The integrated editor provides scene authoring, component inspection, undo/redo, JSON save/load and a Three.js viewport connected to the C++ fixed-step world through WebAssembly. See [the editor contract](docs/BTAI_EDITOR.md) for build instructions and supported behaviors.

This repository is the implementation companion to `GAME_ENGINE_BIBLE_v0.6_RESEARCH.md`.

Version 0.9.0 adds move/rotate/scale editor gizmos, snapping, component dropdowns and reset controls. Edits pass through the authoring API and undo/redo. Headless C++ builds remain independent of browser and desktop libraries.

Engine version 0.10.0 adds native physics: gravity, an implicit ground plane, and axis-aligned collision (`engine::physics`), wired into the native playground as a Shift-to-jump controllable character that collides with the field boxes and spawned crates. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.11.0 adds `engine_playground --save-scene`, writing the live world as the same "format 1" JSON the editor loads and saves, completing native/editor scene round-trip. See [Saving a scene](docs/NATIVE_PLAYGROUND.md#saving-a-scene).

Engine version 0.12.0 adds a playable slice: a short jump-across-platforms path to a gold goal marker in the native playground, completing the Aether-review roadmap's delivery sequence. See [Playable slice](docs/NATIVE_PLAYGROUND.md#playable-slice).

Engine version 0.13.0 unifies `Box` lighting with the mesh renderer's real directional light (no more canned per-face brightness table), and adds sustained flight: hold jump while airborne to climb instead of just arcing through one jump. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.14.0 adds camera follow (the player stays centered on screen instead of walking off it — see [Camera](docs/NATIVE_PLAYGROUND.md#camera)) and the first slice of combat: a defeatable enemy near spawn, attacked with F. See [Combat](docs/NATIVE_PLAYGROUND.md#combat).

Engine version 0.15.0 adds the engine's first HUD element: a screen-space health bar for the enemy from 0.14.0's combat, via a new `BoxView::draw_bar`. See [HUD](docs/NATIVE_PLAYGROUND.md#hud).

Engine version 0.16.0 adds a second, ranged combat option: press G to fire a traveling "blast" projectile at the enemy instead of needing to be right next to it. See [Combat](docs/NATIVE_PLAYGROUND.md#combat).

Engine version 0.17.0 connects the browser editor's Play mode to real engine physics: every entity now falls under gravity and rests on the ground plane using the same `engine::physics` module the native playground uses, instead of the old naive constant-velocity placeholder. This is the first step in wiring all engine capability into the editor itself, so games can be built through the editor rather than only in the native playground. See [the editor contract](docs/BTAI_EDITOR.md#real-c-runtime-connection).

Engine version 0.18.0 removes Field Lab, the standalone browser demo that used to sit at the published site's root, and makes the editor the site itself. Field Lab was a second, non-editor way to interact with compiled engine content that no longer served a purpose distinct from the editor after 0.17.0 — nothing engine-level was lost, since it was built entirely on already-shared engine types the native playground and its tests also use. See [F18](docs/IMPLEMENTATION_STATUS.md#f18--field-lab-removed-the-editor-is-the-site-0180).

Engine version 0.19.0 adds a 103-model catalog to the editor: buildings, furniture, nature, roads, signs and vehicles from the same CC0-licensed Aether kit the bundled bench came from, browsable by category and placeable from the Project/Content panel or the inspector's Model dropdown. See [F19](docs/IMPLEMENTATION_STATUS.md#f19--model-catalog-0190).

Engine version 0.20.0 brings the remaining 27 rigged, animated models (animals and people) into the same catalog, each playing its own embedded idle/walk/run animation clips through Three.js's `AnimationMixer`, crossfading based on the entity's actual measured speed. See [F20](docs/IMPLEMENTATION_STATUS.md#f20--animated-models-in-the-editor-0200).

Engine version 0.21.0 folds the original Aether bench into the model catalog as its own entry (id 1) instead of a separate standalone button, so there's one consistent way to browse and place every bundled model. See [F21](docs/IMPLEMENTATION_STATUS.md#f21--the-bench-joins-the-catalog-it-predates-0210).

Engine version 0.22.0 adds player control to the editor: tag an entity `Player` and drive it with WASD, jump with Shift (hold while airborne to fly, ported from the native playground's own tuned feel), and the camera follows. This is the first of three rounds closing the remaining gap with the native playground — collision with what you build, then combat/flight/HUD, are next. See [F22](docs/IMPLEMENTATION_STATUS.md#f22--player-control-wasd-jumpflight-camera-follow-0220).

Engine version 0.23.0 makes `Collider` obstacles actually block movement in the editor — round 2 of that same plan: any entity authored with a `Collider`, the same component the editor already let you attach but never consulted, now stops the player (and any other moving entity) instead of letting it pass straight through. Combat, flight and HUD are next. See [F23](docs/IMPLEMENTATION_STATUS.md#f23--collision-collider-obstacles-block-movement-0230).

Engine version 0.24.0 adds combat — round 3 of 3, closing the remaining gap with the native playground: F is melee, G fires a ranged blast at the nearest target, and any entity with a `Health` component can now be damaged and defeated by either. A screen-space health bar (plus a status-bar text readout) shows it happening. See [F24](docs/IMPLEMENTATION_STATUS.md#f24--combat-melee-ranged-blast-and-a-health-hud-0240).

Engine version 0.25.0 fixes movement feel, based on direct feedback after 0.22–0.24 shipped: WASD is now camera-relative (fixing the "flipped" feel a fixed world axis had the moment the camera wasn't looking straight down -Z), a moving character turns to face where it's actually going instead of sliding through its run animation, jump gets a squash-and-stretch instead of a flat vertical translation, and `Vehicle` — previously inert data — now makes a `Player` entity accelerate and steer like a car instead of strafing. `examples/demo-game.json` is a small drivable-car-in-an-arena scene built to dogfood all of it together. See [F25](docs/IMPLEMENTATION_STATUS.md#f25--movement-feel-camera-relative-wasd-facing-jump-weight-vehicle-driving-0250).

Engine version 0.26.0 fixes an authored `Scale` component being applied to a catalog GLB model on top of that model's own real-world dimensions instead of as the literal size it's documented to be — found by actually building the browser editor and playing `examples/demo-game.json`, where it made the Player Car render nearly as long as the arena's own walls. The viewport's transform gizmo got the same fix, so dragging a catalog model's scale handle now saves literal dimensions instead of a value that would shrink it back down on the next rebuild. See [F26](docs/IMPLEMENTATION_STATUS.md#f26--catalog-model-scale-normalization-0260).

Engine version 0.27.0 wires up `AIState` and `Pedestrian`, found fully authorable in the editor but never actually simulated — an engineering audit against Unity/Unreal/Godot/Bevy/PlayCanvas flagged it as the exact same "authored but inert" bug `Vehicle` had before 0.25.0. An `AIState`-tagged entity now wanders on its own, chases the nearest `Player` within range, and flees instead once its own health runs low; a `Pedestrian` marker keeps it harmless, never chasing. `examples/demo-game.json`'s two combat targets react to the player now instead of just standing there, and a new wandering `Bystander` populates the arena. See [F27](docs/IMPLEMENTATION_STATUS.md#f27--wiring-up-aistate-and-pedestrian-0270).

Run `engine_playground.exe` after building on Windows, or `engine_playground` on Linux.
[Controls, architecture, and verification](docs/NATIVE_PLAYGROUND.md).

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
