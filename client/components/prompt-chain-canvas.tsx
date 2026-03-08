"use client";

import { useCallback } from "react";
import { Canvas } from "@/components/ui/canvas";
import { Background, Controls, MiniMap, BackgroundVariant } from "reactflow";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "reactflow";
import { Plus, PlayCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptNode } from "@/components/chain-nodes/prompt-node";
import type { ChainMetadata, ChainNode } from "@/lib/prompt-chains";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

const nodeTypes = {
  prompt: PromptNode,
};

const defaultEdgeOptions = {
  animated: true,
  style: { 
    stroke: 'hsl(var(--primary))', 
    strokeWidth: 2 
  },
  type: 'smoothstep',
};

interface PromptChainCanvasProps {
  chain: ChainMetadata;
  onChainUpdate: (updated: ChainMetadata) => void;
}

export function PromptChainCanvas({ chain, onChainUpdate }: PromptChainCanvasProps) {
  // Handle node position/selection changes
  const onNodesChange = useCallback((changes: any) => {
    const updatedNodes = applyNodeChanges(changes, chain.canvas.nodes);
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, nodes: updatedNodes },
    });
  }, [chain, onChainUpdate]);

  // Handle edge changes (deletions, selections)
  const onEdgesChange = useCallback((changes: any) => {
    const updatedEdges = applyEdgeChanges(changes, chain.canvas.edges);
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, edges: updatedEdges },
    });
  }, [chain, onChainUpdate]);

  // Connect nodes by dragging from handle to handle
  const onConnect = useCallback((connection: any) => {
    const newEdges = addEdge(
      { ...connection, ...defaultEdgeOptions },
      chain.canvas.edges
    );
    onChainUpdate({
      ...chain,
      canvas: { ...chain.canvas, edges: newEdges },
    });
  }, [chain, onChainUpdate]);

  // Add new prompt node to canvas
  const addNode = useCallback(() => {
    const newNode: ChainNode = {
      id: `node-${Date.now()}`,
      type: 'prompt',
      data: {
        promptFile: '',
        label: `Step ${chain.canvas.nodes.length + 1}`,
        model: 'gpt-4',
        description: '',
        onUpdate: (nodeId: string, newData: any) => {
          const updatedNodes = chain.canvas.nodes.map(n =>
            n.id === nodeId ? { ...n, data: newData } : n
          );
          onChainUpdate({
            ...chain,
            canvas: { ...chain.canvas, nodes: updatedNodes },
          });
        },
      },
      position: {
        x: 100 + (chain.canvas.nodes.length * 50),
        y: 150 + (chain.canvas.nodes.length * 50),
      },
    };

    onChainUpdate({
      ...chain,
      canvas: {
        ...chain.canvas,
        nodes: [...chain.canvas.nodes, newNode],
      },
    });
  }, [chain, onChainUpdate]);

  // Inject update handler into all nodes
  const nodesWithHandlers = chain.canvas.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      onUpdate: (nodeId: string, newData: any) => {
        const updatedNodes = chain.canvas.nodes.map(n =>
          n.id === nodeId ? { ...n, data: newData } : n
        );
        onChainUpdate({
          ...chain,
          canvas: { ...chain.canvas, nodes: updatedNodes },
        });
      },
    },
  }));

  const hasNodes = chain.canvas.nodes.length > 0;

  return (
    <div className="relative w-full h-full">
      {/* React Flow Canvas */}
      <Canvas
        nodes={nodesWithHandlers}
        edges={chain.canvas.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView={hasNodes}
        className="bg-background"
      >
        {/* Dot grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--muted-foreground) / 0.15)"
        />
        
        {/* Zoom/pan controls */}
        <Controls 
          className="bg-card border border-border rounded-lg shadow-lg"
          showInteractive={false}
        />
        
        {/* Minimap */}
        <MiniMap
          className="bg-card border border-border rounded-lg shadow-lg"
          maskColor="hsl(var(--background) / 0.8)"
          nodeColor="hsl(var(--primary))"
          pannable
          zoomable
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

      {/* Node count indicator */}
      {hasNodes && (
        <div className="absolute bottom-4 left-4 z-10 bg-card border border-border rounded-lg shadow-lg px-3 py-1.5 text-xs text-muted-foreground">
          {chain.canvas.nodes.length} step{chain.canvas.nodes.length !== 1 ? 's' : ''} · {chain.canvas.edges.length} connection{chain.canvas.edges.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
