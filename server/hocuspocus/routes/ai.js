import express from 'express';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { applyAIChangesAsCollaborator } from '../utils/aiProvider.js';
import { getLiveDocument, getUndoManager } from '../config/hocuspocus.js';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import { defaultMarkdownParser } from 'prosemirror-markdown';
import * as Y from 'yjs';

const router = express.Router();

/**
 * GET /api/ai/export/:documentName
 * Export document as Markdown for AI processing
 */
router.get('/export/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
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
      message: error.message,
      documentName: req.params.documentName,
    });
  }
});

/**
 * POST /api/ai/import/:documentName
 * Body: Raw markdown (Content-Type: text/markdown or text/plain)
 * Headers: X-AI-Model, X-AI-Prompt, X-AI-Change-Id (optional)
 * 
 * Production-ready implementation:
 * - Uses Yjs relative positions for stable change tracking
 * - Ensures Hocuspocus hooks fire for proper broadcasting
 * - Handles both connected and disconnected document states
 */
router.post('/import/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
    const markdown = req.body;
    
    if (typeof markdown !== 'string' || !markdown.trim()) {
      return res.status(400).json({ 
        error: 'Send raw markdown with Content-Type: text/markdown or text/plain'
      });
    }
    
    console.log(`🤖 AI Import: ${documentName}`);
    
    const metadata = {
      model: req.headers['x-ai-model'],
      prompt: req.headers['x-ai-prompt'],
      changeId: req.headers['x-ai-change-id']
    };
    
    // Use AI provider approach - AI connects as a collaborator
    // This triggers all Hocuspocus hooks and awareness propagation
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
      message: error.message,
      documentName: req.params.documentName
    });
  }
});

/**
 * GET /api/ai/changes/:documentName
 * Get all active AI changes for a document
 */
router.get('/changes/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
    
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
 * POST /api/ai/reject/:documentName/:changeId
 * Reject an AI change - undoes it on the server and broadcasts to all clients
 */
router.post('/reject/:documentName/:changeId', async (req, res) => {
  try {
    const { documentName, changeId } = req.params;
    
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
    // This is done by re-applying the before content
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
    // Note: This is a full restore for this change's context
    // In a true CRDT implementation, we'd track Y.RelativePositions
    // and delete only the specific insertions, but markdown editing
    // makes full-doc replacement the pragmatic choice
    const fragment = liveDoc.getXmlFragment('prosemirror');
    
    liveDoc.transact(() => {
      fragment.delete(0, fragment.length);
      prosemirrorToYXmlFragment(previousDoc, fragment);
    }, 'reject-ai'); // Use distinct origin
    
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
 * POST /api/ai/accept/:documentName/:changeId
 * Accept an AI change - marks it as accepted
 */
router.post('/accept/:documentName/:changeId', async (req, res) => {
  try {
    const { documentName, changeId } = req.params;
    
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
