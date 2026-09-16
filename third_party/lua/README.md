# Vendored Lua 5.4.7

Unmodified library source from [lua/lua](https://github.com/lua/lua), tag
`v5.4.7` — MIT licensed, copyright notice embedded at the end of `lua.h`.
`lua.c` (the standalone `lua` interpreter binary), `onelua.c` (the
single-file amalgamation, unused here — `cmake/Dependencies.cmake` compiles
the individual `.c` files as a library instead), and `ltests.c`/`ltests.h`
(Lua's own internal test harness, requires build-time defines this project
doesn't set) are intentionally not vendored.

Used by `engine::script` (`include/engine/script`, `source/engine/script`)
to run per-entity Lua scripts identically in the native playground and the
browser editor's Emscripten build.
