#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/field-lab
em++ -std=c++20 -O2 -fexceptions -Wall -Wextra -Werror -Iinclude \
  apps/field_lab/main.cpp source/engine/world/world.cpp source/engine/world/fixed_systems.cpp \
  source/engine/input/actions.cpp source/engine/input/input.cpp source/engine/core/fixed_step_clock.cpp \
  -sMODULARIZE=1 -sEXPORT_NAME=createEngine -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sDISABLE_EXCEPTION_CATCHING=0 \
  -sWASM_ASYNC_COMPILATION=0 -o build/field-lab/engine.js
cp web/field-lab/* build/field-lab/
