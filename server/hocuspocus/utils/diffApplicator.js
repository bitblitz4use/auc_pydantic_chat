import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { schema } from 'prosemirror-markdown';
import { defaultMarkdownParser } from 'prosemirror-markdown';
import DiffMatchPatch from 'diff-match-patch';
import crypto from 'crypto';

const dmp = new DiffMatchPatch();

/**
 * Generate unique ID using Node's crypto module
 * @returns {string} Random hex string
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Compute text differences using diff-match-patch
 * Returns array of changed ranges with positions in the NEW document
 */
function computeTextDiff(oldText, newText) {
  // Compute the diff
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs); // Clean up for human readability
  
  const changes = [];
  let position = 0; // Position in the new document
  
  for (const [operation, text] of diffs) {
    if (operation === DiffMatchPatch.DIFF_DELETE) {
      // Deletion - doesn't add to new doc position
      continue;
    } else if (operation === DiffMatchPatch.DIFF_INSERT) {
      // Insertion - this is a change in the new doc
      changes.push({
        from: position,
        to: position + text.length,
        type: 'insert'
      });
      position += text.length;
    } else if (operation === DiffMatchPatch.DIFF_EQUAL) {
      // Equal - just advance position
      position += text.length;
    }
  }
  
  return changes;
}

/**
 * Compute ProseMirror diff using diff-match-patch
 * Returns array of changed ranges with positions
 */
function computeProseMirrorDiff(currentDoc, newDoc) {
  const oldText = currentDoc.textContent;
  const newText = newDoc.textContent;
  
  console.log('📝 Old text length:', oldText.length, 'chars');
  console.log('📝 New text length:', newText.length, 'chars');
  
  const changes = computeTextDiff(oldText, newText);
  
  if (changes.length === 0) {
    console.log('✅ No changes detected');
    return [];
  }
  
  // Convert to ProseMirror change format
  const pmChanges = changes.map(change => ({
    type: change.type,
    from: change.from,
    to: change.to,
    fullDoc: newDoc
  }));
  
  console.log('🔍 Detected changes:', pmChanges.map(c => ({ 
    type: c.type, 
    from: c.from, 
    to: c.to,
    length: c.to - c.from,
    text: newText.substring(c.from, c.to).substring(0, 50) + (c.to - c.from > 50 ? '...' : '')
  })));
  
  return pmChanges;
}

/**
 * Apply incremental AI changes to Yjs document
 * Stores precise changed ranges and applies as single transaction
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
    
    // Compute precise changes using diff-match-patch
    const changes = computeProseMirrorDiff(currentDoc, aiDoc);
    const changeId = metadata.changeId || generateId();
    
    console.log(`🤖 Applying ${changes.length} detected changes as single transaction`);
    console.log('📍 Changed ranges:', changes.map(c => ({ from: c.from, to: c.to, type: c.type })));
    
    if (changes.length === 0) {
      console.log('⚠️ No changes detected');
      return {
        success: true,
        changeId,
        changesApplied: 0,
        ranges: []
      };
    }
    
    // Store range information for client-side indicators
    const rangeInfo = changes.map(change => ({
      from: change.from,
      to: change.to,
      type: change.type
    }));
    
    // Apply document update in one transaction
    ydoc.transact(() => {
      // Replace fragment with the new document
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
    
    console.log('📤 Document update broadcasted');
    
    // Store metadata in a separate transaction
    // This ensures the document update is processed first
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
      console.log('📍 Stored ranges:', rangeInfo);
    });
    
    console.log('🔄 All transactions complete, Hocuspocus will broadcast');
    
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
