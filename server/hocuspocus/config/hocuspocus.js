import { Server } from "@hocuspocus/server";
import { S3 } from "@hocuspocus/extension-s3";
import * as Y from 'yjs';

const s3Extension = new S3({
  endpoint: 'http://localhost:9102',
  bucket: 'auc-chat-storage',
  region: 'eu-west-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'admin',
    secretAccessKey: 'admin123'
  },
  // Ensure documents are saved with proper naming
  prefix: 'documents/', // This ensures all documents are stored under documents/ prefix
});

// Store live documents for AI import access
const liveDocuments = new Map();

// Store undo managers for each document (for AI change rejection)
const undoManagers = new Map();

// Store connections for broadcasting
const documentConnections = new Map();

export const hocuspocusServer = new Server({
  name: "hocuspocus-server",
  port: 1234,
  debounce: 2000,      // Wait 2s after last change before saving
  maxDebounce: 10000,  // Force save every 10s regardless
  extensions: [s3Extension],
  
  async onConnect(data) {
    console.log('🔮 Client connected to document:', data.documentName);
    
    // Track connections for broadcasting
    if (!documentConnections.has(data.documentName)) {
      documentConnections.set(data.documentName, new Set());
    }
    documentConnections.get(data.documentName).add(data.connection);
  },
  
  async onDisconnect(data) {
    console.log('👋 Client disconnected from document:', data.documentName);
    
    // Remove connection
    const connections = documentConnections.get(data.documentName);
    if (connections) {
      connections.delete(data.connection);
      if (connections.size === 0) {
        documentConnections.delete(data.documentName);
      }
    }
  },

  async onChange(data) {
    console.log('📝 Document changed:', data.documentName);
    console.log('📝 Update size:', data.update?.length || 0, 'bytes');
  },
  
  async onCreate(data) {
    console.log('✨ New document created:', data.documentName);
    console.log('📝 Document will be saved to S3 automatically on first change');
  },
  
  async onLoadDocument(data) {
    // Track live documents for AI import access
    liveDocuments.set(data.documentName, data.document);
    
    // Create and store undo manager for AI changes
    const fragment = data.document.getXmlFragment('prosemirror');
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai'])
    });
    undoManagers.set(data.documentName, undoManager);
    
    console.log('📚 Document loaded in memory:', data.documentName);
    console.log('↩️  UndoManager created for AI changes');
    
    return data.document;
  },
  
  async onStoreDocument(data) {
    console.log('💾 Save triggered for document:', data.documentName);
    console.log('💾 Document size:', data.document.length, 'bytes');
    // S3 extension handles the actual saving
  },
  
  async afterStoreDocument(data) {
    console.log('✅ Document saved to S3:', data.documentName);
  },
  
  async onDestroy(data) {
    // Clean up when document is destroyed
    liveDocuments.delete(data.documentName);
    undoManagers.delete(data.documentName);
    console.log('🗑️ Document removed from memory:', data.documentName);
  },
});

// Export function to get live document
export function getLiveDocument(documentName) {
  return liveDocuments.get(documentName);
}

// Export function to get undo manager
export function getUndoManager(documentName) {
  return undoManagers.get(documentName);
}

// Export function to get connections for a document
export function getDocumentConnections(documentName) {
  const connections = documentConnections.get(documentName);
  return connections ? Array.from(connections) : [];
}

// Export the server instance for broadcasting
export { hocuspocusServer as server };

export { s3Extension };
