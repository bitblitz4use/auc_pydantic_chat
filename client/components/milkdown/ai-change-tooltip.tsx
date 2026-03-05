"use client";

import { memo } from 'react';
import { Sparkles, Undo2, Redo2, History, Clock } from 'lucide-react';
import { AIChange } from './hooks/use-ai-change-tracker';

interface AIChangeTooltipProps {
  changes: AIChange[];
  canUndo: boolean;
  canRedo: boolean;
  onUndoLast: () => void;
  onUndoAll: () => void;
  onRedo: () => void;
}

export const AIChangeTooltip = memo(({
  changes,
  canUndo,
  canRedo,
  onUndoLast,
  onUndoAll,
  onRedo
}: AIChangeTooltipProps) => {
  const activeChanges = changes.filter(c => c.undoable);
  const undoneChanges = changes.filter(c => !c.undoable);
  
  return (
    <div className="w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-popover-foreground">
          AI Changes
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {activeChanges.length} active
        </span>
      </div>
      
      {/* Change List */}
      <div className="max-h-48 overflow-y-auto space-y-2 mb-3 scrollbar-thin">
        {activeChanges.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No AI changes yet
          </div>
        ) : (
          activeChanges.map(change => (
            <div
              key={change.id}
              className="text-xs bg-muted/50 rounded p-2 space-y-1 border border-border/50"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-foreground">
                  {new Date(change.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {change.model && (
                <div className="text-muted-foreground">
                  Model: {change.model}
                </div>
              )}
              <div className="text-foreground">
                {change.changesCount} modification{change.changesCount > 1 ? 's' : ''}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onUndoLast}
          disabled={!canUndo}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="h-4 w-4" />
          Undo Last AI Change
        </button>
        
        {activeChanges.length > 1 && (
          <button
            onClick={onUndoAll}
            disabled={!canUndo}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <History className="h-4 w-4" />
            Undo All AI Changes
          </button>
        )}
        
        {undoneChanges.length > 0 && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 className="h-4 w-4" />
            Redo AI Change
          </button>
        )}
      </div>
    </div>
  );
});

AIChangeTooltip.displayName = 'AIChangeTooltip';
