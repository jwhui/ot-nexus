#!/bin/bash
#
#  Copyright (c) 2026, The OpenThread Authors.
#  All rights reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#  http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

# Build script for Nexus WASM backend

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# Source Emscripten environment
if command -v emcc > /dev/null; then
    echo "Using existing Emscripten environment (emcc found in PATH)."
elif [ -n "$EMSDK" ] && [ -f "$EMSDK/emsdk_env.sh" ]; then
    echo "Sourcing Emscripten environment from $EMSDK..."
    source "$EMSDK/emsdk_env.sh"
else
    echo "Error: Emscripten not found in PATH and EMSDK not set."
    exit 1
fi

echo "Building Nexus WASM backend..."

cd "$PROJECT_ROOT/openthread"
mkdir -p nexus_wasm_build
cd nexus_wasm_build

if [ ! -f build.ninja ]; then
    echo "Configuring WASM build with CMake..."
    emcmake cmake -GNinja -DOT_PLATFORM=nexus -DOT_COMPILE_WARNING_AS_ERROR=ON \
        -DOT_MULTIPLE_INSTANCE=ON \
        -DOT_THREAD_VERSION=1.4 -DOT_APP_CLI=OFF -DOT_APP_NCP=OFF -DOT_APP_RCP=OFF \
        -DOT_PROJECT_CONFIG="$PROJECT_ROOT/openthread/tests/nexus/openthread-core-nexus-config.h" \
        ..
fi

echo "Compiling..."
ninja nexus_live_demo

echo "Copying artifacts to app..."
cp tests/nexus/nexus_live_demo.js "$PROJECT_ROOT/app/src/"
cp tests/nexus/nexus_live_demo.wasm "$PROJECT_ROOT/app/public/"

echo "Build complete! Artifacts updated in app."
