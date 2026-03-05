"use client";

import { memo } from 'react';

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "synced";

interface EditorStatusBarProps {
  connectionStatus: ConnectionStatus;
  canUndoAI: boolean;
  canRedoAI: boolean;
  onUndoAI: () => void;
  onRedoAI: () => void;
}

export const EditorStatusBar = memo(({ 
  connectionStatus, 
  canUndoAI, 
  canRedoAI, 
  onUndoAI, 
  onRedoAI 
}: EditorStatusBarProps) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className={`h-2 w-2 rounded-full ${
        connectionStatus === "synced" ? "bg-green-500" :
        connectionStatus === "connected" ? "bg-yellow-500" :
        connectionStatus === "connecting" ? "bg-blue-500 animate-pulse" :
        "bg-gray-500"
      }`} />
      <span className="text-sm text-muted-foreground">
        {connectionStatus === "synced" ? "Synced & Ready" :
         connectionStatus === "connected" ? "Connected" :
         connectionStatus === "connecting" ? "Connecting..." :
         "Disconnected"}
      </span>
      
      {/* AI Undo/Redo Controls */}
      <div className="ml-auto flex gap-2">
        <button
          onClick={onUndoAI}
          disabled={!canUndoAI}
          className="rounded px-3 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          title="Undo all AI changes"
        >
          ⎌ Undo AI
        </button>
        <button
          onClick={onRedoAI}
          disabled={!canRedoAI}
          className="rounded px-3 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          title="Redo AI changes"
        >
          ⟲ Redo AI
        </button>
      </div>
    </div>
  );
});

EditorStatusBar.displayName = 'EditorStatusBar';
