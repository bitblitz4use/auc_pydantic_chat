import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { schema } from 'prosemirror-markdown';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';

/**
 * Convert Yjs binary to Markdown
 */
export function yjsToMarkdown(yjsBinary) {
  try {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, yjsBinary);
    const fragment = ydoc.getXmlFragment('prosemirror');
    const pmNode = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    return defaultMarkdownSerializer.serialize(pmNode);
  } catch (error) {
    console.error('❌ Failed to convert Yjs to Markdown:', error);
    throw new Error(`Yjs to Markdown conversion failed: ${error.message}`);
  }
}
