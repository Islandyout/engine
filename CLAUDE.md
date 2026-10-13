# Working in this repository

A C++20 game engine (native, and WebAssembly for the browser editor in
`apps/editor`) with games built on it. Read the doc for the area you touch
before changing it: `docs/IMPLEMENTATION_STATUS.md` lists every feature and
its changelog in `docs/changelog/`.

## Layout

- `source/`, `include/`: the engine (world/ECS, physics, script, gameplay...).
- `apps/editor/runtime/bridge*.cpp`: the C++ the browser calls (`EXPORT` functions).
- `apps/editor/src/`: the three.js editor and player (TypeScript).
- `third_party/lua`: vendored Lua 5.4; changes there are marked `engine:`.
- `games/`: each folder is a game in the editor's Games library
  (`games/my-games/velocity` is VELOCITY).
- `tools/`: scene builders (`tools/gatebreaker`, `tools/space`, ...) and generators.
- `tests/`: native tests (`*_tests.cpp`) and browser tests (`tests/browser/*.cjs`).

## Build and test

```sh
cmake --preset linux-clang-headless && cmake --build --preset linux-clang-headless -j8
ctest --preset linux-clang-headless          # native tests
bash tools/build_editor.sh                   # wasm + editor + unit tests (needs emsdk)
cd apps/editor && npm test && npm run typecheck
node tests/browser/editor.cjs                # browser tests, after build_editor.sh
```

Generated files, regenerate rather than hand-edit:

- `apps/editor/src/editor/runtimeExports.ts`: `node tools/bridge/gen_exports.mjs`
- Lua API docs and stubs: `node tools/script_api/gen.mjs` (`--check` in CI)
- `docs/COMPONENTS.md`: `cd apps/editor && npx tsx ../../tools/docs/gen_components.ts`
- Game scenes: `cd apps/editor && npm run gatebreaker` (and `fps`, `space`, `racing`, `velocity`, `city`)

## Rules

- Verify before calling work done: build, run the tests that cover the change,
  and for gameplay, run the game's browser test or look at a screenshot.
- Don't edit a test to make it pass unless the test itself is wrong; say so
  when it is. Don't change a test and the code it tests in one step without
  checking the test still fails on the old code.
- Fail loudly: no silent fallbacks. A bad scene value should produce a reason
  (see `fail()` / `editor_last_error()` in the bridge), not a quiet default.
- User text (file names, scene names, script output) never goes through
  `innerHTML`; build DOM nodes or `new Option(...)`.
- Scripts are untrusted: keep the Lua sandbox limits (instruction budget,
  64 MB memory cap, pattern step limit) in place.
- Pin new CI actions to a commit SHA.
- Keep history in `docs/changelog/`, not in code comments.
- Commit messages say what changed and why.
