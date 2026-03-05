import express from 'express';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { applyAIChangesAsCollaborator } from '../utils/aiProvider.js';
import { getLiveDocument } from '../config/hocuspocus.js';
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

export default router;
