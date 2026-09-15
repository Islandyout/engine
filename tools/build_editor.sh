#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --prefix apps/editor
npm test --prefix apps/editor
npm run build --prefix apps/editor
em++ -std=c++20 -O2 -fexceptions -Wall -Wextra -Werror -Iinclude \
  apps/editor/runtime/bridge.cpp source/engine/world/world.cpp source/engine/world/fixed_systems.cpp \
  source/engine/physics/physics.cpp source/engine/input/input.cpp \
  -sMODULARIZE=1 -sEXPORT_NAME=createEditorRuntime -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sDISABLE_EXCEPTION_CATCHING=0 \
  -sWASM_ASYNC_COMPILATION=0 -o build/site/runtime.js
cp assets/source/bench.glb build/site/bench.glb
cp -r assets/source/kit build/site/kit
cp assets/CREDITS.md build/site/ASSET-CREDITS.txt
cp third_party/aether/LICENSE build/site/AETHER-LICENSE.txt
