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

# Build script for Nexus backend (native app)

set -e

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

cd "$PROJECT_ROOT/openthread"

echo "Building Nexus backend..."

mkdir -p nexus_native_build
cd nexus_native_build

# Configure with CMake
cmake -GNinja -DOT_PLATFORM=nexus -DOT_COMPILE_WARNING_AS_ERROR=ON \
    -DOT_MULTIPLE_INSTANCE=ON \
    -DOT_THREAD_VERSION=1.4 -DOT_APP_CLI=OFF -DOT_APP_NCP=OFF -DOT_APP_RCP=OFF \
    -DOT_PROJECT_CONFIG="$PROJECT_ROOT/openthread/tests/nexus/openthread-core-nexus-config.h" \
    ..

# Build nexus_live_demo
ninja nexus_live_demo

echo "Build complete! Binary located at openthread/nexus_native_build/tests/nexus/nexus_live_demo"
