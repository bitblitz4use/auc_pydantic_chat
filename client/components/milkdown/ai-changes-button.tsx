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
}

export const AIChangesButton = memo(({
  changes,
  canUndo,
  canRedo,
  onUndoLast,
  onUndoAll,
  onRedo
}: AIChangesButtonProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const activeCount = changes.filter(c => c.undoable).length;
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${activeCount > 0 
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
            : 'bg-gray-100 text-gray-500 cursor-default'
          }
        `}
        disabled={activeCount === 0}
      >
        <Sparkles className="h-4 w-4" />
        AI Changes
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-purple-500 text-white rounded-full text-xs">
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
