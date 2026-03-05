import express from 'express';
import { yjsToMarkdown } from '../utils/markdownConverter.js';
import { applyIncrementalAIChanges } from '../utils/diffApplicator.js';
import { getDocumentKey } from '../utils/documentManager.js';
import { minioClient, BUCKET_NAME } from '../config/minio.js';
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
    
    // Try to get live document first (fastest)
    const hocuspocus = req.app.locals.hocuspocusServer;
    let ydoc;
    let source = 'memory';
    
    // Check if document is loaded in memory
    try {
      // Use getDocument() which returns the document if loaded
      ydoc = await hocuspocus.getDocument(documentName);
      console.log(`✅ Document loaded from memory`);
    } catch (err) {
      console.log(`📦 Document not in memory, loading from S3...`);
      source = 's3';
      
      try {
        const objectName = getDocumentKey(documentName);
        const chunks = [];
        const stream = await minioClient.getObject(BUCKET_NAME, objectName);
        
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        
        const yjsBinary = Buffer.concat(chunks);
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
    
    // Convert to Markdown
    const yjsBinary = Y.encodeStateAsUpdate(ydoc);
    const markdown = yjsToMarkdown(yjsBinary);
    
    console.log(`✅ Exported ${markdown.length} chars from ${source}`);
    
    // Return raw markdown with proper MIME type
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
    
    const hocuspocus = req.app.locals.hocuspocusServer;
    let ydoc;
    
    try {
      ydoc = await hocuspocus.getDocument(documentName);
    } catch (err) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        hint: 'Open document in editor first'
      });
    }
    
    const metadata = {
      model: req.headers['x-ai-model'],
      prompt: req.headers['x-ai-prompt'],
      changeId: req.headers['x-ai-change-id']
    };
    
    const result = applyIncrementalAIChanges(ydoc, markdown, metadata);
    
    ydoc.getMap('aiMeta').set('lastEdit', {
      timestamp: Date.now(),
      ...metadata,
      ...result
    });
    
    console.log(`✅ Applied: ${result.changeId} (${result.changesApplied} changes)`);
    
    res.json({
      success: true,
      documentName,
      changeId: result.changeId,
      changesApplied: result.changesApplied
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
 * GET /api/ai/metadata/:documentName
 * Get AI edit metadata for a document
 */
router.get('/metadata/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
    
    const hocuspocus = req.app.locals.hocuspocusServer;
    let ydoc;
    
    try {
      ydoc = await hocuspocus.getDocument(documentName);
    } catch (err) {
      return res.status(404).json({ 
        error: 'Document not loaded',
        documentName
      });
    }
    
    const metaMap = ydoc.getMap('aiMeta');
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
