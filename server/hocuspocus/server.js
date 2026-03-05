import express from "express";
import { hocuspocusServer } from "./config/hocuspocus.js";
import { corsMiddleware } from "./utils/cors.js";
import { documentExists, listDocuments } from "./utils/documentManager.js";
import aiRoutes from "./routes/ai.js";

const app = express();

// Middleware
app.use(express.json({ limit: "2mb" }));
app.use(corsMiddleware);

// Make hocuspocus server available to routes
app.locals.hocuspocusServer = hocuspocusServer;

// Health check
app.get("/health", (req, res) => res.status(200).send("ok"));

// Document management routes
app.get("/api/documents", async (req, res) => {
  try {
    const documents = await listDocuments();
    res.json({ documents });
  } catch (error) {
    console.error("Error listing documents:", error);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

app.get("/api/documents/:name/exists", async (req, res) => {
  try {
    const { name } = req.params;
    const exists = await documentExists(name);
    res.json({ exists, documentName: name });
  } catch (error) {
    console.error("Error checking document existence:", error);
    res.status(500).json({ error: "Failed to check document existence" });
  }
});

// AI routes
app.use("/api/ai", aiRoutes);

// Start servers
(async () => {
  console.log('🚀 Starting servers...');
  
  await hocuspocusServer.listen();
  console.log('✅ Hocuspocus WebSocket server started');
  
  const HTTP_PORT = 3001;
  const server = app.listen(HTTP_PORT, () => {
    console.log('✨ Hocuspocus server is running on ws://127.0.0.1:1234');
    console.log(`📡 HTTP API server is running on http://127.0.0.1:${HTTP_PORT}`);
    console.log(`🤖 AI endpoints: /api/ai/export/:doc and /api/ai/import/:doc`);
    console.log(`📋 Health check: http://127.0.0.1:${HTTP_PORT}/health`);
  });
  
  server.on('error', (error) => {
    console.error('❌ Express server error:', error);
  });
})();
