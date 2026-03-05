import { useEffect, useState, useCallback, useRef } from 'react';
import * as Y from 'yjs';

export interface AIChange {
  id: string;
  timestamp: number;
  model?: string;
  prompt?: string;
  status: 'pending' | 'accepted' | 'rejected';
  undoable: boolean;
}

/**
 * Hook to track AI changes with proper undo/redo
 * Production-ready: Server-side undo for proper broadcasting
 */
export function useAIChangeTracker(ydoc: Y.Doc | null, documentName?: string) {
  const [changes, setChanges] = useState<AIChange[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  
  // Create UndoManager for AI changes
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
    console.log('✅ UndoManager initialized');
    
    return () => {
      undoManagerRef.current = null;
    };
  }, [ydoc]);
  
  // Track AI change history
  useEffect(() => {
    if (!ydoc) {
      setChanges([]);
      setCanUndo(false);
      setCanRedo(false);
      return;
    }
    
    const changeHistory = ydoc.getMap('aiChangeHistory');
    
    const updateChanges = () => {
      const changeEntries: AIChange[] = [];
      
      changeHistory.forEach((value: any, key: string) => {
        // Skip metadata keys
        if (key.startsWith('__')) return;
        
        changeEntries.push({
          id: key,
          timestamp: value.timestamp,
          model: value.model,
          prompt: value.prompt,
          status: value.status || 'pending',
          undoable: value.undoable
        });
      });
      
      // Sort by timestamp (newest first)
      changeEntries.sort((a, b) => b.timestamp - a.timestamp);
      setChanges(changeEntries);
      
      // Update undo/redo state - only pending changes can be undone
      const pendingChanges = changeEntries.filter(c => c.status === 'pending' && c.undoable);
      const undoableCount = pendingChanges.length;
      const redoableCount = changeEntries.filter(c => !c.undoable).length;
      
      setCanUndo(undoableCount > 0);
      setCanRedo(redoableCount > 0);
      
      // Also check UndoManager state
      if (undoManagerRef.current) {
        console.log('📊 UndoManager:', {
          canUndo: undoManagerRef.current.canUndo(),
          canRedo: undoManagerRef.current.canRedo(),
          undoStack: undoManagerRef.current.undoStack.length,
          redoStack: undoManagerRef.current.redoStack.length
        });
      }
    };
    
    // Initial load
    updateChanges();
    
    // Listen for changes
    changeHistory.observe(updateChanges);
    
    return () => {
      changeHistory.unobserve(updateChanges);
    };
  }, [ydoc]);
  
  /**
   * Undo last AI change
   */
  const undoLastAIChange = useCallback(() => {
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not available');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    
    if (!undoManager.canUndo()) {
      console.warn('⚠️ No AI changes to undo');
      return;
    }
    
    console.log('🔄 Undoing last AI change');
    undoManager.undo();
    
    // Mark change as undone
    const changeHistory = ydoc.getMap('aiChangeHistory');
    const latestUndoable = changes.find(c => c.undoable);
    
    if (latestUndoable) {
      ydoc.transact(() => {
        const updated = { ...latestUndoable, undoable: false };
        changeHistory.set(latestUndoable.id, updated);
      }, 'user');
    }
    
    console.log('✅ Undone AI change');
  }, [ydoc, changes]);
  
  /**
   * Undo all AI changes
   */
  const undoAllAIChanges = useCallback(() => {
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not available');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    let count = 0;
    
    while (undoManager.canUndo()) {
      undoManager.undo();
      count++;
    }
    
    console.log(`✅ Undone ${count} AI changes`);
    
    // Mark all as undone
    ydoc.transact(() => {
      const changeHistory = ydoc.getMap('aiChangeHistory');
      changes.forEach(change => {
        if (change.undoable) {
          const updated = { ...change, undoable: false };
          changeHistory.set(change.id, updated);
        }
      });
    }, 'user');
  }, [ydoc, changes]);
  
  /**
   * Redo last AI change
   */
  const redoAIChange = useCallback(() => {
    if (!ydoc || !undoManagerRef.current) {
      console.warn('⚠️ UndoManager not available');
      return;
    }
    
    const undoManager = undoManagerRef.current;
    
    if (!undoManager.canRedo()) {
      console.warn('⚠️ No AI changes to redo');
      return;
    }
    
    console.log('🔄 Redoing AI change');
    undoManager.redo();
    
    // Mark change as redone
    const changeHistory = ydoc.getMap('aiChangeHistory');
    const latestRedoable = changes.find(c => !c.undoable);
    
    if (latestRedoable) {
      const updated = { ...latestRedoable, undoable: true, status: 'pending' };
      changeHistory.set(latestRedoable.id, updated);
    }
    
    console.log('✅ Redone AI change');
  }, [ydoc, changes]);
  
  /**
   * Accept AI change - calls server API to mark as accepted
   */
  const acceptAIChange = useCallback(async (changeId: string) => {
    if (!documentName) {
      console.warn('⚠️ Document name not available');
      return;
    }
    
    console.log('✅ Accepting AI change:', changeId);
    
    try {
      const response = await fetch(`http://127.0.0.1:3001/api/ai/accept/${documentName}/${changeId}`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Change accepted on server');
      } else {
        console.error('❌ Accept failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Accept request failed:', error);
    }
  }, [documentName]);
  
  /**
   * Reject AI change - calls server API to undo and mark as rejected
   */
  const rejectAIChange = useCallback(async (changeId: string) => {
    if (!documentName) {
      console.warn('⚠️ Document name not available');
      return;
    }
    
    console.log('❌ Rejecting AI change:', changeId);
    
    try {
      const response = await fetch(`http://127.0.0.1:3001/api/ai/reject/${documentName}/${changeId}`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Change rejected and undone on server');
        console.log('📡 Undo broadcasted to all clients');
      } else {
        console.error('❌ Reject failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Reject request failed:', error);
    }
  }, [documentName]);
  
  return {
    changes,
    canUndo,
    canRedo,
    undoLastAIChange,
    undoAllAIChanges,
    redoAIChange,
    acceptAIChange,
    rejectAIChange
  };
}
