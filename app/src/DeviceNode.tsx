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

import { useState } from "react";
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

export function DeviceNode({ data, id, selected }: { data: DeviceNodeData; id: string; selected?: boolean }) {
  const role = data.role || "Unknown";

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const activeFlashes = useNexusStore((s) => s.activeNodeFlashes[id] || EMPTY_ARRAY);
  const activeDraggingNodeId = useNexusStore((s) => s.activeDraggingNodeId);
  const setNodeEnabled = useNexusStore((s) => s.setNodeEnabled);
  const radioParameters = useNexusStore((s) => s.radioParameters);
  const isSending = activeFlashes.length > 0;
  const isEnabled = data.isEnabled !== false;

  let radioRadius = 1000; // Default fallback
  let routerRadius = 316; // Default fallback

  if (radioParameters) {
    const pathLossConstant = radioParameters.pathLossConstant ?? 40.0;
    const pathLossExponent = radioParameters.pathLossExponent ?? 20.0;
    const radioSensitivity = radioParameters.radioSensitivity ?? -100.0;
    const mleLinkRequestMarginMin = radioParameters.mleLinkRequestMarginMin ?? 10.0;
    
    const threshold = radioSensitivity + mleLinkRequestMarginMin;
    
    radioRadius = Math.pow(10, (-radioSensitivity - pathLossConstant) / pathLossExponent);
    routerRadius = Math.pow(10, (-threshold - pathLossConstant) / pathLossExponent);
    
    console.log(`Calculated radii for node ${id} - Radio: ${radioRadius}, Router: ${routerRadius}`);
  }

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
    >
      {(activeDraggingNodeId === id || selected) && (
        <>
          <div className="radio-range-ripple" style={{ width: `${radioRadius * 2}px`, height: `${radioRadius * 2}px`, marginTop: `-${radioRadius}px`, marginLeft: `-${radioRadius}px` }}></div>
          {["leader", "router", "reed"].includes(role.toLowerCase()) && (
            <div className="router-range-ripple" style={{ width: `${routerRadius * 2}px`, height: `${routerRadius * 2}px`, marginTop: `-${routerRadius}px`, marginLeft: `-${routerRadius}px` }}></div>
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
            <span className="node-menu-trigger" onClick={(e) => { e.stopPropagation(); setIsPopoverOpen(!isPopoverOpen); }} style={{ cursor: 'pointer', marginLeft: 'auto', padding: '0 4px' }}>⋮</span>
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

      {isPopoverOpen && (
        <div className="popover-menu">
          <button className="popover-item" onClick={async (e) => {
            e.stopPropagation();
            setIsPopoverOpen(false);
            const nextState = !isEnabled;
            setNodeEnabled(id, nextState);
            try {
              await safeInvoke("set_node_state", { nodeId: parseInt(id), enabled: nextState });
            } catch (err) {
              console.error("Failed to toggle node state:", err);
            }
          }}>
            {isEnabled ? "Disable" : "Enable"}
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />
    </div>
  );
}
