# Gemini Instructions

This file contains instructions and context for Gemini (or other AI assistants) working on this repository.

## Project Overview
This project is a visualizer for the OpenThread Nexus Simulator. It supports both Native (gRPC) and WebAssembly execution modes.

## Development Workflows
- **Native Backend**: `./script/build_nexus_native.sh` builds the C++ backend streaming via gRPC.
- **WASM Backend**: `./script/build_nexus_wasm.sh` builds the C++ backend targeting WebAssembly.
- **Frontend App**: Run `npm run dev` inside the `app` folder to host the Vite web app.

## Architecture Guidelines
- **Wasm Communication**: Uses a Web Worker bridging to the emscripten module via `simulator.worker.ts`.
- **UI State**: Managed by Zustand in `store.ts`.
- **Styling**: Vanilla CSS with modern dynamic design principles.

## Legal
- Files in outer repository (`app`, `script`, `.github`) should follow the **Apache 2.0** license.
- Files in `openthread/tests/nexus` must respect the OpenThread **BSD-3-Clause** licensing terms.
