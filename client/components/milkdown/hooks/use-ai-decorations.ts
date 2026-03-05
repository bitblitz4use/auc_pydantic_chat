import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { Editor, editorViewCtx } from '@milkdown/kit/core';
import { aiDecorationsKey, type AIChangeRange } from '../plugins/ai-decorations-plugin';

/**
 * Hook to observe Yjs AI transactions and apply decorations to the editor
 * This bridges Yjs updates with ProseMirror decorations
 */
export function useAIDecorations(
  ydoc: Y.Doc | null, 
  getEditor: () => Editor | undefined,
  documentName?: string // Add document name to track document switches
) {
  const activeRangesRef = useRef<Map<string, AIChangeRange[]>>(new Map());
  const isApplyingRef = useRef(false);
  const lastDocumentNameRef = useRef<string | undefined>(documentName);
  
  // Update editor decorations based on current active ranges
  const updateEditorDecorations = useCallback((ranges: AIChangeRange[]) => {
    const editor = getEditor();
    if (!editor || isApplyingRef.current) return;
    
    isApplyingRef.current = true;
    
    // Defer decoration application to ensure ProseMirror has synced with Yjs
    requestAnimationFrame(() => {
      // Double-check editor is still available
      const currentEditor = getEditor();
      if (!currentEditor) {
        isApplyingRef.current = false;
        return;
      }
      
      try {
        currentEditor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const docSize = view.state.doc.content.size;
          
          // Filter out invalid ranges before applying
          const validRanges = ranges.filter(range => {
            const isValid = range.from >= 1 && 
                           range.to <= docSize && 
                           range.from < range.to;
            // Only log if this is a new range (not from history - history already filtered)
            // We can detect this by checking if the range seems reasonable
            if (!isValid && docSize > 0) {
              // Only warn if the range is significantly out of bounds (not just slightly off)
              if (range.to > docSize * 2 || range.from < 0) {
                console.warn(`⚠️ Skipping invalid range [${range.from}-${range.to}], doc size: ${docSize}, changeId: ${range.changeId}`);
              }
            }
            return isValid;
          });
          
          if (validRanges.length === 0) {
            if (ranges.length > 0) {
              console.log(`⚠️ No valid ranges to apply (${ranges.length} invalid), doc size: ${docSize}`);
            }
            isApplyingRef.current = false;
            return;
          }
          
          if (validRanges.length < ranges.length) {
            console.log(`⚠️ Filtered ${ranges.length - validRanges.length} invalid ranges, applying ${validRanges.length} valid ones`);
          }
          
          // Dispatch transaction with decoration metadata
          const tr = view.state.tr;
          tr.setMeta(aiDecorationsKey, validRanges);
          view.dispatch(tr);
          
          console.log('📍 Updated editor decorations:', validRanges.length, 'valid ranges out of', ranges.length);
        });
      } catch (error) {
        console.error('❌ Failed to update decorations:', error);
      } finally {
        isApplyingRef.current = false;
      }
    });
  }, [getEditor]);
  
  // Clear all decorations
  const clearDecorations = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    
    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr;
        tr.setMeta('clearAIDecorations', true);
        view.dispatch(tr);
        
        console.log('🧹 Cleared all AI decorations');
      });
    } catch (error) {
      console.error('❌ Failed to clear decorations:', error);
    }
    
    activeRangesRef.current.clear();
  }, [getEditor]);
  
  useEffect(() => {
    // Check if document has changed
    const documentChanged = lastDocumentNameRef.current !== documentName;
    if (documentChanged) {
      console.log('📄 Document changed from', lastDocumentNameRef.current, 'to', documentName);
      lastDocumentNameRef.current = documentName;
      // Clear decorations immediately when document changes
      clearDecorations();
    }
  }, [documentName, clearDecorations]);
  
  useEffect(() => {
    if (!ydoc) {
      clearDecorations();
      return;
    }
    
    const fragment = ydoc.getXmlFragment('prosemirror');
    const changeHistory = ydoc.getMap('aiChangeHistory');
    
    console.log('👀 Setting up AI decoration observers for document:', documentName);
    
    // Observer for Yjs document updates (for real-time AI changes)
    const updateObserver = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
      // Access transaction origin - it's a property on the transaction object
      const origin = transaction.origin;
      
      if (origin === 'ai') {
        console.log('🤖 AI transaction detected!');
        
        // The transaction metadata is passed as properties on the transaction
        // We need to access them from the transaction object itself
        const transactionMeta = transaction as any;
        const ranges = transactionMeta.ranges as Array<{from: number, to: number, type: string}> | undefined;
        const changeId = transactionMeta.changeId as string | undefined;
        
        console.log('📦 Transaction metadata:', { 
          origin, 
          changeId, 
          rangesCount: ranges?.length,
          ranges 
        });
        
        if (ranges && changeId) {
          // Convert ranges to our format
          const newRanges: AIChangeRange[] = ranges.map(r => ({
            from: r.from,
            to: r.to,
            type: r.type,
            changeId: changeId
          }));
          
          console.log('📍 AI change ranges detected:', newRanges);
          
          // Store ranges for this change
          activeRangesRef.current.set(changeId, newRanges);
          
          // Collect all active ranges
          const allRanges: AIChangeRange[] = [];
          activeRangesRef.current.forEach(ranges => {
            allRanges.push(...ranges);
          });
          
          // Defer decoration update to allow ProseMirror to sync first
          setTimeout(() => {
            updateEditorDecorations(allRanges);
          }, 50);
        }
      }
    };
    
    // Observer for change history updates (for undo/redo)
    const historyObserver = () => {
      console.log('📚 AI change history updated');
      
      // Get current document size for validation
      const editor = getEditor();
      let currentDocSize = 0;
      if (editor) {
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            currentDocSize = view.state.doc.content.size;
          });
        } catch (error) {
          console.warn('⚠️ Could not get document size for validation:', error);
        }
      }
      
      // Rebuild active ranges based on undoable status
      const newActiveRanges = new Map<string, AIChangeRange[]>();
      let invalidRangesCount = 0;
      
      changeHistory.forEach((value: any, key: string) => {
        if (value.undoable && value.ranges) {
          // Validate ranges against current document size
          const validRanges: AIChangeRange[] = [];
          
          for (const r of value.ranges) {
            const range: AIChangeRange = {
              from: r.from,
              to: r.to,
              type: r.type,
              changeId: key
            };
            
            // Validate range against current document
            if (currentDocSize > 0) {
              if (range.from >= 1 && 
                  range.to <= currentDocSize && 
                  range.from < range.to) {
                validRanges.push(range);
              } else {
                invalidRangesCount++;
                console.warn(`⚠️ Skipping invalid range from history [${range.from}-${range.to}], doc size: ${currentDocSize}, changeId: ${key}`);
              }
            } else {
              // If we can't get doc size, store ranges but they'll be validated later
              validRanges.push(range);
            }
          }
          
          // Only store if there are valid ranges
          if (validRanges.length > 0) {
            newActiveRanges.set(key, validRanges);
          } else if (value.ranges.length > 0) {
            // All ranges were invalid - mark this change as having no valid ranges
            console.warn(`⚠️ Change ${key} has no valid ranges for current document (${value.ranges.length} ranges invalid)`);
          }
        }
      });
      
      if (invalidRangesCount > 0) {
        console.log(`⚠️ Filtered out ${invalidRangesCount} invalid ranges from history`);
      }
      
      activeRangesRef.current = newActiveRanges;
      
      // Collect all ranges
      const allRanges: AIChangeRange[] = [];
      newActiveRanges.forEach(ranges => {
        allRanges.push(...ranges);
      });
      
      console.log('📊 Active AI changes after history update:', allRanges.length, 'valid ranges');
      
      // Defer decoration update to allow document to sync
      setTimeout(() => {
        if (allRanges.length === 0) {
          clearDecorations();
        } else {
          // updateEditorDecorations will validate ranges against current doc size
          // So we can just call it with the pre-filtered ranges
          updateEditorDecorations(allRanges);
        }
      }, 100); // Increased delay to ensure document is fully synced
    };
    
    // Attach observers
    fragment.observeDeep(updateObserver);
    changeHistory.observe(historyObserver);
    
    // Initial sync: load existing undoable changes (but defer to allow sync)
    setTimeout(() => {
      historyObserver();
    }, 100);
    
    return () => {
      console.log('🧹 Cleaning up AI decoration observers for document:', documentName);
      fragment.unobserveDeep(updateObserver);
      changeHistory.unobserve(historyObserver);
      clearDecorations();
    };
  }, [ydoc, documentName, getEditor, updateEditorDecorations, clearDecorations]);
  
  return {
    clearDecorations
  };
}
