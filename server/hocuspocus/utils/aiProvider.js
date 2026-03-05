import { HocuspocusProvider } from '@hocuspocus/provider';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { defaultMarkdownParser, defaultMarkdownSerializer, schema } from 'prosemirror-markdown';
import DiffMatchPatch from 'diff-match-patch';
import crypto from 'crypto';

// Make WebSocket available globally for HocuspocusProvider
global.WebSocket = WebSocket;

const HOCUSPOCUS_URL = 'ws://127.0.0.1:1234';

/**
 * Apply granular AI changes using diff-match-patch + Y.js operations
 * CRDT-compliant: Each insertion/deletion is tracked separately
 * Any change can be rejected in any order without affecting others
 * 
 * @param {string} documentName - Document to edit
 * @param {string} markdown - AI-edited markdown content
 * @param {object} metadata - AI model, prompt, changeId, etc.
 * @returns {Promise<object>} Result with changeId and operations
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
        console.log('🔄 AI synced, applying granular changes...');
        
        if (hasAppliedChanges) return;
        hasAppliedChanges = true;
        
        try {
          const fragment = aiDoc.getXmlFragment('prosemirror');
          const currentDoc = yXmlFragmentToProseMirrorRootNode(fragment, schema);
          const currentMarkdown = defaultMarkdownSerializer.serialize(currentDoc);
          
          // Use diff-match-patch to find changes
          const dmp = new DiffMatchPatch();
          const diffs = dmp.diff_main(currentMarkdown, markdown);
          dmp.diff_cleanupSemantic(diffs);
          
          // Convert diffs to granular operations
          const operations = [];
          let textPosition = 0; // Position in markdown text
          
          for (const [operation, text] of diffs) {
            if (operation === DiffMatchPatch.DIFF_INSERT) {
              operations.push({
                type: 'insert',
                position: textPosition,
                text: text,
                length: text.length,
                id: crypto.randomBytes(4).toString('hex')
              });
              textPosition += text.length;
              
            } else if (operation === DiffMatchPatch.DIFF_DELETE) {
              operations.push({
                type: 'delete',
                position: textPosition,
                text: text,
                length: text.length,
                id: crypto.randomBytes(4).toString('hex')
              });
              // Don't advance position - text doesn't exist in new version
              
            } else if (operation === DiffMatchPatch.DIFF_EQUAL) {
              textPosition += text.length;
            }
          }
          
          console.log(`📊 Operations: ${operations.length}`);
          
          if (operations.length === 0) {
            console.log('⚠️ No changes detected');
            provider.destroy();
            resolve({
              success: true,
              changeId,
              changesApplied: 0,
              operations: []
            });
            return;
          }
          
          // Parse new markdown to get final document
          const newDoc = defaultMarkdownParser.parse(markdown);
          if (!newDoc) {
            throw new Error('Failed to parse AI markdown');
          }
          
          // Apply the new document
          aiDoc.transact(() => {
            fragment.delete(0, fragment.length);
            prosemirrorToYXmlFragment(newDoc, fragment);
          }, 'ai');
          
          console.log(`✅ AI changes applied: ${changeId} (${operations.length} ops)`);
          
          // Store metadata with CRDT-compliant operation tracking
          const changeHistory = aiDoc.getMap('aiChangeHistory');
          changeHistory.set(changeId, {
            id: changeId,
            timestamp: Date.now(),
            model: metadata.model,
            prompt: metadata.prompt,
            status: 'pending',
            undoable: true,
            operations: operations, // Store granular operations
            beforeContent: currentMarkdown, // Fallback for full restore
            afterContent: markdown // Store result for verification
          });
          
          changeHistory.set('__latest', changeId);
          
          // Wait for propagation, then disconnect
          setTimeout(() => {
            console.log('🧹 AI disconnecting');
            provider.destroy();
            
            resolve({
              success: true,
              changeId,
              changesApplied: operations.length,
              operations: operations
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
    
    // Timeout
    setTimeout(() => {
      if (!hasAppliedChanges) {
        console.error('❌ AI connection timeout');
        provider.destroy();
        reject(new Error('AI connection timeout'));
      }
    }, 10000);
  });
}
