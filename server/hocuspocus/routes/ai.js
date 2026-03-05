import express from 'express';
import { yjsToMarkdown, applyAIMarkdown } from '../utils/markdownConverter.js';
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
 * Apply AI-edited Markdown back to document
 * Body: { markdown: string, metadata?: { model?: string, changeId?: string } }
 */
router.post('/import/:documentName', async (req, res) => {
  try {
    const { documentName } = req.params;
    const { markdown, metadata = {} } = req.body;
    
    console.log(`🤖 AI Import requested for: ${documentName}`);
    
    if (!markdown) {
      return res.status(400).json({ 
        error: 'Missing markdown field in request body',
        expected: '{ "markdown": "content here", "metadata": {...} }'
      });
    }
    
    // Get live document (must be open in editor for real-time sync)
    const hocuspocus = req.app.locals.hocuspocusServer;
    let ydoc;
    
    try {
      ydoc = await hocuspocus.getDocument(documentName);
    } catch (err) {
      return res.status(404).json({ 
        error: 'Document not loaded in memory',
        documentName,
        hint: 'Please open the document in an editor first. AI changes require an active connection for real-time sync and undo support.'
      });
    }
    
    // Apply AI changes with 'ai' transaction origin
    applyAIMarkdown(ydoc, markdown);
    
    // Store metadata
    const metaMap = ydoc.getMap('aiMeta');
    metaMap.set('lastEdit', {
      timestamp: Date.now(),
      ...metadata,
    });
    
    console.log(`✅ AI changes applied to: ${documentName}`);
    if (metadata.model) {
      console.log(`   Model: ${metadata.model}`);
    }
    if (metadata.changeId) {
      console.log(`   Change ID: ${metadata.changeId}`);
    }
    
    res.json({
      success: true,
      documentName,
      length: markdown.length,
      appliedAt: new Date().toISOString(),
      metadata,
    });
    
  } catch (error) {
    console.error('❌ Import error:', error);
    res.status(500).json({ 
      error: 'Failed to import AI changes',
      message: error.message,
      documentName: req.params.documentName,
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
