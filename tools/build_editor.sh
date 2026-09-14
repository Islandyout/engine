#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --prefix apps/editor
npm test --prefix apps/editor
npm run build --prefix apps/editor
em++ -std=c++20 -O2 -fexceptions -Wall -Wextra -Werror -Iinclude \
  apps/editor/runtime/bridge.cpp source/engine/world/world.cpp source/engine/world/fixed_systems.cpp \
  -sMODULARIZE=1 -sEXPORT_NAME=createEditorRuntime -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sDISABLE_EXCEPTION_CATCHING=0 \
  -sWASM_ASYNC_COMPILATION=0 -o build/field-lab/editor/runtime.js
cp assets/source/bench.glb build/field-lab/editor/bench.glb
cp assets/CREDITS.md build/field-lab/editor/ASSET-CREDITS.txt
