import { useCallback, useState, useEffect } from 'react';
import { Editor, editorViewCtx } from '@milkdown/kit/core';
import { 
  wrapInHeadingCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertHrCommand,
  toggleInlineCodeCommand,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';
import { callCommand } from '@milkdown/kit/utils';
import { undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { clipboardPlugin } from '@milkdown/kit/plugin/clipboard';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';

export interface EditorCommands {
  // Headings
  setHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  turnIntoParagraph: () => void;
  
  // Text formatting
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleInlineCode: () => void;
  
  // Blocks
  toggleBlockquote: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  insertCodeBlock: () => void;
  insertHorizontalRule: () => void;
  
  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
  // Font family
  setFontFamily: (fontFamily: string) => void;
  
  // Template insertion
  insertTemplate: (markdown: string) => void;
  
  // Get markdown
  getMarkdown: () => string | null;
}

export function useEditorCommands(getEditor: () => Editor | undefined): EditorCommands {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Event-driven undo/redo state tracking (no polling)
  useEffect(() => {
    const editor = getEditor();
    if (!editor) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    let isMounted = true;

    const checkUndoRedoState = () => {
      if (!isMounted) return;
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          
          setCanUndo(undoDepth(state) > 0);
          setCanRedo(redoDepth(state) > 0);
        });
      } catch (error) {
        console.error('Error checking undo/redo state:', error);
        setCanUndo(false);
        setCanRedo(false);
      }
    };

    // Initial check
    checkUndoRedoState();

    // Listen to editor events instead of polling
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      
      const handleTransaction = () => {
        if (isMounted) {
          // Use requestAnimationFrame to batch updates
          requestAnimationFrame(checkUndoRedoState);
        }
      };
      
      // Store handler reference for cleanup
      (view.dom as any)._undoRedoHandler = handleTransaction;
      
      view.dom.addEventListener('input', handleTransaction);
      view.dom.addEventListener('keydown', handleTransaction);
    });

    return () => {
      isMounted = false;
      
      // Cleanup event listeners
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const handler = (view.dom as any)._undoRedoHandler;
          if (handler) {
            view.dom.removeEventListener('input', handler);
            view.dom.removeEventListener('keydown', handler);
            delete (view.dom as any)._undoRedoHandler;
          }
        });
      } catch (error) {
        // Ignore cleanup errors (editor may be destroyed)
      }
    };
  }, [getEditor]);

  const executeCommand = useCallback((commandKey: string, payload?: any) => {
    const editor = getEditor();
    if (!editor) {
      console.warn('Editor not ready');
      return;
    }
    
    try {
      editor.action(callCommand(commandKey, payload));
    } catch (error) {
      console.error('Command execution failed:', error);
    }
  }, [getEditor]);

  // Function to turn block into paragraph
  const turnIntoParagraph = useCallback(() => {
    const editor = getEditor();
    if (!editor) {
      console.warn('Editor not ready');
      return;
    }
    
    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { $from, $to } = state.selection;
        
        // Get the paragraph node type from the schema
        const paragraphType = state.schema.nodes.paragraph;
        
        if (paragraphType) {
          // Use setBlockType to convert current block to paragraph
          const tr = state.tr.setBlockType($from.pos, $to.pos, paragraphType);
          dispatch(tr);
        }
      });
    } catch (error) {
      console.error('Failed to turn into paragraph:', error);
    }
  }, [getEditor]);

  return {
    // Headings
    setHeading: useCallback((level: 1 | 2 | 3 | 4 | 5 | 6) => {
      executeCommand(wrapInHeadingCommand.key, level);
    }, [executeCommand]),

    turnIntoParagraph,

    // Text formatting
    toggleBold: useCallback(() => {
      executeCommand(toggleStrongCommand.key);
    }, [executeCommand]),

    toggleItalic: useCallback(() => {
      executeCommand(toggleEmphasisCommand.key);
    }, [executeCommand]),

    toggleInlineCode: useCallback(() => {
      executeCommand(toggleInlineCodeCommand.key);
    }, [executeCommand]),

    // Blocks
    toggleBlockquote: useCallback(() => {
      executeCommand(wrapInBlockquoteCommand.key);
    }, [executeCommand]),

    toggleBulletList: useCallback(() => {
      const editor = getEditor();
      if (!editor) {
        console.warn('Editor not ready');
        return;
      }
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          const { selection } = state;
          const { $from, empty } = selection;
          
          // Check if we're already in a bullet list
          const bulletList = state.schema.nodes.bullet_list;
          const listItem = state.schema.nodes.list_item;
          const paragraph = state.schema.nodes.paragraph;
          
          // Find if cursor is in a list
          let inList = false;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type === bulletList) {
              inList = true;
              break;
            }
          }
          
          if (inList || !empty) {
            // If in list or has selection, use the wrap command to toggle
            callCommand(wrapInBulletListCommand.key)(ctx);
          } else {
            // Empty cursor not in list - create new list with 3 items
            if (bulletList && listItem && paragraph) {
              const items = [
                listItem.create(null, paragraph.create()),
                listItem.create(null, paragraph.create()),
                listItem.create(null, paragraph.create())
              ];
              const list = bulletList.create(null, items);
              
              const tr = state.tr.replaceSelectionWith(list);
              // Position cursor in first list item (inside the paragraph)
              const pos = tr.selection.from + 2;
              const $pos = tr.doc.resolve(pos);
              tr.setSelection(state.selection.constructor.near($pos) as any);
              dispatch(tr);
            }
          }
        });
      } catch (error) {
        console.error('Failed to toggle bullet list:', error);
      }
    }, [getEditor]),

    toggleOrderedList: useCallback(() => {
      const editor = getEditor();
      if (!editor) {
        console.warn('Editor not ready');
        return;
      }
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          const { selection } = state;
          const { $from, empty } = selection;
          
          // Check if we're already in an ordered list
          const orderedList = state.schema.nodes.ordered_list;
          const listItem = state.schema.nodes.list_item;
          const paragraph = state.schema.nodes.paragraph;
          
          // Find if cursor is in a list
          let inList = false;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type === orderedList) {
              inList = true;
              break;
            }
          }
          
          if (inList || !empty) {
            // If in list or has selection, use the wrap command to toggle
            callCommand(wrapInOrderedListCommand.key)(ctx);
          } else {
            // Empty cursor not in list - create new list with 3 items
            if (orderedList && listItem && paragraph) {
              const items = [
                listItem.create(null, paragraph.create()),
                listItem.create(null, paragraph.create()),
                listItem.create(null, paragraph.create())
              ];
              const list = orderedList.create(null, items);
              
              const tr = state.tr.replaceSelectionWith(list);
              // Position cursor in first list item (inside the paragraph)
              const pos = tr.selection.from + 2;
              const $pos = tr.doc.resolve(pos);
              tr.setSelection(state.selection.constructor.near($pos) as any);
              dispatch(tr);
            }
          }
        });
      } catch (error) {
        console.error('Failed to toggle ordered list:', error);
      }
    }, [getEditor]),

    insertCodeBlock: useCallback(() => {
      executeCommand(createCodeBlockCommand.key);
    }, [executeCommand]),

    insertHorizontalRule: useCallback(() => {
      executeCommand(insertHrCommand.key);
    }, [executeCommand]),

    // History commands
    undo: useCallback(() => {
      const editor = getEditor();
      if (!editor) {
        console.warn('Editor not ready');
        return;
      }
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          undo(state, dispatch);
        });
      } catch (error) {
        console.error('Undo failed:', error);
      }
    }, [getEditor]),

    redo: useCallback(() => {
      const editor = getEditor();
      if (!editor) {
        console.warn('Editor not ready');
        return;
      }
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          redo(state, dispatch);
        });
      } catch (error) {
        console.error('Redo failed:', error);
      }
    }, [getEditor]),

    // Font family
    setFontFamily: useCallback((fontFamily: string) => {
      const editor = getEditor();
      if (!editor) {
        console.warn('Editor not ready');
        return;
      }
      
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          // view.dom is the ProseMirror element itself
          const proseMirror = view.dom as HTMLElement;
          
          // Apply font directly to ProseMirror and all its children
          proseMirror.style.fontFamily = fontFamily;
          
          // Also set CSS variable on the root for persistence
          const rootElement = proseMirror.closest('.milkdown-editor-root') as HTMLElement;
          if (rootElement) {
            rootElement.style.setProperty('--editor-font-family', fontFamily);
          }
        });
      } catch (error) {
        console.error('Failed to set font family:', error);
      }
    }, [getEditor]),

    // Template insertion
    insertTemplate: useCallback((markdown: string) => {
      const editor = getEditor();
      if (!editor) return;
      
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        
        // Simulate a paste event with markdown content
        // This uses the clipboard plugin's logic which handles schema correctly
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', markdown);
        
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        });
        
        view.dom.dispatchEvent(pasteEvent);
      });
    }, [getEditor]),

    // Get markdown
    getMarkdown: useCallback(() => {
      const editor = getEditor();
      if (!editor) return null;
      
      let markdown: string | null = null;
      
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        
        // Use clipboard API to get properly serialized markdown
        // Select all content temporarily
        const { state, dispatch } = view;
        const allSelection = state.selection.constructor.create(
          state.doc,
          0,
          state.doc.content.size
        );
        
        // Create a temporary selection transaction
        const tr = state.tr.setSelection(allSelection as any);
        dispatch(tr);
        
        // Trigger copy event to get markdown via clipboard plugin
        const copyEvent = new ClipboardEvent('copy', {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        });
        
        view.dom.dispatchEvent(copyEvent);
        
        // Get the markdown from clipboard
        const clipboardText = copyEvent.clipboardData?.getData('text/plain');
        markdown = clipboardText || null;
        
        // Restore original selection
        const originalSelection = state.selection;
        const restoreTr = view.state.tr.setSelection(originalSelection);
        view.dispatch(restoreTr);
      });
      
      return markdown;
    }, [getEditor]),

    canUndo,
    canRedo,
  };
}
