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
    wasmModule = await Module({
      print: function(text: string) { console.log("[Wasm Stdout]", text); },
      printErr: function(text: string) { console.error("[Wasm Stderr]", text); },
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          const baseUrl = import.meta.env.BASE_URL || './';
          return baseUrl + 'nexus_live_demo.wasm?v=' + Date.now();
        }
        return path;
      }
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
    while (event !== "" && pollCount < 1000) {
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

function handleWasmEvent(eventStr: string, timestampUs: number) {
  console.log("[Worker] handleWasmEvent:", eventStr);
  const parts = eventStr.split(':');
  const type = parts[0];
  const data = parts.slice(1).join(':');
  
  // Map to SimulationEvent format expected by frontend
  let simEvent: any = {
    timestamp_us: timestampUs,
  };
  
  if (type === 'node_state_changed') {
    const nodeParts = data.split(':');
    simEvent.event = {
      NodeUpdate: {
        node_id: parseInt(nodeParts[0]),
        role: nodeParts[1] || "detached",
        x: parseFloat(nodeParts[2]),
        y: parseFloat(nodeParts[3]),
        rloc16: parseInt(nodeParts[4]) || 0,
        queue_depth: 0,
        queue_delay_us: 0
      }
    };
  } else if (type === 'link_update') {
    const linkParts = data.split(',');
    simEvent.event = {
      LinkUpdate: {
        source_node_id: parseInt(linkParts[0]),
        destination_node_id: parseInt(linkParts[1]),
        is_active: linkParts[2] === '1',
        link_quality: 3 // Dummy
      }
    };
  } else if (type === 'packet_event') {
    const parts = data.split('->');
    simEvent.event = {
      PacketCaptured: {
        source_node_id: parseInt(parts[0]),
        destination_node_id: parseInt(parts[1]),
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
          wasmModule.joinNetwork(args.nodeId, args.targetNodeId, args.mode);
        }
      } else if (command === "set_node_state") {
        if (wasmModule.setNodeEnabled) {
          wasmModule.setNodeEnabled(args.nodeId, args.enabled);
        }
      }
      
      if (requestId) {
        console.log(`[Worker] Sending command_result for ${requestId}`, result);
        postMessage({ type: 'command_result', requestId, result });
      }
      break;
  }
};
