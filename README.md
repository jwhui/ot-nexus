# Nexus Simulator Desktop App

A cross-platform desktop application designed to interface with the OpenThread Nexus Simulator. It provides a visual environment to design, debug, and optimize Thread networks.

## Architecture

The project consists of two main parts:
1. **Frontend**: A React-based user interface for visualizing and controlling the simulation.
2. **Backend**: A C++ simulation environment based on OpenThread.

We support two different execution modes for the backend, each with its own trade-offs:

### 1. Native Mode (gRPC)
In Native mode, the simulation runs as a standalone C++ executable on the host machine.
- **Communication**: The frontend (running in Tauri) communicates with the backend via **gRPC** streams.
- **Pros**:
  - **Performance**: Full native execution speed, suitable for large networks.
  - **Full Feature Set**: Leverages the complete native OS capabilities.
- **Cons**:
  - Requires building local C++ dependencies and setting up the environment.

### 2. WebAssembly Mode (WASM)
In WASM mode, the C++ simulation is compiled into WebAssembly and runs directly inside a Web Worker.
- **Communication**: The frontend communicates via an asynchronous **RPC-like Message Channel** to the worker.
- **Pros**:
  - **Portability**: Runs in any modern web browser without compiling local C++ code.
  - **Zero Install**: Easy to deploy as a static web app.
- **Cons**:
  - **Performance**: Limited by browser sandbox overhead and single-thread scaling for the worker.

## Prerequisites

To build and run the application, you need:
- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **C++ Compiler** (supporting C++17 or later)
- **CMake** (for building the simulator)
- **Protobuf Compiler** (`protoc`)

## Getting Started

### 1. Clone the Repository

Clone this repository recursively to include the `openthread` submodule:

```bash
git clone --recursive https://github.com/jwhui/ot-nexus.git
cd ot-nexus
```

### 2. Build the Simulator Backend

You can build the simulator in either Native mode (for the desktop app) or WebAssembly mode (for the browser).

#### Native Backend (gRPC)
Run the native build script from the root of the repository:
```bash
./script/build_nexus_native.sh
```

#### WebAssembly Backend
Ensure you have the Emscripten SDK available in your environment, then run:
```bash
./script/build_nexus_wasm.sh
```

### 3. Run the Application

First, navigate to the `app` directory and install dependencies:
```bash
cd app
npm install
```

#### Desktop App (Tauri)
To run the full desktop experience powered by the native gRPC backend:
```bash
npm run tauri dev
```

#### Web App (Vite)
To run in the browser using the WebAssembly simulator:
```bash
npm run dev
```

## License

This project is licensed under the Apache 2.0 License. See the [LICENSE](LICENSE) file for details.
