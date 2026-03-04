"use client";

import { Crepe } from "@milkdown/crepe";
import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

// Document name - you can make this dynamic based on your needs
const DOCUMENT_NAME = "shared-document";

export function MilkdownEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "synced">("disconnected");

  // Connect to Hocuspocus server
  const connect = useCallback(() => {
    if (providerRef.current && isConnected) {
      console.log("Already connected");
      return;
    }

    if (!ydocRef.current) {
      console.warn("Yjs document not initialized");
      return;
    }

    if (!providerRef.current) {
      setConnectionStatus("connecting");

      // Create Hocuspocus provider
      const provider = new HocuspocusProvider({
        url: "ws://127.0.0.1:1234",
        name: DOCUMENT_NAME,
        document: ydocRef.current,
        onConnect: () => {
          console.log("🔮 Connected to Hocuspocus server");
          setIsConnected(true);
          setConnectionStatus("connected");
        },
        onDisconnect: ({ event }) => {
          console.log("👋 Disconnected from Hocuspocus server", event);
          setIsConnected(false);
          setConnectionStatus("disconnected");
        },
        onSynced: ({ state }) => {
          console.log("✅ Document synced", state);
          setConnectionStatus("synced");
        },
        onStatus: ({ status }) => {
          console.log("📊 Connection status:", status);
        },
      });

      providerRef.current = provider;
    } else {
      // Reconnect if provider exists but disconnected
      providerRef.current.connect();
    }
  }, [isConnected]);

  // Disconnect from Hocuspocus server
  const disconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.disconnect();
      setIsConnected(false);
      setConnectionStatus("disconnected");
      console.log("🔌 Manually disconnected from server");
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Initialize Crepe editor
    // Note: To fully integrate the collab plugin, you may need to:
    // 1. Check if Crepe supports plugins in its configuration
    // 2. Or access the underlying Milkdown editor instance and configure collab there
    // 3. The collab plugin from @milkdown/plugin-collab needs to be configured with the Yjs document
    const crepe = new Crepe({
      root: editorRef.current,
      defaultValue: "Hello, Milkdown!",
      // If Crepe supports plugins, you would configure collab here:
      // plugins: [collab({ document: ydoc })]
    });

    crepe.create().then(() => {
      crepeRef.current = crepe;

      // Set up Hocuspocus provider to sync the Yjs document
      setConnectionStatus("connecting");

      const provider = new HocuspocusProvider({
        url: "ws://127.0.0.1:1234",
        name: DOCUMENT_NAME,
        document: ydoc,
        onConnect: () => {
          console.log("🔮 Connected to Hocuspocus server");
          setIsConnected(true);
          setConnectionStatus("connected");
        },
        onDisconnect: ({ event }) => {
          console.log("👋 Disconnected from Hocuspocus server", event);
          setIsConnected(false);
          setConnectionStatus("disconnected");
        },
        onSynced: ({ state }) => {
          console.log("✅ Document synced", state);
          setConnectionStatus("synced");
        },
        onStatus: ({ status }) => {
          console.log("📊 Connection status:", status);
        },
      });

      providerRef.current = provider;

      // TODO: Configure @milkdown/plugin-collab with the Yjs document
      // This requires integrating the collab plugin with Crepe's editor instance
      // You may need to:
      // - Access crepe.editor or crepe.getEditor() if available
      // - Use the collab plugin: collab({ document: ydoc })
      // - Or configure it when initializing Crepe if it supports plugins
      console.log("Yjs document and Hocuspocus provider configured. Configure collab plugin to enable collaborative editing.");
    }).catch((error) => {
      console.error("Failed to create Crepe editor:", error);
    });

    // Cleanup on unmount
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
      setIsConnected(false);
      setConnectionStatus("disconnected");
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <div className="mx-auto flex w-full flex-1 flex-col">
        {/* Connection Status Bar */}
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
          <div className={`h-2 w-2 rounded-full ${
            connectionStatus === "synced" ? "bg-green-500" :
            connectionStatus === "connected" ? "bg-yellow-500" :
            connectionStatus === "connecting" ? "bg-blue-500 animate-pulse" :
            "bg-gray-500"
          }`} />
          <span className="text-sm text-muted-foreground">
            {connectionStatus === "synced" ? "Synced" :
             connectionStatus === "connected" ? "Connected" :
             connectionStatus === "connecting" ? "Connecting..." :
             "Disconnected"}
          </span>
          <div className="ml-auto flex gap-2">
            {!isConnected ? (
              <button
                onClick={connect}
                className="rounded px-3 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="rounded px-3 py-1 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div ref={editorRef} className="milkdown-editor-root h-full w-full overflow-auto bg-card" />
        </div>
      </div>
    </div>
  );
}
