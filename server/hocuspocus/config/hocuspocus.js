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
  }
});

export const hocuspocusServer = new Server({
  name: "hocuspocus-server",
  port: 1234,
  debounce: 2000,      // Wait 2s after last change before saving
  maxDebounce: 10000,  // Force save every 10s regardless
  extensions: [s3Extension],
  
  async onConnect() {
    console.log('🔮 Client connected');
  },
  
  async onDisconnect() {
    console.log('👋 Client disconnected');
  },
  
  async onLoadDocument(data) {
    console.log('📄 Loading document from S3:', data.documentName);
    return undefined; // Let S3 extension handle loading
  },
  
  async onCreate(data) {
    console.log('✨ New document created:', data.documentName);
    console.log('📝 Document will be saved to S3 automatically on first change');
  },
  
  async onStoreDocument(data) {
    console.log('💾 Save triggered for document:', data.documentName);
    console.log('💾 Document size:', data.document.length, 'bytes');
  },
  
  async afterStoreDocument(data) {
    console.log('✅ Document saved to S3:', data.documentName);
  },
});

export { s3Extension };
