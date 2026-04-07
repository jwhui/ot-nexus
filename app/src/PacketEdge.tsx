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

import { useEffect } from "react";
import { getStraightPath, EdgeProps } from "reactflow";
import { useNexusStore } from "./store";

const EMPTY_ARRAY: string[] = [];



export function PacketEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
}: EdgeProps) {
  const transmissions = useNexusStore((s) => s.activeTransmissions[id] || EMPTY_ARRAY);
  const edge = useNexusStore((s) => s.edges.find((e) => e.id === id));

  useEffect(() => {
    console.log("PacketEdge Mount:", id);
    return () => console.log("PacketEdge Unmount:", id);
  }, [id]);

  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const activeDirections = edge?.data?.activeDirections || {};
  // Bidirectional if both nodes have reported the link as active
  const isBidirectional = Object.values(activeDirections).filter(Boolean).length >= 2;

  const edgeStyle = {
    ...style,
    strokeDasharray: isBidirectional ? 'none' : '5,5',
  };

  return (
    <g>
      <path
        id={`edge-${id}`}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
      />

      {transmissions.map((tId: string) => {
        const path = tId.endsWith("_r") ? `M ${targetX} ${targetY} L ${sourceX} ${sourceY}` : edgePath;

        return (
          <circle
            key={tId}
            cx={0}
            cy={0}
            r="5"
            fill="#38bdf8"
            className="packet-dot"
            style={{ 
              offsetPath: `path("${path}")`
            }}
          />
        );
      })}
    </g>
  );
}
