import { useEffect, useState, useCallback, useRef } from 'react';
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
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  
  // Create UndoManager once and track it
  useEffect(() => {
    if (!ydoc) {
      undoManagerRef.current = null;
      return;
    }
    
    const fragment = ydoc.getXmlFragment('prosemirror');
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai'])
    });
    
    undoManagerRef.current = undoManager;
    
    console.log('✅ UndoManager created for AI changes');
    
    return () => {
      undoManagerRef.current = null;
    };
  }, [ydoc]);
  
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
      
      // Also check UndoManager state
      if (undoManagerRef.current) {
        const canUndoFromManager = undoManagerRef.current.undoStack.length > 0;
        const canRedoFromManager = undoManagerRef.current.redoStack.length > 0;
        console.log('📊 UndoManager state:', {
          undoStack: undoManagerRef.current.undoStack.length,
          redoStack: undoManagerRef.current.redoStack.length,
          canUndo: canUndoFromManager,
          canRedo: canRedoFromManager
        });
      }
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
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not initialized');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    
    if (!undoManager.canUndo()) {
      console.warn('⚠️ No AI changes to undo');
      return;
    }
    
    console.log('🔄 Undoing last AI change...');
    undoManager.undo();
    console.log('✅ Undone last AI change');
    
    // Update change history to mark as undone
    const changeHistory = ydoc.getMap('aiChangeHistory');
    const latestUndoable = changes.find(c => c.undoable);
    if (latestUndoable) {
      ydoc.transact(() => {
        const updated = { ...latestUndoable, undoable: false };
        changeHistory.set(latestUndoable.id, updated);
      }, { origin: 'user' }); // Use different origin to avoid tracking
    } else {
      console.warn('⚠️ No undoable change found in history');
    }
  }, [ydoc, changes]);
  
  // Undo all AI changes
  const undoAllAIChanges = useCallback(() => {
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not initialized');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    
    if (!undoManager.canUndo()) {
      console.warn('⚠️ No AI changes to undo');
      return;
    }
    
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
    }, { origin: 'user' }); // Use different origin to avoid tracking
  }, [ydoc, changes]);
  
  // Redo last AI change
  const redoAIChange = useCallback(() => {
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not initialized');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    
    if (!undoManager.canRedo()) {
      console.warn('⚠️ No AI changes to redo');
      return;
    }
    
    console.log('🔄 Redoing last AI change...');
    undoManager.redo();
    console.log('✅ Redone AI change');
    
    // Update change history to mark as redone
    const changeHistory = ydoc.getMap('aiChangeHistory');
    const latestRedoable = changes.find(c => !c.undoable);
    if (latestRedoable) {
      ydoc.transact(() => {
        const updated = { ...latestRedoable, undoable: true };
        changeHistory.set(latestRedoable.id, updated);
      }, { origin: 'user' }); // Use different origin to avoid tracking
    } else {
      console.warn('⚠️ No redoable change found in history');
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
