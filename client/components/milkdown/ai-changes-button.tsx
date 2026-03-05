"use client";

import { memo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AIChangeTooltip } from './ai-change-tooltip';
import { AIChange } from './hooks/use-ai-change-tracker';

interface AIChangesButtonProps {
  changes: AIChange[];
  canUndo: boolean;
  canRedo: boolean;
  onUndoLast: () => void;
  onUndoAll: () => void;
  onRedo: () => void;
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
}

export const AIChangesButton = memo(({
  changes,
  canUndo,
  canRedo,
  onUndoLast,
  onUndoAll,
  onRedo,
  onAccept,
  onReject
}: AIChangesButtonProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const pendingChanges = changes.filter(c => c.status === 'pending');
  const activeCount = pendingChanges.length;
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${activeCount > 0 
            ? 'bg-accent text-accent-foreground hover:bg-accent/80' 
            : 'bg-muted text-muted-foreground cursor-default'
          }
        `}
        disabled={activeCount === 0}
      >
        <Sparkles className="h-4 w-4" />
        AI Changes
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
            {activeCount}
          </span>
        )}
      </button>
      
      {showTooltip && activeCount > 0 && (
        <div className="absolute top-full mt-2 right-0 z-50">
          <AIChangeTooltip
            changes={changes}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndoLast={onUndoLast}
            onUndoAll={onUndoAll}
            onRedo={onRedo}
            onAccept={onAccept}
            onReject={onReject}
          />
        </div>
      )}
      
      {/* Backdrop to close tooltip */}
      {showTooltip && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowTooltip(false)}
        />
      )}
    </div>
  );
});

AIChangesButton.displayName = 'AIChangesButton';
