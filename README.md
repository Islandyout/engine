# Game Engine

This repository is the implementation companion to `GAME_ENGINE_BIBLE_v0.6_RESEARCH.md`.

Version 0.4.0 provides a portable C++20 runtime and an engine-owned action and input-binding layer while keeping headless builds independent of SDL.

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
- minimal host executable
- automated core, input/action, runtime, and SDL backend tests

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
