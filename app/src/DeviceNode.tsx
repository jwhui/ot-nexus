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

import { Handle, Position } from "reactflow";
import { useNexusStore, safeInvoke } from "./store";
import "./DeviceNode.css";

const EMPTY_ARRAY: string[] = [];

interface DeviceNodeData {
  role?: string;
  queueDepth?: number;
  queueDelay?: number;
  rloc16?: number;
  label?: string;
  lastPacketSent?: number;
  lastPacketReceived?: number;
  isEnabled?: boolean;
}

export function DeviceNode({ data, id }: { data: DeviceNodeData; id: string }) {
  const role = data.role || "Unknown";

  const activeFlashes = useNexusStore((s) => s.activeNodeFlashes[id] || EMPTY_ARRAY);
  const activeDraggingNodeId = useNexusStore((s) => s.activeDraggingNodeId);
  const setNodeEnabled = useNexusStore((s) => s.setNodeEnabled);
  const isSending = activeFlashes.length > 0;
  const isEnabled = data.isEnabled !== false;

  // Role initials for icon
  const getInitials = (r: string) => {
    switch (r.toLowerCase()) {
      case "leader": return "L";
      case "router": return "R";
      case "reed": return "RE";
      case "fed": return "F";
      case "med": return "M";
      case "sed": return "S";
      case "child": return "C";
      case "detached": return "D";
      default: return "?";
    }
  };

  return (
    <div 
      className={`device-node ${role.toLowerCase()} ${isSending ? "sending" : ""} ${!isEnabled ? "disabled-node" : ""}`}
      onContextMenu={async (e) => {
        e.preventDefault();
        const nextState = !isEnabled;
        setNodeEnabled(id, nextState);
        try {
          await safeInvoke("set_node_state", { nodeId: parseInt(id), enabled: nextState });
        } catch (err) {
          console.error("Failed to toggle node state:", err);
        }
      }}
    >
      {activeDraggingNodeId === id && (
        <>
          <div className="radio-range-ripple"></div>
          {["leader", "router", "reed"].includes(role.toLowerCase()) && (
            <div className="router-range-ripple"></div>
          )}
        </>
      )}
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      


      {activeFlashes.map((flashId) => (
        <div key={flashId} className="flash-ring sending"></div>
      ))}
      
      <div className="node-inner">
        <div className="node-icon">
          {getInitials(role)}
        </div>
        
        <div className="node-details">
          <div className="node-title">
            <span className="node-id">#{id}</span>
            <span className="node-role-badge" style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 'bold', background: 'var(--cyber-blue)', padding: '2px 6px', borderRadius: '4px' }}>{role}</span>
          </div>
          
          <div className="node-metrics">
            {data.rloc16 !== undefined && (
              <div className="metric-item">
                <span className="metric-icon">R</span>
                <span className="metric-val">0x{data.rloc16.toString(16).padStart(4, '0')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />
    </div>
  );
}
