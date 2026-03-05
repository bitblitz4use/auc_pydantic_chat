import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { DOMParser, DOMSerializer } from 'prosemirror-model';
import { schema } from 'prosemirror-markdown';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';

/**
 * Convert Yjs binary to Markdown
 * @param {Uint8Array} yjsBinary - The binary Yjs document data
 * @returns {string} - Markdown string
 */
export function yjsToMarkdown(yjsBinary) {
  try {
    // 1. Decode Yjs document
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, yjsBinary);
    
    // 2. Get ProseMirror fragment (Milkdown uses 'prosemirror' by default)
    const fragment = ydoc.getXmlFragment('prosemirror');
    
    // 3. Convert YXmlFragment to ProseMirror Node
    const pmNode = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    
    // 4. Serialize to Markdown
    const markdown = defaultMarkdownSerializer.serialize(pmNode);
    
    return markdown;
  } catch (error) {
    console.error('❌ Failed to convert Yjs to Markdown:', error);
    throw new Error(`Yjs to Markdown conversion failed: ${error.message}`);
  }
}

/**
 * Apply AI-edited Markdown back to Yjs document
 * Uses transaction origin 'ai' for undo support
 * @param {Y.Doc} ydoc - The Yjs document to modify
 * @param {string} aiMarkdown - The AI-edited markdown content
 */
export function applyAIMarkdown(ydoc, aiMarkdown) {
  try {
    // 1. Parse markdown to ProseMirror
    const pmDoc = defaultMarkdownParser.parse(aiMarkdown);
    
    if (!pmDoc) {
      throw new Error('Failed to parse markdown');
    }
    
    // 2. Apply changes in a transaction with 'ai' origin
    ydoc.transact(() => {
      const fragment = ydoc.getXmlFragment('prosemirror');
      
      // Clear existing content
      fragment.delete(0, fragment.length);
      
      // Convert ProseMirror doc to YXmlFragment (modifies fragment in place)
      prosemirrorToYXmlFragment(pmDoc, fragment);
      
    }, 'ai'); // <- Origin marker for undo
    
    console.log('✅ AI markdown applied successfully');
  } catch (error) {
    console.error('❌ Failed to apply AI markdown:', error);
    throw new Error(`AI markdown import failed: ${error.message}`);
  }
}
