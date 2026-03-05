import { useCallback } from 'react';
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
}

export function useEditorCommands(getEditor: () => Editor | undefined): EditorCommands {
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
      executeCommand(wrapInBulletListCommand.key);
    }, [executeCommand]),

    toggleOrderedList: useCallback(() => {
      executeCommand(wrapInOrderedListCommand.key);
    }, [executeCommand]),

    insertCodeBlock: useCallback(() => {
      executeCommand(createCodeBlockCommand.key);
    }, [executeCommand]),

    insertHorizontalRule: useCallback(() => {
      executeCommand(insertHrCommand.key);
    }, [executeCommand]),
  };
}
