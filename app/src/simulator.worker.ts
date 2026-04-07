/*
 *  Copyright (c) 2026, The OpenThread Authors.
 *  All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// @ts-ignore
import Module from './nexus_live_demo.js';

let wasmModule: any = null;
let intervalId: any = null;
let simulationSpeed: number = 0; // 0 means paused
let simulatedTimeUs: number = 0;

// Initialize the Wasm module
async function init() {
  try {
    const baseUrl = import.meta.env.BASE_URL || './';
    const wasmUrl = baseUrl + 'nexus_live_demo.wasm?v=' + Date.now();
    
    console.log("Fetching WASM manually from:", wasmUrl);
    const response = await fetch(wasmUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.statusText}`);
    }
    
    const body = response.body;
    if (!body) {
      throw new Error("Response body is null");
    }
    
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    console.log("WASM Total size:", total);
    
    let loaded = 0;
    const reader = body.getReader();
    const chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      
      if (total > 0) {
        const progress = Math.min(100, Math.round((loaded / total) * 100));
        postMessage({ type: 'progress', progress });
      }
    }
    
    const chunksAll = new Uint8Array(loaded);
    let position = 0;
    for (let chunk of chunks) {
      chunksAll.set(chunk, position);
      position += chunk.length;
    }
    
    console.log("WASM fetched, initializing module...");
    
    wasmModule = await Module({
      wasmBinary: chunksAll.buffer,
      print: function(text: string) { console.log("[Wasm Stdout]", text); },
      printErr: function(text: string) { console.error("[Wasm Stderr]", text); }
    });
  } catch (e: any) {
    console.error("Failed to load Wasm Module in worker:", e);
    postMessage({ type: 'error', error: e.message });
    return;
  }
  
  console.log("Wasm Simulator Module loaded!");
  
  // Initialize observer
  if (wasmModule.initWasmObserver) {
    wasmModule.initWasmObserver();
    console.log("Wasm Observer initialized in worker.");
  }

  // Default topology creation removed, UI will create it.
  
  // Notify main thread that loaded
  postMessage({ type: 'loaded' });
}

// Start simulation loop
function startSimulation(intervalMs: number) {
  if (intervalId) return;
  
  intervalId = setInterval(() => {
    if (!wasmModule) return;
    
    if (simulationSpeed > 0) {
      simulatedTimeUs += intervalMs * 1000 * simulationSpeed;
      wasmModule.stepSimulation(intervalMs * simulationSpeed);
    }
    
    // Send a heartbeat event to update UI time
    postMessage({ 
      type: 'event', 
      event: { 
        timestamp_us: simulatedTimeUs,
        event: null 
      } 
    });
    
    // Poll events always to keep UI updated
    let event = wasmModule.pollEvent();
    let pollCount = 0;
    while (event && pollCount < 1000) {
      handleWasmEvent(event, simulatedTimeUs);
      event = wasmModule.pollEvent();
      pollCount++;
    }
    if (pollCount >= 1000) {
      console.warn("Warning: Poll event limit reached in worker!");
    }
  }, intervalMs);
}

function stopSimulation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function handleWasmEvent(event: any, timestampUs: number) {
  console.log("[Worker] handleWasmEvent:", event);
  const type = event.type;
  const data = event.data;
  
  // Map to SimulationEvent format expected by frontend
  let simEvent: any = {
    timestamp_us: timestampUs,
  };
  
  if (type === 'node_state_changed') {
    simEvent.event = {
      NodeUpdate: {
        node_id: data.id,
        role: data.role || "detached",
        x: data.x,
        y: data.y,
        rloc16: data.rloc16 || 0,
        queue_depth: 0,
        queue_delay_us: 0
      }
    };
  } else if (type === 'link_update') {
    simEvent.event = {
      LinkUpdate: {
        source_node_id: data.srcId,
        destination_node_id: data.dstId,
        is_active: data.isActive,
        link_quality: 3 // Dummy
      }
    };
  } else if (type === 'packet_event') {
    simEvent.event = {
      PacketCaptured: {
        source_node_id: data.srcId,
        destination_node_id: data.dstId,
        protocol: "MLE",
        summary: "Packet transmission",
        raw_payload: "",
        decoded_info: ""
      }
    };
  }
  
  postMessage({ type: 'event', event: simEvent });
}

self.onmessage = (e) => {
  const { type, data } = e.data;
  
  switch (type) {
    case 'init':
      init();
      break;
    case 'set_node_position':
      console.log(`[Worker] set_node_position: ${e.data.id} -> (${e.data.x}, ${e.data.y})`);
      if (wasmModule && wasmModule.setNodePosition) {
        wasmModule.setNodePosition(e.data.id, e.data.x, e.data.y);
      }
      break;
    case 'start':
      startSimulation(data.intervalMs || 100);
      break;
    case 'stop':
      stopSimulation();
      break;
    case 'speed':
      simulationSpeed = data.speed;
      console.log("Worker simulation speed set to:", simulationSpeed);
      break;
    case 'command':
      const { command, args, requestId } = data;
      console.log("Worker handling command:", command, args);
      let result = null;
      
      if (!wasmModule) {
        console.warn("Worker received command before Wasm Module loaded:", command);
        if (requestId) {
          postMessage({ type: 'command_result', requestId, result: null, error: 'Wasm module not loaded' });
        }
        break;
      }
        
      if (command === "create_node") {
        if (wasmModule.createNode) {
          result = wasmModule.createNode(args.x, args.y);
        }
      } else if (command === "set_simulation_speed") {
        simulationSpeed = args.speed;
        console.log("Worker simulation speed set to:", simulationSpeed);
      } else if (command === "form_network") {
        if (wasmModule.formNetwork) {
          wasmModule.formNetwork(args.nodeId);
        }
      } else if (command === "join_network") {
        if (wasmModule.joinNetwork) {
          let mode = wasmModule.JoinMode.AsFtd; // Default
          if (args.mode === "fed") mode = wasmModule.JoinMode.AsFed;
          else if (args.mode === "med") mode = wasmModule.JoinMode.AsMed;
          else if (args.mode === "sed") mode = wasmModule.JoinMode.AsSed;
          else if (args.mode === "ftd") mode = wasmModule.JoinMode.AsFtd;
          
          wasmModule.joinNetwork(args.nodeId, args.targetNodeId, mode);
        }
      } else if (command === "set_node_state") {
        if (wasmModule.setNodeEnabled) {
          wasmModule.setNodeEnabled(args.nodeId, args.enabled);
        }
      } else if (command === "get_radio_parameters") {
        if (wasmModule.getRadioParameters) {
          result = wasmModule.getRadioParameters();
        }
      }
      
      if (requestId) {
        console.log(`[Worker] Sending command_result for ${requestId}`, result);
        postMessage({ type: 'command_result', requestId, result });
      }
      break;
  }
};
