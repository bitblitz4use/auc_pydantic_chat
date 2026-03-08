"use client";

import { useCallback } from "react";
import { Canvas } from "@/components/ai-elements/canvas";
import { Connection } from "@/components/ai-elements/connection";
import { Edge } from "@/components/ai-elements/edge";
import { Controls } from "@/components/ai-elements/controls";
import { Background, BackgroundVariant } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import { Plus, PlayCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptNode } from "@/components/chains/nodes/prompt-node";
import type { ChainMetadata, ChainNode } from "@/lib/prompt-chains";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

const nodeTypes = {
  prompt: PromptNode,
};

const edgeTypes = {
  default: Edge.Animated,
  smoothstep: Edge.Animated,
};

const defaultEdgeOptions = {
  animated: true,
  style: { 
    stroke: 'hsl(var(--primary))', 
    strokeWidth: 2 
  },
  type: 'smoothstep',
};

interface ChainCanvasProps {
  chain: ChainMetadata;
  onChainUpdate: (updated: ChainMetadata) => void;
}

export function ChainCanvas({ chain, onChainUpdate }: ChainCanvasProps) {
  // Handle node position/selection changes
  const onNodesChange = useCallback((changes: any) => {
    const updatedNodes = applyNodeChanges(changes, chain.canvas?.nodes || []);
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, nodes: updatedNodes },
    });
  }, [chain, onChainUpdate]);

  // Handle edge changes (deletions, selections)
  const onEdgesChange = useCallback((changes: any) => {
    const updatedEdges = applyEdgeChanges(changes, chain.canvas?.edges || []);
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, edges: updatedEdges },
    });
  }, [chain, onChainUpdate]);

  // Connect nodes by dragging from handle to handle
  const onConnect = useCallback((connection: any) => {
    const newEdges = addEdge(
      { ...connection, ...defaultEdgeOptions },
      chain.canvas?.edges || []
    );
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, edges: newEdges },
    });
  }, [chain, onChainUpdate]);

  // Add new prompt node to canvas
  const addNode = useCallback(() => {
    const nodes = chain.canvas?.nodes || [];
    const newNode: ChainNode = {
      id: `node-${Date.now()}`,
      type: 'prompt',
      data: {
        promptFile: '',
        label: `Step ${nodes.length + 1}`,
        model: '',
        description: '',
      },
      position: {
        x: 100 + (nodes.length * 50),
        y: 150 + (nodes.length * 50),
      },
    };

    onChainUpdate({
      ...chain,
      canvas: {
        ...chain.canvas,
        nodes: [...nodes, newNode],
      },
    });
  }, [chain, onChainUpdate]);

  // Inject update and delete handlers into all nodes
  const nodesWithHandlers = (chain.canvas?.nodes || []).map(node => ({
    ...node,
    data: {
      ...node.data,
      onUpdate: (nodeId: string, newData: any) => {
        const updatedNodes = (chain.canvas?.nodes || []).map(n =>
          n.id === nodeId ? { ...n, data: newData } : n
        );
        onChainUpdate({
          ...chain,
          canvas: { ...chain.canvas, nodes: updatedNodes },
        });
      },
      onDelete: (nodeId: string) => {
        const updatedNodes = (chain.canvas?.nodes || []).filter(n => n.id !== nodeId);
        // Also remove connected edges
        const updatedEdges = (chain.canvas?.edges || []).filter(
          e => e.source !== nodeId && e.target !== nodeId
        );
        onChainUpdate({
          ...chain,
          canvas: { ...chain.canvas, nodes: updatedNodes, edges: updatedEdges },
        });
      },
    },
  }));

  const hasNodes = (chain.canvas?.nodes || []).length > 0;

  // Ensure edges have proper format for React Flow rendering
  const edgesForCanvas = (chain.canvas?.edges || []).map(edge => ({
    id: edge.id || `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    style: {
      stroke: '#6b7280',
      strokeWidth: 2,
    },
  }));

  return (
    <div className="relative w-full h-full">
      {/* AI Elements Canvas with Connection component */}
      <Canvas
        nodes={nodesWithHandlers}
        edges={edgesForCanvas}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineComponent={Connection}
        fitView={hasNodes}
        panOnDrag={true}
        selectionOnDrag={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
        minZoom={0.3}
        maxZoom={1.5}
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 0.85,
        }}
      >
        {/* Override default background with visible dots */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="#666666"
        />
        
        {/* Zoom/pan controls */}
        <Controls 
          showInteractive={false}
        />
      </Canvas>

      {/* Floating toolbar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={addNode} size="sm" className="shadow-lg">
          <Plus className="mr-2 size-4" />
          Add Step
        </Button>
        
        {hasNodes && (
          <Button variant="outline" size="sm" className="shadow-lg" disabled>
            <PlayCircle className="mr-2 size-4" />
            Test Run
          </Button>
        )}
      </div>

      {/* Empty state instructions */}
      {!hasNodes && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
          <Alert className="max-w-md pointer-events-auto shadow-lg">
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">Build Your Prompt Chain</p>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Click "Add Step" to create prompt nodes</li>
                <li>Click the ⚙️ icon to configure each step</li>
                <li>Drag from bottom ● to top ● to connect steps</li>
                <li>Press Delete/Backspace to remove nodes or edges</li>
              </ol>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
