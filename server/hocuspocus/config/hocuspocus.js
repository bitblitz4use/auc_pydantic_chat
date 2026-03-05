import { Server } from "@hocuspocus/server";
import { S3 } from "@hocuspocus/extension-s3";

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

export const hocuspocusServer = new Server({
  name: "hocuspocus-server",
  port: 1234,
  debounce: 2000,      // Wait 2s after last change before saving
  maxDebounce: 10000,  // Force save every 10s regardless
  extensions: [s3Extension],
  
  async onConnect(data) {
    console.log('🔮 Client connected to document:', data.documentName);
  },
  
  async onDisconnect(data) {
    console.log('👋 Client disconnected from document:', data.documentName);
  },

  async onChange(data) {
    console.log('📝 Document changed:', data.documentName);
    console.log('📝 Update size:', data.update?.length || 0, 'bytes');
  },
  
  async onCreate(data) {
    console.log('✨ New document created:', data.documentName);
    console.log('📝 Document will be saved to S3 automatically on first change');
  },
  
  async onStoreDocument(data) {
    console.log('💾 Save triggered for document:', data.documentName);
    console.log('💾 Document size:', data.document.length, 'bytes');
    // S3 extension handles the actual saving
  },
  
  async afterStoreDocument(data) {
    console.log('✅ Document saved to S3:', data.documentName);
  },
});

export { s3Extension };
