import express from 'express';
import crypto from 'crypto';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { getLiveDocument, getUndoManager, getDocumentConnections } from '../config/hocuspocus.js';
import { yXmlFragmentToProseMirrorRootNode, prosemirrorToYXmlFragment } from 'y-prosemirror';
import { defaultMarkdownParser, defaultMarkdownSerializer, schema } from 'prosemirror-markdown';
import * as Y from 'yjs';
import { loadDocumentFromS3 } from '../utils/documentManager.js';

const router = express.Router();

/**
 * GET /api/ai/export
 * Export document as Markdown for AI processing
 * Query parameter: documentName (required)
 */
router.get('/export', async (req, res) => {
  try {
    const documentName = req.query.documentName;
    
    if (!documentName) {
      return res.status(400).json({ 
        error: 'Missing required query parameter: documentName'
      });
    }
    
    console.log(`🤖 AI Export requested for: ${documentName}`);
    
    // Try live document first, fallback to S3
    let ydoc;
    let source = 'memory';
    
    const liveDoc = getLiveDocument(documentName);
    if (liveDoc) {
      ydoc = liveDoc;
      console.log('✅ Document loaded from memory');
    } else {
      source = 's3';
      console.log('📦 Document not in memory, loading from S3...');
      
      try {
        const yjsBinary = await loadDocumentFromS3(documentName);
        ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, yjsBinary);
      } catch (s3Error) {
        if (s3Error.code === 'NoSuchKey' || s3Error.code === 'NotFound') {
          return res.status(404).json({ 
            error: 'Document not found',
            documentName,
            hint: 'Create the document first by opening it in the editor'
          });
        }
        throw s3Error;
      }
    }
    
    const yjsBinary = Y.encodeStateAsUpdate(ydoc);
    const markdown = yjsToMarkdown(yjsBinary);
    
    console.log(`✅ Exported ${markdown.length} chars from ${source}`);
    
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${documentName}.md"`);
    res.send(markdown);
    
  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({ 
      error: 'Failed to export document',
      message: error.message
    });
  }
});

/**
 * POST /api/ai/suggest
 * Broadcast AI operations to connected clients (CLIENT-SIDE APPLICATION)
 * Body: { 
 *   documentName: string, 
 *   operations: Array<{type, pos, content, length?, description}>,
 *   metadata?: { model: string, prompt: string, summary: string, changeId: string }
 * }
 * 
 * NEW ARCHITECTURE (Incremental Operations):
 * - Server receives position-based operations (insert/replace/delete)
 * - Writes operations to Y.Map
 * - Yjs automatically syncs to all connected clients
 * - Clients observe the Map and apply operations incrementally
 * - Sends ONLY changed snippets, not full document
 * - Works WITH the CRDT framework (no custom WebSocket protocol needed)
 */
router.post('/suggest', async (req, res) => {
  try {
    const { documentName, operations, metadata = {} } = req.body;
    
    if (!documentName || !operations || !Array.isArray(operations)) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentName and operations array'
      });
    }
    
    console.log(`🤖 AI Suggest: Broadcasting ${operations.length} operations via Yjs for ${documentName}`);
    
    // Get live document
    const liveDoc = getLiveDocument(documentName);
    
    if (!liveDoc) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        hint: 'Open the document in the editor first',
        documentName
      });
    }
    
    // Generate changeId if not provided
    const changeId = metadata.changeId || `ai-${crypto.randomBytes(8).toString('hex')}`;
    
    // Write operations to Yjs Map - this automatically broadcasts to all clients
    const suggestions = liveDoc.getMap('__aiSuggestions');
    suggestions.set(changeId, {
      type: 'ai-operations',
      changeId,
      operations: operations,  // Array of position-based operations
      metadata: {
        ...metadata,
        changeId,
        timestamp: Date.now()
      },
      applied: false
    });
    
    console.log(`✅ AI operations written to Yjs (auto-broadcast to all clients)`);
    
    res.json({
      success: true,
      changeId,
      documentName,
      operationCount: operations.length,
      approach: 'yjs-native-operations'
    });
    
  } catch (error) {
    console.error('❌ Suggest error:', error);
    res.status(500).json({ 
      error: 'Failed to broadcast operations',
      message: error.message
    });
  }
});


/**
 * GET /api/ai/changes
 * Get all active AI changes for a document
 * Query parameter: documentName (required)
 */
router.get('/changes', async (req, res) => {
  try {
    const documentName = req.query.documentName;
    
    if (!documentName) {
      return res.status(400).json({ 
        error: 'Missing required query parameter: documentName'
      });
    }
    
    const liveDoc = getLiveDocument(documentName);
    if (!liveDoc) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        documentName,
        hint: 'Open the document in the editor first'
      });
    }
    
    const changeHistory = liveDoc.getMap('aiChangeHistory');
    const changes = [];
    
    changeHistory.forEach((value, key) => {
      if (key.startsWith('__')) return;
      if (value.undoable) {
        changes.push({
          id: key,
          timestamp: value.timestamp,
          model: value.model
        });
      }
    });
    
    res.json({
      documentName,
      changes,
      count: changes.length
    });
    
  } catch (error) {
    console.error('❌ Changes error:', error);
    res.status(500).json({ 
      error: 'Failed to get changes',
      message: error.message 
    });
  }
});

/**
 * POST /api/ai/reject
 * Reject an AI change - with CLIENT-SIDE application, just mark as rejected
 * Body: { documentName: string, changeId: string }
 * 
 * NEW ARCHITECTURE:
 * - Client applies changes via ProseMirror transactions
 * - Client can undo via editor's built-in undo (Ctrl+Z)
 * - This endpoint just marks the change as rejected in metadata
 */
router.post('/reject', async (req, res) => {
  try {
    const { documentName, changeId } = req.body;
    
    if (!changeId || !documentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentName and changeId'
      });
    }
    
    console.log(`❌ Reject request (metadata only): ${documentName} / ${changeId}`);
    
    const liveDoc = getLiveDocument(documentName);
    if (!liveDoc) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        documentName,
        hint: 'Open the document in the editor first'
      });
    }
    
    // Get change metadata
    const changeHistory = liveDoc.getMap('aiChangeHistory');
    const persistedMeta = liveDoc.getMap('__persistedMetadata');
    const change = changeHistory.get(changeId);
    
    if (!change) {
      return res.status(404).json({ 
        error: 'Change not found',
        changeId 
      });
    }
    
    if (change.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Change already processed',
        status: change.status 
      });
    }
    
    // Mark as rejected in metadata only
    // The actual undo should be done client-side via editor undo
    liveDoc.transact(() => {
      const updated = {
        ...change,
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectionMethod: 'client-side-undo',
        undoable: false
      };
      changeHistory.set(changeId, updated);
      
      // Persist rejection
      persistedMeta.set(`change_${changeId}_status`, 'rejected');
      persistedMeta.set(`change_${changeId}_rejectedAt`, Date.now());
    }, 'reject-metadata');
    
    console.log(`✅ Change marked as rejected: ${changeId}`);
    console.log('ℹ️  Client should undo via editor (Ctrl+Z)');
    
    res.json({
      success: true,
      changeId,
      status: 'rejected',
      method: 'client-side-undo',
      hint: 'Use editor undo (Ctrl+Z) to revert the change'
    });
    
  } catch (error) {
    console.error('❌ Reject error:', error);
    res.status(500).json({ 
      error: 'Failed to reject change',
      message: error.message 
    });
  }
});

/**
 * POST /api/ai/accept
 * Accept an AI change - marks it as accepted and persists to S3
 * Body: { documentName: string, changeId: string }
 */
router.post('/accept', async (req, res) => {
  try {
    const { documentName, changeId } = req.body;
    
    if (!changeId || !documentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentName and changeId'
      });
    }
    
    console.log(`✅ Accept request: ${documentName} / ${changeId}`);
    
    const liveDoc = getLiveDocument(documentName);
    if (!liveDoc) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        documentName
      });
    }
    
    const changeHistory = liveDoc.getMap('aiChangeHistory');
    const persistedMeta = liveDoc.getMap('__persistedMetadata');
    const change = changeHistory.get(changeId);
    
    if (!change) {
      return res.status(404).json({ 
        error: 'Change not found',
        changeId 
      });
    }
    
    // Update in transaction so it's saved to S3
    liveDoc.transact(() => {
      // Update in-memory history
      const updated = {
        ...change,
        status: 'accepted',
        acceptedAt: Date.now()
      };
      changeHistory.set(changeId, updated);
      
      // Update persisted metadata (survives reload)
      persistedMeta.set(`change_${changeId}_status`, 'accepted');
      persistedMeta.set(`change_${changeId}_acceptedAt`, Date.now());
    }, 'accept-ai');
    
    console.log(`✅ Change accepted: ${changeId} (persisted to S3)`);
    
    res.json({
      success: true,
      changeId,
      status: 'accepted'
    });
    
  } catch (error) {
    console.error('❌ Accept error:', error);
    res.status(500).json({ 
      error: 'Failed to accept change',
      message: error.message 
    });
  }
});

export default router;
