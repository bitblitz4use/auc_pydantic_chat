"use client";

import { Editor, rootCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { collab, collabServiceCtx, CollabService } from "@milkdown/plugin-collab";
import { block } from "@milkdown/kit/plugin/block";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

// Import new components
import { EditorToolbar } from "./editor-toolbar";
import { useEditorCommands } from "./hooks/use-editor-commands";
import { useAIChangeTracker } from "./hooks/use-ai-change-tracker";

// Import AI highlight styles
import "./styles/ai-highlights.css";

// API base URL
const API_BASE = "http://127.0.0.1:3001";

// Custom plugin to handle Enter key on empty list items
const exitListPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('exitList'),
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Enter' || event.shiftKey) {
          return false;
        }

        const { state, dispatch } = view;
        const { selection, schema } = state;
        const { $from } = selection;

        // Check if we're in a list item
        let listItemDepth = -1;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'list_item') {
            listItemDepth = d;
            break;
          }
        }

        if (listItemDepth === -1) {
          return false; // Not in a list
        }

        const listItem = $from.node(listItemDepth);
        
        // Check if the list item is empty (only contains an empty paragraph)
        if (listItem.childCount === 1) {
          const child = listItem.child(0);
          if (child.type.name === 'paragraph' && child.content.size === 0) {
            // Exit the list by lifting the empty list item
            const pos = $from.before(listItemDepth);
            const tr = state.tr.delete(pos, pos + listItem.nodeSize);
            
            // Insert a paragraph after the list
            const paragraph = schema.nodes.paragraph.create();
            tr.insert(pos, paragraph);
            
            // Set cursor in the new paragraph
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
            
            dispatch(tr);
            return true;
          }
        }

        return false;
      },
    },
  });
});

// Props for the editor component
interface MilkdownEditorProps {
  documentName?: string; // Optional: if not provided, will use default or prompt
}

function MilkdownEditorInner({ documentName: propDocumentName }: MilkdownEditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "synced">("disconnected");
  const [currentDocumentName, setCurrentDocumentName] = useState<string>(propDocumentName || "shared-document");
  const [availableDocuments, setAvailableDocuments] = useState<Array<{ name: string; size: number; lastModified: Date }>>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  // These refs will be passed to the editor
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const collabServiceRef = useRef<CollabService | null>(null);
  const collabConnectedRef = useRef<boolean>(false); // Track if we've connected

  // Load list of available documents
  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);
    try {
      const response = await fetch(`${API_BASE}/api/documents`);
      const data = await response.json();
      setAvailableDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, []);

  // Load documents list on mount
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Initialize Yjs document and Hocuspocus provider
  useEffect(() => {
    console.log("🚀 Initializing for document:", currentDocumentName);
    setConnectionStatus("connecting");

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Set up Hocuspocus provider (auto-connects by default)
    const provider = new HocuspocusProvider({
      url: "ws://127.0.0.1:1234",
      name: currentDocumentName,
      document: ydoc,
      onConnect: () => {
        console.log("🔮 Connected to server");
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        console.log("👋 Disconnected");
        setConnectionStatus("disconnected");
      },
      onSynced: () => {
        console.log("✅ Document synced");
        setConnectionStatus("synced");
        loadDocuments();
      },
      onStatus: ({ status }) => {
        console.log("📊 Status:", status);
      },
    });

    providerRef.current = provider;

    return () => {
      console.log("🧹 Cleanup");
      
      // Disconnect CollabService before destroying
      if (collabServiceRef.current && collabConnectedRef.current) {
        try {
          collabServiceRef.current.disconnect();
          console.log("🔌 CollabService disconnected");
        } catch (error) {
          // Ignore errors during cleanup
          console.warn("Error disconnecting CollabService:", error);
        }
      }
      
      provider?.destroy();
      ydoc?.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      collabServiceRef.current = null;
      collabConnectedRef.current = false; // Reset connected flag
      setConnectionStatus("disconnected");
    };
  }, [currentDocumentName, loadDocuments]);

  // Use AI change tracker hook
  const aiTracker = useAIChangeTracker(ydocRef.current, currentDocumentName);

  // Create editor - this will recreate when connection status changes
  const { get, loading } = useEditor((root) => {
    const ydoc = ydocRef.current;
    const provider = providerRef.current;
    
    // Only create collaborative editor when synced
    if (connectionStatus !== "synced" || !ydoc || !provider?.awareness) {
      console.log("⏳ Waiting for sync...");
      return Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
        })
        .use(commonmark)
        .use(listener)
        .use(clipboard)
        .use(history)
        .use(block)
        .use(exitListPlugin);
    }

    console.log("✅ Creating collaborative editor");
    
    // Create and configure CollabService (but don't connect yet)
    const collabService = new CollabService();
    collabService
      .bindDoc(ydoc)
      .setAwareness(provider.awareness);
    
    // Store in ref so we can connect it later
    collabServiceRef.current = collabService;
    
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(collabServiceCtx, collabService);
      })
      .use(commonmark)
      .use(listener)
      .use(clipboard)
      .use(history)
      .use(collab)
      .use(block)
      .use(exitListPlugin);
  }, [connectionStatus]); // Only recreate when connection status changes

  // Connect CollabService after editor is ready
  useEffect(() => {
    // Only try to connect if we're synced and have a CollabService
    // AND we haven't already connected (prevent multiple connect() calls)
    if (loading || connectionStatus !== "synced" || !collabServiceRef.current || collabConnectedRef.current) return;
    
    const editor = get();
    if (!editor) return;

    console.log("🔗 Editor ready, connecting CollabService...");
    
    let isCancelled = false;
    
    // Connect the CollabService with the editor context
    // Use setTimeout to ensure all plugins are fully initialized
    const timeoutId = setTimeout(() => {
      // Don't connect if the effect was cleaned up (document switched)
      if (isCancelled) return;
      
      try {
        const currentEditor = get();
        const collabService = collabServiceRef.current;
        
        // Verify editor and service are still valid
        if (!currentEditor || !collabService) return;
        
        currentEditor.action((ctx) => {
          collabService
            .bindCtx(ctx)
            .connect();
          collabConnectedRef.current = true; // Mark as connected
          
          console.log("✅ CollabService connected");
        });
      } catch (error) {
        console.error("❌ Failed to connect CollabService:", error);
      }
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [loading, connectionStatus, get]);

  // Switch to a different document
  const switchDocument = useCallback((docName: string) => {
    // Changing document name will trigger useEffect to recreate provider
    setCurrentDocumentName(docName);
  }, []);

  // Create new document
  const createNewDocument = useCallback(() => {
    const newName = prompt("Enter document name:");
    if (newName && newName.trim()) {
      switchDocument(newName.trim());
    }
  }, [switchDocument]);

  // Get editor commands hook
  const commands = useEditorCommands(get);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Scrollable Editor Container with Toolbar Inside */}
      <div className="flex-1 overflow-hidden px-4 pt-4 pb-4">
        <div className="editor-scrollbar h-full overflow-auto rounded-lg border border-border bg-card">
          <div className="relative min-h-full">
            {/* Floating Toolbar - Sticky within scroll container */}
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm p-2">
              <EditorToolbar
                commands={commands}
                disabled={connectionStatus !== "synced" || loading}
                aiChanges={aiTracker.changes}
                canUndoAI={aiTracker.canUndo}
                canRedoAI={aiTracker.canRedo}
                onUndoLastAI={aiTracker.undoLastAIChange}
                onUndoAllAI={aiTracker.undoAllAIChanges}
                onRedoAI={aiTracker.redoAIChange}
                onAcceptAI={aiTracker.acceptAIChange}
                onRejectAI={aiTracker.rejectAIChange}
                connectionStatus={connectionStatus}
                currentDocumentName={currentDocumentName}
                availableDocuments={availableDocuments}
                isLoadingDocuments={isLoadingDocuments}
                onSwitchDocument={switchDocument}
                onCreateNew={createNewDocument}
                onRefresh={loadDocuments}
              />
            </div>

            {/* Editor Content - Starts right after toolbar */}
            <div className="milkdown-editor-root p-4">
              <Milkdown />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MilkdownEditor({ documentName }: MilkdownEditorProps = {}) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner documentName={documentName} />
    </MilkdownProvider>
  );
}
