"use client";

import ReactFlow, { ReactFlowProvider, type ReactFlowProps } from "reactflow";
import "reactflow/dist/style.css";

export function Canvas({ children, ...props }: ReactFlowProps) {
  return (
    <ReactFlowProvider>
      <ReactFlow
        {...props}
        panOnScroll
        selectionOnDrag
        panOnDrag={false}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{
          style: { strokeWidth: 2 },
        }}
      >
        {children}
      </ReactFlow>
    </ReactFlowProvider>
  );
}
