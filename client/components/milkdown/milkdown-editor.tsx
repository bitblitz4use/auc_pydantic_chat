"use client";

import { Editor, rootCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { collab, collabServiceCtx, CollabService } from "@milkdown/plugin-collab";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

// Import new components
import { EditorToolbar } from "./editor-toolbar";
import { DocumentSelector } from "./document-selector";
import { useEditorCommands } from "./hooks/use-editor-commands";

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
  const undoManagerRef = useRef<Y.UndoManager | null>(null); // For AI undo

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
      undoManagerRef.current?.destroy();
      undoManagerRef.current = null;
      setConnectionStatus("disconnected");
    };
  }, [currentDocumentName, loadDocuments]);

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
      .use(exitListPlugin);
  }, [connectionStatus]); // Recreate when connection status changes

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

  // Initialize AI undo manager when document syncs
  useEffect(() => {
    if (connectionStatus !== "synced" || !ydocRef.current) return;
    
    const ydoc = ydocRef.current;
    const fragment = ydoc.getXmlFragment('prosemirror');
    
    // Create undo manager ONLY for AI changes (tracked by 'ai' origin)
    const undoManager = new Y.UndoManager(fragment, {
      trackedOrigins: new Set(['ai']), // Only track 'ai' origin transactions
    });
    
    undoManagerRef.current = undoManager;
    
    console.log('✅ AI undo manager initialized');
    
    return () => {
      undoManager?.destroy();
      undoManagerRef.current = null;
    };
  }, [connectionStatus]);

  // Undo AI changes function
  const undoAIChanges = useCallback(() => {
    const manager = undoManagerRef.current;
    if (!manager || !manager.canUndo()) {
      console.log('⚠️ No AI changes to undo');
      return;
    }
    
    let undoneCount = 0;
    // Undo all AI transactions
    while (manager.canUndo()) {
      manager.undo();
      undoneCount++;
    }
    
    console.log(`✅ Undone ${undoneCount} AI change(s)`);
  }, []);

  // Redo AI changes function
  const redoAIChanges = useCallback(() => {
    const manager = undoManagerRef.current;
    if (!manager || !manager.canRedo()) {
      console.log('⚠️ No AI changes to redo');
      return;
    }
    
    manager.redo();
    console.log('✅ Redone AI change');
  }, []);

  // Check if can undo/redo (using state for reactivity)
  const [canUndoAI, setCanUndoAI] = useState(false);
  const [canRedoAI, setCanRedoAI] = useState(false);

  // Poll undo/redo state (since UndoManager doesn't emit events)
  useEffect(() => {
    if (connectionStatus !== "synced") return;

    const interval = setInterval(() => {
      const manager = undoManagerRef.current;
      if (manager) {
        setCanUndoAI(manager.canUndo());
        setCanRedoAI(manager.canRedo());
      }
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, [connectionStatus]);

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
      {/* Sticky header container */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background p-4 pb-2">
        {/* Document Selector with Connection Status */}
        <DocumentSelector
          currentDocumentName={currentDocumentName}
          availableDocuments={availableDocuments}
          isLoadingDocuments={isLoadingDocuments}
          onSwitchDocument={switchDocument}
          onCreateNew={createNewDocument}
          onRefresh={loadDocuments}
          disabled={connectionStatus === "connecting"}
          connectionStatus={connectionStatus}
        />

        {/* Toolbar with AI Undo/Redo */}
        <EditorToolbar
          commands={commands}
          disabled={connectionStatus !== "synced" || loading}
          canUndoAI={canUndoAI}
          canRedoAI={canRedoAI}
          onUndoAI={undoAIChanges}
          onRedoAI={redoAIChanges}
        />
      </div>

      {/* Scrollable Editor Container */}
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <div className="editor-scrollbar h-full overflow-auto rounded-lg border border-border bg-card">
          <div className="milkdown-editor-root min-h-full bg-card p-4">
            <Milkdown />
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
