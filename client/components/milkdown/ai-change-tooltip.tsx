"use client";

import { memo } from 'react';
import { Sparkles, Undo2, Redo2, History, Clock, Check, X } from 'lucide-react';
import { AIChange } from './hooks/use-ai-change-tracker';

interface AIChangeTooltipProps {
  changes: AIChange[];
  canUndo: boolean;
  canRedo: boolean;
  onUndoLast: () => void;
  onUndoAll: () => void;
  onRedo: () => void;
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
}

export const AIChangeTooltip = memo(({
  changes,
  canUndo,
  canRedo,
  onUndoLast,
  onUndoAll,
  onRedo,
  onAccept,
  onReject
}: AIChangeTooltipProps) => {
  const pendingChanges = changes.filter(c => c.status === 'pending');
  const acceptedChanges = changes.filter(c => c.status === 'accepted');
  const rejectedChanges = changes.filter(c => c.status === 'rejected');
  
  return (
    <div className="w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-popover-foreground">
          AI Changes
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {pendingChanges.length} pending
        </span>
      </div>
      
      {/* Change List */}
      <div className="max-h-64 overflow-y-auto space-y-2 mb-3 scrollbar-thin">
        {pendingChanges.length === 0 && acceptedChanges.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No AI changes yet
          </div>
        ) : (
          <>
            {/* Pending Changes */}
            {pendingChanges.map(change => (
              <div
                key={change.id}
                className="text-xs bg-amber-500/10 rounded p-2 space-y-2 border border-amber-500/30"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-amber-600" />
                  <span className="text-foreground font-medium">
                    {new Date(change.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="ml-auto text-xs text-amber-600 font-semibold">
                    PENDING
                  </span>
                </div>
                {change.model && (
                  <div className="text-muted-foreground">
                    Model: {change.model}
                  </div>
                )}
                {/* Accept/Reject Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onAccept(change.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    onClick={() => onReject(change.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
            
            {/* Accepted Changes */}
            {acceptedChanges.length > 0 && (
              <div className="text-xs text-green-600 font-medium pt-2 border-t border-border">
                ✓ {acceptedChanges.length} accepted
              </div>
            )}
          </>
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
        
        {pendingChanges.length > 1 && (
          <button
            onClick={onUndoAll}
            disabled={!canUndo}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <History className="h-4 w-4" />
            Undo All AI Changes
          </button>
        )}
        
        {rejectedChanges.length > 0 && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 className="h-4 w-4" />
            Redo Rejected Change
          </button>
        )}
      </div>
    </div>
  );
});

AIChangeTooltip.displayName = 'AIChangeTooltip';
