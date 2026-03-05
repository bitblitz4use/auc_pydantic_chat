import { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';

export interface AIChange {
  id: string;
  timestamp: number;
  changesCount: number;
  model?: string;
  prompt?: string;
  undoable: boolean;
}

export function useAIChangeTracker(ydoc: Y.Doc | null) {
  const [changes, setChanges] = useState<AIChange[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // Subscribe to AI change history
  useEffect(() => {
    if (!ydoc) {
      setChanges([]);
      setCanUndo(false);
      setCanRedo(false);
      return;
    }
    
    const changeHistory = ydoc.getMap('aiChangeHistory');
    let isMounted = true;
    
    const updateChanges = () => {
      // Only update if component is still mounted
      if (!isMounted) return;
      
      const changeEntries: AIChange[] = [];
      changeHistory.forEach((value: any, key: string) => {
        changeEntries.push({ ...value, id: key });
      });
      
      // Sort by timestamp (newest first)
      changeEntries.sort((a, b) => b.timestamp - a.timestamp);
      setChanges(changeEntries);
      
      // Update undo/redo state
      const undoableChanges = changeEntries.filter(c => c.undoable);
      const redoableChanges = changeEntries.filter(c => !c.undoable);
      setCanUndo(undoableChanges.length > 0);
      setCanRedo(redoableChanges.length > 0);
    };
    
    // Initial load
    updateChanges();
    
    // Listen for changes
    changeHistory.observe(updateChanges);
    
    return () => {
      isMounted = false;
      changeHistory.unobserve(updateChanges);
    };
  }, [ydoc]);
  
  // Undo last AI change
  const undoLastAIChange = useCallback(() => {
    if (!ydoc) return;
    
    const fragment = ydoc.getXmlFragment('prosemirror');
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai'])
    });
    
    if (undoManager.canUndo()) {
      undoManager.undo();
      console.log('✅ Undone last AI change');
      
      // Update change history to mark as undone
      const changeHistory = ydoc.getMap('aiChangeHistory');
      const latestUndoable = changes.find(c => c.undoable);
      if (latestUndoable) {
        ydoc.transact(() => {
          const updated = { ...latestUndoable, undoable: false };
          changeHistory.set(latestUndoable.id, updated);
        });
      }
    }
  }, [ydoc, changes]);
  
  // Undo all AI changes
  const undoAllAIChanges = useCallback(() => {
    if (!ydoc) return;
    
    const fragment = ydoc.getXmlFragment('prosemirror');
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai'])
    });
    
    let count = 0;
    while (undoManager.canUndo()) {
      undoManager.undo();
      count++;
    }
    
    console.log(`✅ Undone ${count} AI change(s)`);
    
    // Mark all as undone in a single transaction
    ydoc.transact(() => {
      const changeHistory = ydoc.getMap('aiChangeHistory');
      changes.forEach(change => {
        if (change.undoable) {
          const updated = { ...change, undoable: false };
          changeHistory.set(change.id, updated);
        }
      });
    });
  }, [ydoc, changes]);
  
  // Redo last AI change
  const redoAIChange = useCallback(() => {
    if (!ydoc) return;
    
    const fragment = ydoc.getXmlFragment('prosemirror');
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai'])
    });
    
    if (undoManager.canRedo()) {
      undoManager.redo();
      console.log('✅ Redone AI change');
      
      // Update change history to mark as redone
      const changeHistory = ydoc.getMap('aiChangeHistory');
      const latestRedoable = changes.find(c => !c.undoable);
      if (latestRedoable) {
        ydoc.transact(() => {
          const updated = { ...latestRedoable, undoable: true };
          changeHistory.set(latestRedoable.id, updated);
        });
      }
    }
  }, [ydoc, changes]);
  
  return {
    changes,
    canUndo,
    canRedo,
    undoLastAIChange,
    undoAllAIChanges,
    redoAIChange
  };
}
