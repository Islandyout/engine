# Pull request metadata

Title: F5: world ownership, typed components, and deterministic fixed systems

Branch: `codex/f5-world-foundation`

Stacked base: `codex/f4-action-input-bindings` (local F4 commit `23bdaca`). Do not merge F4
as part of this change. Rebase onto the approved F4 mainline before a main-targeted review.

## Summary

- Add an isolated engine-owned world and typed component API with non-reused, world-scoped handles.
- Define reset, resource lifetime, query snapshot, FIFO structural-change, and failure semantics.
- Execute fixed systems by explicit phase/order/name through the existing runtime fixed callback.
- Add seven deterministic world-test groups and advance version to 0.5.0.
- Document the decision to defer Flecs integration while establishing a dependency-free ownership contract.

## Scope exclusions

No rendering, physics, planets, scene authoring, hierarchy, jobs, asset pipeline, or gameplay.
No Aether source import or F4 merge. F5 is published as a stacked pull request; hosted checks are pending.

## Verification

- GCC 13.3.0 strict SDL-free build: 5/5 tests passed.
- GCC 13.3.0 SDL-enabled dummy/offscreen build: 6/6 tests passed.
- GCC headless undefined-behavior sanitizer build: 5/5 tests passed.
- World suite: 100 consecutive repetitions passed.
- SDL dummy-driver smoke: 4 ticks, 4 frames, clean shutdown, version 0.5.0.
- New C++ files pass clang-format 18.1.8; Git diff whitespace/error checks pass.
- Linux Clang SDL-enabled/headless presets: **hosted verification pending**. Toolchain and desktop
  development packages need a provisioned environment; system package operations were permission-blocked.

Do not approve as fully verified until both Clang preset gates pass. See
`IMPLEMENTATION_STATUS.md` for verification details and `WORLD_FOUNDATION.md` for API semantics.

## Reproduction commands

```sh
cmake -S . -B build/f5-gcc-headless -G Ninja -DENGINE_ENABLE_SDL3=OFF \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_COMPILER=g++
cmake --build build/f5-gcc-headless
ctest --test-dir build/f5-gcc-headless --output-on-failure
ctest --test-dir build/f5-gcc-headless -R engine_world_tests --repeat until-fail:100

cmake -S . -B build/f5-gcc-sdl -G Ninja -DENGINE_ENABLE_SDL3=ON \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_COMPILER=g++ -DSDL_UNIX_CONSOLE_BUILD=ON
cmake --build build/f5-gcc-sdl
ctest --test-dir build/f5-gcc-sdl --output-on-failure
SDL_VIDEODRIVER=dummy build/f5-gcc-sdl/engine_host --smoke

cmake -S . -B build/f5-gcc-ubsan -G Ninja -DENGINE_ENABLE_SDL3=OFF \
  -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_COMPILER=g++ \
  -DCMAKE_CXX_FLAGS='-fsanitize=undefined -fno-sanitize-recover=all' \
  -DCMAKE_EXE_LINKER_FLAGS=-fsanitize=undefined
cmake --build build/f5-gcc-ubsan
ctest --test-dir build/f5-gcc-ubsan --output-on-failure

clang-format --dry-run --Werror \
  -style='{BasedOnStyle: LLVM, IndentWidth: 4, AccessModifierOffset: -4, ColumnLimit: 100, PointerAlignment: Left, ReferenceAlignment: Left}' \
  include/engine/world/*.hpp source/engine/world/*.cpp tests/world_tests.cpp
git diff --check
```

The local SDL run additionally supplied `FETCHCONTENT_SOURCE_DIR_SDL3` pointing at the
existing `build/linux-clang/_deps/sdl3-src` checkout of the pinned SDL release, avoiding
a redundant download. No repository dependency settings were changed for this fallback.
