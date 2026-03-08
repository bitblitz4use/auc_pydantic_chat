import express from 'express';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { applyAIChangesAsCollaborator } from '../utils/aiProvider.js';
import { getLiveDocument, getUndoManager } from '../config/hocuspocus.js';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import { defaultMarkdownParser } from 'prosemirror-markdown';
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
 * POST /api/ai/import
 * Body: { 
 *   documentName: string, 
 *   markdown: string,
 *   metadata?: { model: string, prompt: string, changeId: string }
 * }
 * 
 * Production-ready implementation:
 * - Uses Yjs relative positions for stable change tracking
 * - Ensures Hocuspocus hooks fire for proper broadcasting
 * - Handles both connected and disconnected document states
 */
router.post('/import', async (req, res) => {
  try {
    const { documentName, markdown, metadata = {} } = req.body;
    
    if (!documentName || typeof markdown !== 'string' || !markdown.trim()) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentName and markdown content'
      });
    }
    
    console.log(`🤖 AI Import: ${documentName}`);
    
    // Use AI provider approach - AI connects as a collaborator
    console.log('🤖 AI connecting as collaborator...');
    
    const result = await applyAIChangesAsCollaborator(documentName, markdown, metadata);
    
    console.log(`✅ Applied: ${result.changeId} (AI disconnected)`);
    
    res.json({
      success: true,
      documentName,
      changeId: result.changeId,
      changesApplied: result.changesApplied,
      broadcast: 'as-collaborator'
    });
    
  } catch (error) {
    console.error('❌ Import error:', error);
    res.status(500).json({ 
      error: 'Failed to import',
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
 * Reject an AI change - undoes it on the server and broadcasts to all clients
 * Body: { documentName: string, changeId: string }
 */
router.post('/reject', async (req, res) => {
  try {
    const { documentName, changeId } = req.body;
    
    if (!changeId || !documentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentName and changeId'
      });
    }
    
    console.log(`❌ Reject request: ${documentName} / ${changeId}`);
    
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
    
    // CRDT-compliant reject: Restore previous state for this specific change
    if (!change.beforeContent) {
      return res.status(400).json({ 
        error: 'No previous content available',
        hint: 'This change cannot be rejected (before content missing)'
      });
    }
    
    console.log('🔄 CRDT reject: Restoring content from before this AI change...');
    console.log(`   Operations in this change: ${change.operations?.length || 0}`);
    console.log(`   Before: ${change.beforeContent.length} chars`);
    
    // Parse the previous markdown
    const previousDoc = defaultMarkdownParser.parse(change.beforeContent);
    
    if (!previousDoc) {
      return res.status(500).json({ error: 'Failed to parse previous content' });
    }
    
    // Apply previous document
    const fragment = liveDoc.getXmlFragment('prosemirror');
    
    liveDoc.transact(() => {
      fragment.delete(0, fragment.length);
      prosemirrorToYXmlFragment(previousDoc, fragment);
    }, 'reject-ai');
    
    console.log(`✅ Content restored (rejected change: ${changeId})`);
    
    // Mark as rejected
    const updated = {
      ...change,
      status: 'rejected',
      rejectedAt: Date.now(),
      undoable: false
    };
    
    changeHistory.set(changeId, updated);
    
    console.log(`✅ Change rejected: ${changeId}`);
    console.log('📡 Reverted state broadcasted to all clients');
    
    res.json({
      success: true,
      changeId,
      status: 'rejected'
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
 * Accept an AI change - marks it as accepted
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
    const change = changeHistory.get(changeId);
    
    if (!change) {
      return res.status(404).json({ 
        error: 'Change not found',
        changeId 
      });
    }
    
    // Mark as accepted
    const updated = {
      ...change,
      status: 'accepted',
      acceptedAt: Date.now()
    };
    
    changeHistory.set(changeId, updated);
    
    console.log(`✅ Change accepted: ${changeId}`);
    
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
