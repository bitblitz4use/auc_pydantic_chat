"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@/components/ai-elements/canvas";
import { Connection } from "@/components/ai-elements/connection";
import { Edge } from "@/components/ai-elements/edge";
import { Controls } from "@/components/ai-elements/controls";
import { Background, BackgroundVariant, ControlButton } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import { Plus, PlayCircle, Info, MessageSquare, Maximize2, Minimize2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PromptNode } from "@/components/chains/nodes/prompt-node";
import { AnnotationNode } from "@/components/chains/nodes/annotation-node";
import { FitViewOnActiveNode, FitViewOnFullscreenChange, ChainStepPanelContent } from "@/components/chains/chain-step-panel";
import type { ChainMetadata, ChainNode } from "@/lib/prompt-chains";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

const nodeTypes = {
  prompt: PromptNode,
  annotation: AnnotationNode,
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
  onSaveChain?: () => void;
  saving?: boolean;
}

export function ChainCanvas({ chain, onChainUpdate, onSaveChain, saving = false }: ChainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const orderedStepIds = useMemo(() => {
    const nodes = chain.canvas?.nodes ?? [];
    return nodes
      .filter((n): n is ChainNode & { type: "prompt" } => n.type === "prompt")
      .sort((a, b) => a.position.x - b.position.x)
      .map((n) => n.id);
  }, [chain.canvas?.nodes]);

  // Clear active node when it no longer exists in the chain (e.g. after delete or switch chain)
  useEffect(() => {
    if (!activeNodeId) return;
    const exists = (chain.canvas?.nodes ?? []).some((n) => n.id === activeNodeId);
    if (!exists) setActiveNodeId(null);
  }, [activeNodeId, chain.canvas?.nodes]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const handleSaveClick = useCallback(async () => {
    if (!onSaveChain) return;
    await onSaveChain();
  }, [onSaveChain]);

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
    const promptNodes = nodes.filter(n => n.type === 'prompt');
    const newNode: ChainNode = {
      id: `node-${Date.now()}`,
      type: 'prompt',
      data: {
        promptFile: '',
        label: `Step ${promptNodes.length + 1}`,
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

  // Add new annotation node to canvas
  const addAnnotationNode = useCallback(() => {
    const nodes = chain.canvas?.nodes || [];
    const newNode: ChainNode = {
      id: `annotation-${Date.now()}`,
      type: 'annotation',
      data: {
        title: 'Note',
        comment: '',
      },
      position: {
        x: 150 + (nodes.length * 30),
        y: 100 + (nodes.length * 30),
      },
      style: {
        width: 300,
        height: 200,
        zIndex: -1,  // Place behind other nodes by default
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

  const onNodeClick = useCallback((_: unknown, node: { id: string; type?: string }) => {
    if (node.type === "prompt") {
      setActiveNodeId((prev) => (prev === node.id ? null : node.id));
    }
  }, []);

  const handleUpdateNodePromptFile = useCallback(
    (nodeId: string, promptFile: string) => {
      const updatedNodes = (chain.canvas?.nodes || []).map((n) =>
        n.id === nodeId && n.type === "prompt"
          ? { ...n, data: { ...n.data, promptFile } }
          : n
      );
      onChainUpdate({ ...chain, canvas: { ...chain.canvas, nodes: updatedNodes } });
    },
    [chain, onChainUpdate]
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      const updatedNodes = (chain.canvas?.nodes || []).map((n) =>
        n.id === nodeId ? { ...n, data: newData } : n
      );
      onChainUpdate({ ...chain, canvas: { ...chain.canvas, nodes: updatedNodes } });
    },
    [chain, onChainUpdate]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const updatedNodes = (chain.canvas?.nodes || []).filter((n) => n.id !== nodeId);
      const updatedEdges = (chain.canvas?.edges || []).filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );
      onChainUpdate({
        ...chain,
        canvas: { ...chain.canvas, nodes: updatedNodes, edges: updatedEdges },
      });
      setActiveNodeId((current) => (current === nodeId ? null : current));
    },
    [chain, onChainUpdate]
  );

  // Inject update, delete, and isActive into all nodes
  const nodesWithHandlers = (chain.canvas?.nodes || []).map((node) => ({
    ...node,
    data: {
      ...node.data,
      isActive: activeNodeId === node.id,
      onUpdate: (nodeId: string, newData: any) => {
        const updatedNodes = (chain.canvas?.nodes || []).map((n) =>
          n.id === nodeId ? { ...n, data: newData } : n
        );
        onChainUpdate({
          ...chain,
          canvas: { ...chain.canvas, nodes: updatedNodes },
        });
      },
      onDelete: (nodeId: string) => {
        const updatedNodes = (chain.canvas?.nodes || []).filter((n) => n.id !== nodeId);
        const updatedEdges = (chain.canvas?.edges || []).filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        );
        onChainUpdate({
          ...chain,
          canvas: { ...chain.canvas, nodes: updatedNodes, edges: updatedEdges },
        });
        if (activeNodeId === nodeId) setActiveNodeId(null);
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
    <div ref={containerRef} className="relative w-full h-full bg-background">
      {/* AI Elements Canvas with Connection component */}
      <Canvas
        nodes={nodesWithHandlers}
        edges={edgesForCanvas}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineComponent={Connection}
        fitView={hasNodes}
        panOnDrag={true}
        selectionOnDrag={false}
        defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
        minZoom={0.3}
        maxZoom={1.5}
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.0,
        }}
      >
        {/* Override default background with visible dots */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="var(--muted-foreground)"
        />
        <Controls showInteractive={false}>
          <ControlButton
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </ControlButton>
        </Controls>
        <FitViewOnActiveNode activeNodeId={activeNodeId} />
        <FitViewOnFullscreenChange />
      </Canvas>

      {/* Step panel: outside React Flow so it doesn't break edges/controls */}
      {activeNodeId && (
        <div className="absolute bottom-4 right-4 z-10">
          <ChainStepPanelContent
            activeNodeId={activeNodeId}
            orderedStepIds={orderedStepIds}
            chain={chain}
            onActiveNodeChange={setActiveNodeId}
            onUpdateNodePromptFile={handleUpdateNodePromptFile}
            onUpdateNodeData={handleUpdateNodeData}
            onDeleteNode={handleDeleteNode}
          />
        </div>
      )}

      {/* Floating toolbar - left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={addNode} size="sm" className="shadow-lg">
          <Plus className="mr-2 size-4" />
          Add Step
        </Button>
        
        <Button onClick={addAnnotationNode} variant="outline" size="sm" className="shadow-lg">
          <MessageSquare className="mr-2 size-4" />
          Add Note
        </Button>
        
        {hasNodes && (
          <Button variant="outline" size="sm" className="shadow-lg" disabled>
            <PlayCircle className="mr-2 size-4" />
            Test Run
          </Button>
        )}
      </div>

      {/* Floating toolbar - right: Save Chain */}
      {onSaveChain && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            onClick={handleSaveClick}
            disabled={saving}
            size="sm"
            className="shadow-lg"
          >
            {saving ? (
              <>
                <Spinner className="mr-2 size-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" />
                Save Chain
              </>
            )}
          </Button>
        </div>
      )}

      {/* Empty state instructions */}
      {!hasNodes && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
          <Alert className="max-w-md pointer-events-auto shadow-lg">
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">Build Your Prompt Chain</p>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Click "Add Step" to create prompt nodes</li>
                <li>Click a step to configure it in the panel</li>
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
