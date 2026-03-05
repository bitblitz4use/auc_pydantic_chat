import express from 'express';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { applyIncrementalAIChanges } from '../utils/diffApplicator.js';
import { getDocumentKey, loadDocumentFromS3 } from '../utils/documentManager.js';
import { minioClient, BUCKET_NAME } from '../config/minio.js';
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
    
    // Try to get live document first
    const liveDoc = getLiveDocument(documentName);
    
    if (liveDoc) {
      // Document is in memory - apply changes directly
      // HocusPocus will automatically broadcast to connected clients
      console.log('📡 Document in memory, applying changes directly...');
      
      const result = applyIncrementalAIChanges(liveDoc, markdown, metadata);
      
      // HocusPocus will automatically:
      // 1. Broadcast changes to connected clients
      // 2. Trigger onChange hook
      // 3. Save to S3 via onStoreDocument hook
      
      console.log(`✅ Applied: ${result.changeId} (broadcasting automatically)`);
      
      res.json({
        success: true,
        documentName,
        changeId: result.changeId,
        changesApplied: result.changesApplied,
        broadcast: 'automatic'
      });
      
    } else {
      // Document not in memory - load from S3, apply, save
      console.log('💾 Document not in memory, loading from S3...');
      
      const yjsBinary = await loadDocumentFromS3(documentName);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, yjsBinary);
      
      const result = applyIncrementalAIChanges(ydoc, markdown, metadata);
      
      // Save to S3
      const updatedBinary = Y.encodeStateAsUpdate(ydoc);
      const buffer = Buffer.from(updatedBinary);
      await minioClient.putObject(BUCKET_NAME, getDocumentKey(documentName), buffer);
      
      console.log(`✅ Applied: ${result.changeId} (saved to S3, will sync on reconnect)`);
      
      res.json({
        success: true,
        documentName,
        changeId: result.changeId,
        changesApplied: result.changesApplied,
        broadcast: 'on-reconnect'
      });
    }
    
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
 * GET /api/ai/metadata/:documentName
 * Get AI edit metadata for a document
 */
router.get('/metadata/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
    
    const liveDoc = getLiveDocument(documentName);
    if (!liveDoc) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        documentName
      });
    }
    
    const metaMap = liveDoc.getMap('aiMeta');
    const lastEdit = metaMap.get('lastEdit');
    
    res.json({
      documentName,
      lastEdit: lastEdit || null,
    });
    
  } catch (error) {
    console.error('❌ Metadata error:', error);
    res.status(500).json({ 
      error: 'Failed to get metadata',
      message: error.message 
    });
  }
});

export default router;
