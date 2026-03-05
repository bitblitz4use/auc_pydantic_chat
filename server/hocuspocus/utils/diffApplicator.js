import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { schema } from 'prosemirror-markdown';
import { defaultMarkdownParser } from 'prosemirror-markdown';
import crypto from 'crypto';

/**
 * Generate unique ID using Node's crypto module
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Compare two ProseMirror documents and find changed ranges
 * Works directly with ProseMirror positions - no text mapping needed
 * 
 * @param {any} oldDoc - Current ProseMirror document
 * @param {any} newDoc - New ProseMirror document
 * @returns {Array<{from: number, to: number, type: string}>} Array of changed ranges
 */
function computeProseMirrorDiff(oldDoc, newDoc) {
  const oldText = oldDoc.textContent;
  const newText = newDoc.textContent;
  
  // Quick check: if text is identical, no changes
  if (oldText === newText) {
    console.log('✅ Documents are identical');
    return [];
  }
  
  console.log('📝 Comparing documents:', {
    oldSize: oldDoc.content.size,
    newSize: newDoc.content.size,
    oldTextLength: oldText.length,
    newTextLength: newText.length
  });
  
  const changes = [];
  
  // Strategy: Find the longest common prefix and suffix
  // Everything in between is changed
  const prefixLength = findCommonPrefix(oldDoc, newDoc);
  const suffixLength = findCommonSuffix(oldDoc, newDoc);
  
  const oldDocSize = oldDoc.content.size;
  const newDocSize = newDoc.content.size;
  
  // Calculate changed region
  const oldStart = 1 + prefixLength;
  const oldEnd = oldDocSize - suffixLength;
  const newStart = 1 + prefixLength;
  const newEnd = newDocSize - suffixLength;
  
  // If there's a change region
  if (oldStart < oldEnd || newStart < newEnd) {
    // If entire document changed
    if (prefixLength === 0 && suffixLength === 0) {
      changes.push({
        type: 'replace',
        from: 1,
        to: newDocSize
      });
    } else {
      // Partial change - mark the changed region in the new document
      if (newStart < newEnd) {
        changes.push({
          type: 'replace',
          from: newStart,
          to: newEnd
        });
      }
    }
    
    console.log(`📍 Change detected: [${newStart}-${newEnd}] (prefix: ${prefixLength}, suffix: ${suffixLength})`);
  } else {
    console.log('✅ No structural changes detected (text differs but structure same)');
  }
  
  return changes;
}

/**
 * Find the length of the common prefix between two documents
 * Returns number of positions that are identical from the start
 */
function findCommonPrefix(oldDoc, newDoc) {
  let oldPos = 1;
  let newPos = 1;
  const oldSize = oldDoc.content.size;
  const newSize = newDoc.content.size;
  
  // Compare nodes character by character
  while (oldPos < oldSize && newPos < newSize) {
    const oldNode = oldDoc.nodeAt(oldPos);
    const newNode = newDoc.nodeAt(newPos);
    
    if (!oldNode || !newNode) break;
    
    // If nodes are different types, stop
    if (oldNode.type.name !== newNode.type.name) break;
    
    // If both are text nodes, compare text
    if (oldNode.isText && newNode.isText) {
      const minLength = Math.min(oldNode.text.length, newNode.text.length);
      let matchLength = 0;
      
      while (matchLength < minLength && 
             oldNode.text[matchLength] === newNode.text[matchLength]) {
        matchLength++;
      }
      
      if (matchLength < minLength) {
        // Text differs - prefix ends here
        return oldPos - 1 + matchLength;
      }
      
      // Text matches completely - advance positions
      oldPos += oldNode.nodeSize;
      newPos += newNode.nodeSize;
    } else {
      // Non-text nodes - if they match, advance
      if (oldNode.eq(newNode)) {
        oldPos += oldNode.nodeSize;
        newPos += newNode.nodeSize;
      } else {
        break;
      }
    }
  }
  
  return Math.min(oldPos - 1, newPos - 1);
}

/**
 * Find the length of the common suffix between two documents
 * Returns number of positions that are identical from the end
 */
function findCommonSuffix(oldDoc, newDoc) {
  const oldSize = oldDoc.content.size;
  const newSize = newDoc.content.size;
  
  // Collect nodes from the end of each document
  const oldNodes = [];
  const newNodes = [];
  
  // Traverse backwards through old document
  let oldPos = oldSize - 1;
  while (oldPos >= 1) {
    const node = oldDoc.nodeAt(oldPos);
    if (!node) break;
    oldNodes.unshift({ node, pos: oldPos });
    oldPos -= node.nodeSize;
  }
  
  // Traverse backwards through new document
  let newPos = newSize - 1;
  while (newPos >= 1) {
    const node = newDoc.nodeAt(newPos);
    if (!node) break;
    newNodes.unshift({ node, pos: newPos });
    newPos -= node.nodeSize;
  }
  
  // Compare nodes from the end
  let suffixLength = 0;
  let oldIdx = oldNodes.length - 1;
  let newIdx = newNodes.length - 1;
  
  while (oldIdx >= 0 && newIdx >= 0) {
    const oldEntry = oldNodes[oldIdx];
    const newEntry = newNodes[newIdx];
    
    // If nodes are different types, stop
    if (oldEntry.node.type.name !== newEntry.node.type.name) break;
    
    // If both are text nodes, compare text backwards
    if (oldEntry.node.isText && newEntry.node.isText) {
      const minLength = Math.min(oldEntry.node.text.length, newEntry.node.text.length);
      let matchLength = 0;
      
      for (let i = 1; i <= minLength; i++) {
        if (oldEntry.node.text[oldEntry.node.text.length - i] === 
            newEntry.node.text[newEntry.node.text.length - i]) {
          matchLength++;
        } else {
          break;
        }
      }
      
      if (matchLength < minLength) {
        // Text differs - suffix ends here
        suffixLength += matchLength;
        break;
      }
      
      // Text matches completely - add to suffix
      suffixLength += oldEntry.node.nodeSize;
      oldIdx--;
      newIdx--;
    } else {
      // Non-text nodes - if they match, add to suffix
      if (oldEntry.node.eq(newEntry.node)) {
        suffixLength += oldEntry.node.nodeSize;
        oldIdx--;
        newIdx--;
      } else {
        break;
      }
    }
  }
  
  return suffixLength;
}

/**
 * Apply incremental AI changes to Yjs document
 * Computes changed ranges and applies as single transaction
 * Hocuspocus will automatically broadcast changes to connected clients
 * 
 * @param {Y.Doc} ydoc - The Yjs document
 * @param {string} aiMarkdown - AI-edited markdown content
 * @param {object} metadata - Change metadata (model, prompt, etc.)
 * @returns {object} Result with changeId, count, and changed ranges
 */
export function applyIncrementalAIChanges(ydoc, aiMarkdown, metadata = {}) {
  try {
    const fragment = ydoc.getXmlFragment('prosemirror');
    const currentDoc = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    const aiDoc = defaultMarkdownParser.parse(aiMarkdown);
    
    if (!aiDoc) {
      throw new Error('Failed to parse AI markdown');
    }
    
    // Compute changes using ProseMirror document comparison
    const changes = computeProseMirrorDiff(currentDoc, aiDoc);
    const changeId = metadata.changeId || generateId();
    
    console.log(`🤖 Detected ${changes.length} change range(s)`);
    
    if (changes.length === 0) {
      console.log('⚠️ No changes detected');
      return {
        success: true,
        changeId,
        changesApplied: 0,
        ranges: []
      };
    }
    
    // Store range information for client-side decorations
    const rangeInfo = changes.map(change => ({
      from: change.from,
      to: change.to,
      type: change.type || 'replace'
    }));
    
    console.log('📍 Changed ranges:', rangeInfo);
    
    // Apply document update in one transaction
    // Hocuspocus will automatically broadcast this to connected clients
    ydoc.transact(() => {
      fragment.delete(0, fragment.length);
      prosemirrorToYXmlFragment(aiDoc, fragment);
    }, {
      origin: 'ai',
      changeId: changeId,
      changeType: 'multi',
      ranges: rangeInfo,
      totalChanges: changes.length,
      timestamp: Date.now(),
      ...metadata
    });
    
    // Store metadata in a separate transaction
    ydoc.transact(() => {
      const changeHistory = ydoc.getMap('aiChangeHistory');
      const changeEntry = {
        id: changeId,
        timestamp: Date.now(),
        changesCount: changes.length,
        model: metadata.model,
        prompt: metadata.prompt,
        undoable: true,
        ranges: rangeInfo
      };
      
      changeHistory.set(changeId, changeEntry);
      console.log(`✅ AI change metadata stored with ID: ${changeId}`);
    });
    
    return {
      success: true,
      changeId,
      changesApplied: changes.length,
      ranges: rangeInfo
    };
    
  } catch (error) {
    console.error('❌ Failed to apply incremental AI changes:', error);
    throw error;
  }
}
