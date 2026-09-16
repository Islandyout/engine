#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --prefix apps/editor
npm test --prefix apps/editor
npm run build --prefix apps/editor
# Vendored Lua (third_party/lua/README.md) compiled separately, without this
# project's own -Wall -Wextra -Werror -- it's unmodified third-party C, not
# code held to that bar (see CMakeLists.txt's matching comment on the native
# lua_vendored target), and building it as a plain static archive first keeps
# that boundary the same way here as it does natively, instead of forcing the
# main em++ link line below to tolerate warnings from someone else's source.
mkdir -p build/lua-obj
lua_sources=(lapi lauxlib lbaselib lcode lcorolib lctype ldebug ldo ldump lfunc lgc llex \
  lmathlib lmem lobject lopcodes lparser lstate lstring lstrlib ltable ltablib ltm lundump \
  lutf8lib lvm lzio)
lua_objects=()
for name in "${lua_sources[@]}"; do
  emcc -std=c99 -O2 -Ithird_party/lua -c "third_party/lua/${name}.c" -o "build/lua-obj/${name}.o"
  lua_objects+=("build/lua-obj/${name}.o")
done
emar rcs build/lua-obj/liblua.a "${lua_objects[@]}"
em++ -std=c++20 -O2 -fexceptions -Wall -Wextra -Werror -Iinclude -Ithird_party/lua \
  apps/editor/runtime/bridge.cpp source/engine/world/world.cpp source/engine/world/fixed_systems.cpp \
  source/engine/physics/physics.cpp source/engine/input/input.cpp source/engine/script/script.cpp \
  build/lua-obj/liblua.a \
  -sMODULARIZE=1 -sEXPORT_NAME=createEditorRuntime -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sDISABLE_EXCEPTION_CATCHING=0 \
  -sWASM_ASYNC_COMPILATION=0 -sEXPORTED_RUNTIME_METHODS=ccall \
  -o build/site/runtime.js
cp assets/source/bench.glb build/site/bench.glb
cp -r assets/source/kit build/site/kit
cp assets/CREDITS.md build/site/ASSET-CREDITS.txt
cp third_party/aether/LICENSE build/site/AETHER-LICENSE.txt
