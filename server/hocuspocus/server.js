import express from "express";
import { hocuspocusServer } from "./config/hocuspocus.js";
import { corsMiddleware } from "./utils/cors.js";

const app = express();

// Middleware
app.use(express.json({ limit: "2mb" }));
app.use(corsMiddleware);

// Make hocuspocus server available to routes
app.locals.hocuspocusServer = hocuspocusServer;

// Health check
app.get("/health", (req, res) => res.status(200).send("ok"));

// Start servers
(async () => {
  await hocuspocusServer.listen();
  
  const HTTP_PORT = 3001;
  app.listen(HTTP_PORT, () => {
    console.log('✨ Hocuspocus server is running on ws://127.0.0.1:1234');
  });
})();
