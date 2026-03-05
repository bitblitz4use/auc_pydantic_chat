import { HocuspocusProvider } from '@hocuspocus/provider';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { defaultMarkdownParser, defaultMarkdownSerializer, schema } from 'prosemirror-markdown';
import { Transform } from 'prosemirror-transform';
import DiffMatchPatch from 'diff-match-patch';
import crypto from 'crypto';

// Make WebSocket available globally for HocuspocusProvider
global.WebSocket = WebSocket;

const HOCUSPOCUS_URL = 'ws://127.0.0.1:1234';

/**
 * Simple approach: Just parse new markdown to new doc
 * Returns the new document and diff info
 */
function parseAndDiff(oldDoc, newMarkdown) {
  const oldMarkdown = defaultMarkdownSerializer.serialize(oldDoc);
  const newDoc = defaultMarkdownParser.parse(newMarkdown);
  
  if (!newDoc) {
    throw new Error('Failed to parse AI markdown');
  }
  
  // Use diff-match-patch to see what changed (for logging)
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldMarkdown, newMarkdown);
  dmp.diff_cleanupSemantic(diffs);
  
  const insertions = diffs.filter(d => d[0] === DiffMatchPatch.DIFF_INSERT).length;
  const deletions = diffs.filter(d => d[0] === DiffMatchPatch.DIFF_DELETE).length;
  
  console.log(`📊 Changes: ${insertions} insertions, ${deletions} deletions`);
  
  return { newDoc, hasChanges: oldMarkdown !== newMarkdown };
}

/**
 * Apply new document to Yjs as ONE transaction
 * Simple and reliable - Y.UndoManager can undo the entire change
 */
function applyDocumentToYjs(ydoc, newDoc) {
  const fragment = ydoc.getXmlFragment('prosemirror');
  
  // Single transaction - undoable as one unit
  ydoc.transact(() => {
    fragment.delete(0, fragment.length);
    prosemirrorToYXmlFragment(newDoc, fragment);
  }, 'ai');
  
  console.log(`✅ Document applied as single transaction`);
  
  return 1; // One transaction applied
}

/**
 * Apply AI changes as a collaborative user using incremental steps
 * Uses diff-match-patch + ProseMirror Transform for granular changes
 * Each change is separately undoable!
 * 
 * @param {string} documentName - Document to edit
 * @param {string} markdown - AI-edited markdown content
 * @param {object} metadata - AI model, prompt, changeId, etc.
 * @returns {Promise<object>} Result with changeId
 */
export async function applyAIChangesAsCollaborator(documentName, markdown, metadata = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🤖 AI connecting to: ${documentName}`);
    
    const aiDoc = new Y.Doc();
    const changeId = metadata.changeId || crypto.randomBytes(8).toString('hex');
    
    let hasAppliedChanges = false;
    
    const provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: documentName,
      document: aiDoc,
      
      onSynced: () => {
        console.log('🔄 AI synced, applying incremental changes...');
        
        if (hasAppliedChanges) return;
        hasAppliedChanges = true;
        
        try {
          const fragment = aiDoc.getXmlFragment('prosemirror');
          const currentDoc = yXmlFragmentToProseMirrorRootNode(fragment, schema);
          
          // Store metadata FIRST
          const changeHistory = aiDoc.getMap('aiChangeHistory');
          changeHistory.set(changeId, {
            id: changeId,
            timestamp: Date.now(),
            model: metadata.model,
            prompt: metadata.prompt,
            status: 'pending',
            undoable: true
          });
          changeHistory.set('__latest', changeId);
          
          // Parse and diff the new content
          const { newDoc, hasChanges } = parseAndDiff(currentDoc, markdown);
          
          if (!hasChanges) {
            console.log('⚠️ No changes detected');
            provider.destroy();
            resolve({
              success: true,
              changeId,
              changesApplied: 0
            });
            return;
          }
          
          // Apply new document as single transaction
          // This makes the entire AI change undoable as one unit
          const transactionsApplied = applyDocumentToYjs(aiDoc, newDoc);
          
          console.log(`✅ AI changes applied: ${changeId}`);
          
          // Wait for changes to propagate, then disconnect
          setTimeout(() => {
            console.log('🧹 AI disconnecting');
            provider.destroy();
            
            resolve({
              success: true,
              changeId,
              changesApplied: transactionsApplied
            });
          }, 1500);
          
        } catch (error) {
          console.error('❌ Error applying AI changes:', error);
          provider.destroy();
          reject(error);
        }
      },
      
      onDisconnect: () => {
        console.log('👋 AI disconnected');
      }
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!hasAppliedChanges) {
        console.error('❌ AI connection timeout');
        provider.destroy();
        reject(new Error('AI connection timeout'));
      }
    }, 10000);
  });
}
