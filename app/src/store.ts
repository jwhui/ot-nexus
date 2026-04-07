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

import { create } from "zustand";
import { Node, Edge, applyNodeChanges, NodeChange } from "reactflow";
import { invoke } from "@tauri-apps/api/core";

interface Packet {
  id: string;
  source: string;
  destination: string;
  protocol: string;
  summary: string;
  timestamp: string;
}

export interface SimulationEvent {
  timestamp_us: number;
  event?: {
    NodeUpdate?: {
      node_id: number;
      role: string;
      queue_depth: number;
      queue_delay_us: number;
      rloc16?: number;
      x?: number;
      y?: number;
    };
    LinkUpdate?: {
      source_node_id: number;
      destination_node_id: number;
      is_active: boolean;
      link_quality: number;
    };
    PacketCaptured?: {
      source_node_id: number;
      destination_node_id: number;
      protocol: string;
      summary: string;
      raw_payload: string;
      decoded_info: string;
    };
  };
}

interface NexusState {
  mode: "live" | "playback";
  setMode: (mode: "live" | "playback") => void;
  
  nodes: Node[];
  edges: Edge[];
  activeTransmissions: Record<string, string[]>;
  activeNodeFlashes: Record<string, string[]>;
  totalSends: Record<string, number>;
  simulationTimeUs: number;
  onNodesChange: (changes: NodeChange[]) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeRole: (nodeId: string, role: string) => void;
  setNodeEnabled: (nodeId: string, isEnabled: boolean) => void;
  baseTimeUs: number | null;
  packets: Packet[];
  addPacket: (packet: Packet) => void;
  clearPackets: () => void;
  
  selectedPacket: Packet | null;
  selectPacket: (packet: Packet | null) => void;

  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  simulationSpeed: number;
  unpausedSpeed: number;
  setUnpausedSpeed: (speed: number) => void;
  setSimulationSpeed: (speed: number) => void;
  timelineProgress: number; // 0 to 100
  setTimelineProgress: (progress: number) => void;

  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  loadingProgress: number;
  activeDraggingNodeId: string | null;
  setActiveDraggingNodeId: (nodeId: string | null) => void;
  resetState: () => void;
  handleSimulationEvent: (event: SimulationEvent) => void;
  hasInitialized: boolean;
  setHasInitialized: (val: boolean) => void;
  createDefaultTopology: () => Promise<void>;
  radioParameters: {
    pathLossConstant: number;
    pathLossExponent: number;
    radioSensitivity: number;
    mleLinkRequestMarginMin: number;
  } | null;
  setRadioParameters: (params: { pathLossConstant: number; pathLossExponent: number; radioSensitivity: number; mleLinkRequestMarginMin: number; }) => void;
}

const checkIsTauri = () => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
const isTauri = checkIsTauri();

let worker: Worker | null = null;

if (!isTauri && typeof window !== 'undefined') {
  const win = window as any;
  if (!win.__NEXUS_WORKER__) {
    console.log("Creating Simulator Worker in store.ts");
    win.__NEXUS_WORKER__ = new Worker(new URL('./simulator.worker.ts', import.meta.url), { type: 'module' });
  }
  worker = win.__NEXUS_WORKER__;
}

function setupWorker(w: Worker) {
  w.onmessage = (e) => {
    const { type, event } = e.data;
    if (type === 'event') {
      useNexusStore.getState().handleSimulationEvent(event);
    } else if (type === 'loaded') {
      w.postMessage({ type: 'start', data: { intervalMs: 100 } });
      useNexusStore.setState({ isConnected: true });
    } else if (type === 'progress') {
      useNexusStore.setState({ loadingProgress: e.data.progress });
    }
  };
  w.postMessage({ type: 'init' });
}

if (worker && !(window as any).__NEXUS_WORKER_SETUP__) {
  (window as any).__NEXUS_WORKER_SETUP__ = true;
  setupWorker(worker);
}

export async function safeInvoke(command: string, args?: any) {
  if (isTauri) {
    console.log(`[Store] Tauri invoke: ${command}`, args);
    return await invoke(command, args);
  } else {
    console.log(`[Store] Wasm Mode Intercepted invoke: ${command}`, args);
    if (command === "reset_simulator") {
      if (worker) {
        worker.postMessage({ type: 'stop' });
        worker.terminate();
      }
      console.log("Recreating worker for reset...");
      worker = new Worker(new URL('./simulator.worker.ts', import.meta.url), { type: 'module' });
      (window as any).__NEXUS_WORKER__ = worker;
      setupWorker(worker);
      return null;
    }

    if (worker) {
      const currentWorker = worker;
      const requestId = Math.random().toString(36).substring(2);
      currentWorker.postMessage({ type: 'command', data: { command, args, requestId } });

      return new Promise((resolve, reject) => {
        const handleMessage = (e: MessageEvent) => {
          const { type, requestId: respId, result, error } = e.data;
          console.log(`[Store] Received message from worker:`, e.data);
          if (type === 'command_result' && respId === requestId) {
            currentWorker.removeEventListener('message', handleMessage);
            if (error) {
              reject(new Error(error));
            } else {
              resolve(result);
            }
          }
        };
        currentWorker.addEventListener('message', handleMessage);
      });
    }
    return null;
  }
}

export const useNexusStore = create<NexusState>((set) => ({
  mode: "live",
  setMode: (mode) => set({ mode }),
  radioParameters: null,
  setRadioParameters: (radioParameters) => set({ radioParameters }),

  hasInitialized: false,
  setHasInitialized: (hasInitialized) => set({ hasInitialized }),

  nodes: [],
  edges: [],
  activeTransmissions: {},
  activeNodeFlashes: {},
  totalSends: {},
  baseTimeUs: null,
  simulationTimeUs: 0,
  onNodesChange: (changes) => set((state) => {
    console.log("[UI] onNodesChange called with changes:", changes);
    changes.forEach(change => {
      if (change.type === 'position' && 'position' in change && change.position) {
        if (isTauri) {
          safeInvoke("set_node_position", {
            nodeId: parseInt(change.id),
            x: change.position.x,
            y: change.position.y
          });
        } else {
          const worker = (window as any).__NEXUS_WORKER__;
          console.log("[UI] worker found:", !!worker);
          if (worker) {
            worker.postMessage({
              type: 'set_node_position',
              id: parseInt(change.id),
              x: change.position.x,
              y: change.position.y
            });
          }
        }
      }
    });
    return {
      nodes: applyNodeChanges(changes, state.nodes),
      };
    }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  updateNodeRole: (nodeId, role) => set((state) => ({
    nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, label: `${role} (Node ${nodeId})` } } : node)
  })),
  setNodeEnabled: (nodeId, isEnabled) => set((state) => ({
    nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, isEnabled } } : node)
  })),

  packets: [],
  addPacket: (packet) => set((state) => ({ packets: [packet, ...state.packets] })),
  clearPackets: () => set({ packets: [] }),

  selectedPacket: null,
  selectPacket: (selectedPacket) => set({ selectedPacket }),

  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  simulationSpeed: 0,
  unpausedSpeed: 32,
  setUnpausedSpeed: (unpausedSpeed) => set({ unpausedSpeed }),
  setSimulationSpeed: async (simulationSpeed) => {
    set(() => {
      if (simulationSpeed > 0) {
        return { simulationSpeed, unpausedSpeed: simulationSpeed };
      }
      return { simulationSpeed };
    });
    try {
      if (worker) {
        // We need to implement 'speed' command in worker!
        // For now, just log it or implement it!
        // Let's implement it in worker too!
        worker.postMessage({ type: 'speed', data: { speed: simulationSpeed } });
      } else {
        await invoke("set_simulation_speed", { speed: simulationSpeed });
      }
    } catch (e) {
      console.error("Failed to set simulation speed:", e);
    }
  },
  timelineProgress: 0,
  setTimelineProgress: (timelineProgress) => set({ timelineProgress }),

  isConnected: false,
  setIsConnected: (isConnected) => set({ isConnected }),
  loadingProgress: 0,
  
  activeDraggingNodeId: null,
  setActiveDraggingNodeId: (activeDraggingNodeId) => set({ activeDraggingNodeId }),

  resetState: () => set(() => ({
    nodes: [],
    edges: [],
    packets: [],
    activeTransmissions: {},
    activeNodeFlashes: {},
    selectedPacket: null,
    isPlaying: false,
    timelineProgress: 0,
    baseTimeUs: null,
    simulationTimeUs: 0,
    simulationSpeed: 0,
    hasInitialized: false,
    radioParameters: null,
  })),

  createDefaultTopology: async () => {
    console.log("Initializing topology with 3 FTDs, 1 FED, 1 MED, 1 SED...");
    try {
      const params = await safeInvoke("get_radio_parameters");
      console.log("Fetched radio parameters:", params);
      useNexusStore.setState({ radioParameters: params as any });
    } catch (err) {
      console.error("Failed to fetch radio parameters:", err);
    }
    const leaderId = await safeInvoke("create_node", { x: 350, y: 50 });
    const router1Id = await safeInvoke("create_node", { x: 125, y: 440 });
    const router2Id = await safeInvoke("create_node", { x: 575, y: 440 });
    const fedId = await safeInvoke("create_node", { x: 350, y: 750 });
    const medId = await safeInvoke("create_node", { x: 100, y: -150 });
    const sedId = await safeInvoke("create_node", { x: 600, y: -150 });

    await safeInvoke("form_network", { nodeId: leaderId });
    await safeInvoke("join_network", { nodeId: fedId, targetNodeId: leaderId, mode: "fed" });
    await safeInvoke("join_network", { nodeId: medId, targetNodeId: leaderId, mode: "med" });
    await safeInvoke("join_network", { nodeId: sedId, targetNodeId: leaderId, mode: "sed" });
    await safeInvoke("join_network", { nodeId: router1Id, targetNodeId: leaderId, mode: "ftd" });
    await safeInvoke("join_network", { nodeId: router2Id, targetNodeId: leaderId, mode: "ftd" });
    
    useNexusStore.getState().setHasInitialized(true);
  },

  handleSimulationEvent: (event) => {
    set((state) => {
      const currentUs = Number(event.timestamp_us);
      if (state.simulationSpeed === 0) {
        // Keep time steady while paused, shift base anchor
        return { 
          baseTimeUs: currentUs - state.simulationTimeUs, 
          simulationTimeUs: state.simulationTimeUs 
        };
      }

      const baseTimeUs = state.baseTimeUs === null ? currentUs : state.baseTimeUs;
      return {
        baseTimeUs,
        simulationTimeUs: Math.max(0, currentUs - baseTimeUs),
      };
    });

    if (!event.event) return;

    if (event.event.NodeUpdate) {
      const update = event.event.NodeUpdate;
      console.log("NodeUpdate received:", update);
      
      const roleMap: Record<number, string> = {
        0: "Unknown",
        1: "Disabled",
        2: "Detached",
        3: "Child",
        4: "Router",
        5: "Leader",
        6: "REED",
        7: "FED",
        8: "MED",
        9: "SED",
      };
      const roleStr = typeof update.role === 'number' ? roleMap[update.role] : (update.role || "Unknown");

      set((state) => {
        const nodeExists = state.nodes.some((n) => n.id === update.node_id.toString());
        if (nodeExists) {
          const isDetached = roleStr === "Detached" || roleStr === "detached";
          return {
            nodes: state.nodes.map((n) =>
              n.id === update.node_id.toString()
                ? {
                    ...n,
                    position: state.activeDraggingNodeId !== update.node_id.toString() 
                      && update.x !== undefined && update.y !== undefined && (update.x !== 0 || update.y !== 0)
                      ? { x: update.x, y: update.y }
                      : n.position,
                    data: {
                      ...n.data,
                      role: isDetached ? "Detached" : roleStr,
                      label: `${isDetached ? "Detached" : roleStr} (Node ${n.id})`,
                      queueDepth: update.queue_depth,
                      queueDelay: update.queue_delay_us,
                      rloc16: update.rloc16,
                    },
                  }
                : n
            ),
          };
        } else {
          const index = state.nodes.length;
          const col = index % 4;
          const row = Math.floor(index / 4);
          const startX = update.x !== undefined && update.x !== 0 ? update.x : 100 + col * 250;
          const startY = update.y !== undefined && update.y !== 0 ? update.y : 100 + row * 200;
          const newNode: Node = {
            id: update.node_id.toString(),
            type: "device",
            data: {
              label: `${roleStr} (Node ${update.node_id})`,
              role: roleStr,
              queueDepth: update.queue_depth,
              queueDelay: update.queue_delay_us,
              rloc16: update.rloc16,
            },
            position: { x: startX, y: startY },
          };
          return { nodes: [...state.nodes, newNode] };
        }
      });
    } else if (event.event.LinkUpdate) {
      const update = event.event.LinkUpdate;
      console.log("LinkUpdate received:", update);
      set((state) => {
        const sourceStr = update.source_node_id.toString();
        const destStr = update.destination_node_id.toString();

        const existingEdge = state.edges.find(
          (e) => (e.source === sourceStr && e.target === destStr) || (e.source === destStr && e.target === sourceStr)
        );

        if (existingEdge) {
          const currentDirs = existingEdge.data?.activeDirections || {};
          const nextDirs = { ...currentDirs, [sourceStr]: update.is_active };
          
          // If both directions are dead, completely remove the edge
          const isSourceActive = nextDirs[sourceStr];
          const isDestActive = nextDirs[destStr];
          if (!isSourceActive && !isDestActive) {
            return {
              edges: state.edges.filter((e) => e.id !== existingEdge.id),
            };
          }
          
          return {
            edges: state.edges.map((e) =>
              e.id === existingEdge.id ? { ...e, animated: false, data: { ...e.data, isTemporary: false, activeDirections: nextDirs } } : e
            ),
          };
        } else {
          if (!update.is_active) {
            return state; // Ignore inactive reports for edges that do not exist
          }
          const newEdge = {
            id: `e${sourceStr}-${destStr}`,
            source: sourceStr,
            target: destStr,
            type: "packet",
            animated: false,
            data: {
              activeDirections: { [sourceStr]: true },
            },
          };
          return { edges: [...state.edges, newEdge] };
        }
      });
    } else if (event.event.PacketCaptured) {
      const update = event.event.PacketCaptured;
      set((state) => {
        const sourceId = update.source_node_id.toString();
        const destId = update.destination_node_id.toString();
        const edgeId = `e${sourceId}-${destId}`;
        const reverseEdgeId = `e${destId}-${sourceId}`;

        const edgeExists = state.edges.some((e) => e.id === edgeId);
        const reverseEdgeExists = state.edges.some((e) => e.id === reverseEdgeId);
        const targetEdgeId = edgeExists ? edgeId : (reverseEdgeExists ? reverseEdgeId : edgeId);

        // Create temporary edge if it does not exist to show packets
        const shouldCreateEdge = !edgeExists && !reverseEdgeExists;

        const tId = Math.random().toString();
        const finalTransmissionId = edgeExists ? tId : `${tId}_r`;

        const flashId = `f_${Date.now()}_${Math.random()}`;

        setTimeout(() => {
          set((s) => ({
            activeNodeFlashes: {
              ...s.activeNodeFlashes,
              [sourceId]: (s.activeNodeFlashes[sourceId] || []).filter((id) => id !== flashId),
            },
          }));
        }, 500);

        if (edgeExists || reverseEdgeExists || shouldCreateEdge) {
          setTimeout(() => {
            set((s) => {
              const current = s.activeTransmissions[targetEdgeId] || [];
              const updatedTransmissions = current.filter((id) => id !== tId && id !== `${tId}_r`);
              
              const newState: Partial<NexusState> = {
                activeTransmissions: {
                  ...s.activeTransmissions,
                  [targetEdgeId]: updatedTransmissions,
                },
              };

              const edge = s.edges.find((e) => e.id === targetEdgeId);
              const activeDirs = edge?.data?.activeDirections || {};
              const hasNeighborLink = activeDirs[sourceId] || activeDirs[destId];

              if (updatedTransmissions.length === 0) {
                if (edge?.data?.isTemporary || !hasNeighborLink) {
                  newState.edges = s.edges.filter((e) => e.id !== targetEdgeId);
                }
              }

              return newState;
            });
          }, 500);
        }

        return {
          edges: shouldCreateEdge
            ? [
                ...state.edges,
                {
                  id: targetEdgeId,
                  source: sourceId,
                  target: destId,
                  type: "packet",
                  animated: false,
                  data: { isTemporary: true },
                },
              ]
            : state.edges,
          activeNodeFlashes: {
            ...state.activeNodeFlashes,
            [sourceId]: [...(state.activeNodeFlashes[sourceId] || []), flashId],
          },
          totalSends: {
            ...state.totalSends,
            [sourceId]: (state.totalSends[sourceId] || 0) + 1,
          },
          activeTransmissions: (edgeExists || reverseEdgeExists || shouldCreateEdge)
            ? {
                ...state.activeTransmissions,
                [targetEdgeId]: [...(state.activeTransmissions[targetEdgeId] || []), finalTransmissionId],
              }
            : state.activeTransmissions,
          packets: [
            {
              id: Math.random().toString(),
              source: update.source_node_id.toString(),
              destination: update.destination_node_id.toString(),
              protocol: update.protocol,
              summary: update.summary,
              timestamp: (event.timestamp_us / 1000000).toFixed(3),
            },
            ...state.packets,
          ],
        };
      });
    }
  },
}));



(window as any).useNexusStore = useNexusStore;
