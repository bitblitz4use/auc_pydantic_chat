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
 * Hook to track AI changes with proper undo/redo and persistence
 * 
 * Production improvements implemented:
 * - Persisted metadata survives page reloads (stored in __persistedMetadata Y.Map)
 * - Proper UndoManager cleanup to prevent memory leaks
 * - Observes both changeHistory and persistedMeta for accurate state
 * - Enhanced error handling with user feedback
 */
export function useAIChangeTracker(
  ydoc: Y.Doc | null, 
  documentName?: string,
  getEditor?: () => any
) {
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
      // Properly destroy UndoManager to prevent memory leaks
      if (undoManagerRef.current) {
        undoManagerRef.current.destroy();
        console.log('🧹 UndoManager destroyed');
      }
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
    const persistedMeta = ydoc.getMap('__persistedMetadata');
    
    const updateChanges = () => {
      const changeEntries: AIChange[] = [];
      
      changeHistory.forEach((value: any, key: string) => {
        // Skip metadata keys
        if (key.startsWith('__')) return;
        
        // Read persisted status if available (overrides in-memory)
        const persistedStatus = persistedMeta.get(`change_${key}_status`);
        const actualStatus = persistedStatus || value.status || 'pending';
        
        changeEntries.push({
          id: key,
          timestamp: value.timestamp,
          model: value.model,
          prompt: value.prompt,
          status: actualStatus,
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
    
    // Listen for changes in both locations
    changeHistory.observe(updateChanges);
    persistedMeta.observe(updateChanges);
    
    return () => {
      changeHistory.unobserve(updateChanges);
      persistedMeta.unobserve(updateChanges);
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
      const response = await fetch(`http://127.0.0.1:3001/api/ai/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentName, changeId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Change accepted on server');
      } else {
        console.error('❌ Accept failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Accept request failed:', error);
      // Show error to user (could be enhanced with toast notification)
      alert(`Failed to accept change: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [documentName]);
  
  /**
   * Reject AI change - undos the editor transaction and marks as rejected
   * NEW ARCHITECTURE: AI changes are ProseMirror transactions, so we use editor undo
   */
  const rejectAIChange = useCallback(async (changeId: string) => {
    if (!documentName) {
      console.warn('⚠️ Document name not available');
      return;
    }
    
    console.log('❌ Rejecting AI change:', changeId);
    
    // First, undo the change locally using editor's undo
    if (getEditor) {
      try {
        const editor = getEditor();
        if (editor) {
          // Dynamic import for types
          const { editorViewCtx } = require('@milkdown/kit/core');
          const { undo } = require('prosemirror-history');
          
          editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx);
            const { state, dispatch } = view;
            
            // Use ProseMirror's built-in undo
            undo(state, dispatch);
          });
          
          console.log('✅ Editor undo performed');
        }
      } catch (error) {
        console.error('❌ Editor undo failed:', error);
      }
    }
    
    // Then notify server to mark as rejected
    try {
      const response = await fetch(`http://127.0.0.1:3001/api/ai/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentName, changeId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Change marked as rejected on server');
      } else {
        console.error('❌ Reject failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Reject request failed:', error);
      // Show error to user (could be enhanced with toast notification)
      alert(`Failed to reject change: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [documentName, getEditor]);
  
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
