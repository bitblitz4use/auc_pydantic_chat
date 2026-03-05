import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { schema } from 'prosemirror-markdown';
import { defaultMarkdownParser } from 'prosemirror-markdown';
import crypto from 'crypto';

/**
 * Generate unique ID using Node's crypto module
 * @returns {string} Random hex string
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Compute minimal diff between current and AI-edited documents
 * Returns array of changes with positions and operations
 */
function computeProseMirrorDiff(currentDoc, newDoc) {
  const changes = [];
  
  // Simple approach: compare content as strings and mark as replace
  // For production, use a proper diff algorithm like prosemirror-diff
  const currentContent = JSON.stringify(currentDoc.toJSON());
  const newContent = JSON.stringify(newDoc.toJSON());
  
  if (currentContent !== newContent) {
    changes.push({
      type: 'replace',
      fullDoc: newDoc
    });
  }
  
  return changes;
}

/**
 * Apply a change to YXmlFragment
 * For now, we do a full replacement but track it properly
 */
function applyChangeToFragment(fragment, change) {
  if (change.type === 'replace' && change.fullDoc) {
    // Clear and replace
    fragment.delete(0, fragment.length);
    prosemirrorToYXmlFragment(change.fullDoc, fragment);
  }
}

/**
 * Apply incremental AI changes to Yjs document
 * Each change is a separate transaction for granular undo
 * 
 * @param {Y.Doc} ydoc - The Yjs document
 * @param {string} aiMarkdown - AI-edited markdown content
 * @param {object} metadata - Change metadata (model, prompt, etc.)
 * @returns {object} Result with changeId and count
 */
export function applyIncrementalAIChanges(ydoc, aiMarkdown, metadata = {}) {
  try {
    const fragment = ydoc.getXmlFragment('prosemirror');
    const currentDoc = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    const aiDoc = defaultMarkdownParser.parse(aiMarkdown);
    
    if (!aiDoc) {
      throw new Error('Failed to parse AI markdown');
    }
    
    // Compute minimal changes
    const changes = computeProseMirrorDiff(currentDoc, aiDoc);
    const changeId = metadata.changeId || generateId();
    
    console.log(`🤖 Applying ${changes.length} incremental AI changes`);
    
    if (changes.length === 0) {
      console.log('⚠️ No changes detected');
      return {
        success: true,
        changeId,
        changesApplied: 0
      };
    }
    
    // Apply each change as separate transaction
    changes.forEach((change, index) => {
      ydoc.transact(() => {
        applyChangeToFragment(fragment, change);
      }, {
        origin: 'ai',
        changeId: `${changeId}-${index}`,
        changeType: change.type,
        totalChanges: changes.length,
        changeIndex: index,
        timestamp: Date.now(),
        ...metadata
      });
    });
    
    // Store AI change metadata in a separate map
    const changeHistory = ydoc.getMap('aiChangeHistory');
    const changeEntry = {
      id: changeId,
      timestamp: Date.now(),
      changesCount: changes.length,
      model: metadata.model,
      prompt: metadata.prompt,
      undoable: true
    };
    
    changeHistory.set(changeId, changeEntry);
    
    console.log(`✅ AI changes stored with ID: ${changeId}`);
    
    return {
      success: true,
      changeId,
      changesApplied: changes.length
    };
    
  } catch (error) {
    console.error('❌ Failed to apply incremental AI changes:', error);
    throw error;
  }
}
