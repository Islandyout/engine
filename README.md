# Game Engine

This repository is the implementation companion to `GAME_ENGINE_BIBLE_v0.6_RESEARCH.md`.

The current milestone is deliberately small: a clean, dependency-free C++20 foundation that can compile and test before renderer, ECS, physics, platform, or game code is introduced.

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
- minimal host executable
- dependency-free automated core and runtime tests

## Build on this PC

CMake and a self-contained MinGW/UCRT compiler are installed for the current user. Start a new terminal after installation so the updated command path is visible, then run:

```bat
cmake --preset windows-mingw
cmake --build --preset windows-mingw
ctest --preset windows-mingw
```

The `windows-msvc` preset is retained for machines with a complete Visual Studio C++ workload and Windows SDK. `tools\build_msvc.cmd` is a diagnostic fallback for that toolchain.

Generated output belongs under `build/` or `out/` and is excluded from source control.
