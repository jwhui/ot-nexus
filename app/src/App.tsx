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

import { useEffect, useRef } from "react";
import ReactFlow, { Background, Controls, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import "./App.css";
import { useNexusStore, SimulationEvent, safeInvoke } from "./store";
import { listen } from "@tauri-apps/api/event";
import { DeviceNode } from "./DeviceNode";
import { PacketEdge } from "./PacketEdge";

const nodeTypes = {
  device: DeviceNode,
};

const edgeTypes = {
  packet: PacketEdge,
};

function App() {
  const { fitView } = useReactFlow();
  const {
    nodes,
    edges,
    simulationSpeed,
    unpausedSpeed,
    setUnpausedSpeed,
    setSimulationSpeed,
    isConnected,
    setIsConnected,
    resetState,
    handleSimulationEvent,
    onNodesChange,
    simulationTimeUs,
    setActiveDraggingNodeId,
    hasInitialized,
    loadingProgress,
  } = useNexusStore();

  const hasFitView = useRef(false);
  useEffect(() => {
    if (hasInitialized && nodes.length > 0 && !hasFitView.current) {
      console.log("[App] Performing fitView!");
      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 500);
      hasFitView.current = true;
    }
  }, [hasInitialized, nodes.length, fitView]);

  useEffect(() => {
    const isTauri = window.hasOwnProperty('__TAURI_INTERNALS__');

    if (isTauri) {
      const unlisten = listen<SimulationEvent>("simulation-event", (event) => {
        handleSimulationEvent(event.payload);
      });
      return () => {
        unlisten.then((fn) => fn());
      };
    }
    // In Web Mode, store.ts handles the worker!
  }, [handleSimulationEvent, resetState]);



  useEffect(() => {
    const isTauri = window.hasOwnProperty('__TAURI_INTERNALS__');
    if (!isTauri) return; // In Web Mode, store.ts handles connection via worker 'loaded' event

    let isMounted = true;
    const tryConnect = async () => {
      while (isMounted) {
        try {
          await safeInvoke("connect_simulator");
          await safeInvoke("set_simulation_speed", { speed: 0 });
          setIsConnected(true);
          break;
        } catch (error) {
          console.warn("Backend not fully up yet, retrying connect in 500ms...", error);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };
    tryConnect();
    return () => { isMounted = false; };
  }, [setIsConnected]);

  // Handle topology creation when connected
  useEffect(() => {
    if (isConnected) {
      const store = useNexusStore.getState();
      if (store.nodes.length === 0 && !store.hasInitialized) {
        safeInvoke("set_simulation_speed", { speed: 0 });
        store.createDefaultTopology();
      }
    }
  }, [isConnected]);

  const filteredEdges = edges;

  return (
    <div className="app-container">
      {!isConnected && (
        <div className="loading-overlay">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <div className="loading-text">Loading Simulator... {loadingProgress}%</div>
        </div>
      )}
      {/* Main View Area */}
      <main className="main-view">
        <div className="canvas-container">
          <ReactFlow 
            nodes={nodes} 
            edges={filteredEdges} 
            onNodesChange={onNodesChange} 
            onNodeDragStart={(_, node) => {
              setActiveDraggingNodeId(node.id);
            }}
            onNodeDragStop={(_, node) => {
              setActiveDraggingNodeId(null);
              const nodeId = parseInt(node.id, 10);
              if (!isNaN(nodeId)) {
                safeInvoke("set_node_position", { nodeId, x: node.position.x, y: node.position.y });
              }
            }}
            nodeTypes={nodeTypes} 
            edgeTypes={edgeTypes} 
            fitView
          >
            <Background color="#333" gap={16} />
            <Controls />
          </ReactFlow>
        </div>
      </main>

      {/* Bottom Banner */}
      <header className="bottom-banner">
        <div className="banner-brand">OpenThread Simulator</div>
        <div className="speed-control" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="speed-label" style={{ fontSize: '0.9rem', color: '#aaa' }}>Speed:</span>
          <select
            id="speed-select"
            value={simulationSpeed > 0 ? simulationSpeed : unpausedSpeed}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (simulationSpeed > 0) {
                setSimulationSpeed(val);
              } else {
                setUnpausedSpeed(val);
              }
            }}
            style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', padding: '2px 4px' }}
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
            <option value="16">16x</option>
            <option value="32">32x</option>
            <option value="64">64x</option>
          </select>
        </div>
        <button 
          onClick={() => setSimulationSpeed(simulationSpeed > 0 ? 0 : unpausedSpeed)}
          disabled={!isConnected || !hasInitialized}
          style={{ 
            background: simulationSpeed > 0 ? '#ef4444' : '#10b981', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            padding: '4px 8px',
            cursor: (isConnected && hasInitialized) ? 'pointer' : 'not-allowed',
            opacity: (isConnected && hasInitialized) ? 1 : 0.5,
            fontWeight: 'bold'
          }}
        >
          {simulationSpeed > 0 ? "Pause" : "Play"}
        </button>
        <button 
          onClick={async () => {
            try {
              setIsConnected(false);
              resetState();
              await safeInvoke("reset_simulator");
              
              // Wait for worker to be ready by retrying connect_simulator
              while (true) {
                try {
                  await safeInvoke("connect_simulator");
                  break;
                } catch (e) {
                  console.log("Waiting for Wasm module to load during reset...");
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }

              await safeInvoke("set_simulation_speed", { speed: 0 });
              setIsConnected(true);
            } catch (e) {
              console.error("Reset failed:", e);
            }
          }}
          style={{ 
            background: '#6b7280', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            padding: '4px 8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Reset
        </button>

        <div className="simulation-time" style={{ marginLeft: 'auto' }}>
          <span className="time-label">T: </span>
          <span className="time-value">{(simulationTimeUs / 1000000).toFixed(3)}s</span>
        </div>
      </header>
    </div>
  );
}

export default App;