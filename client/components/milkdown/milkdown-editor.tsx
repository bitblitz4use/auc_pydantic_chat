"use client";

import { Editor, rootCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { collab, collabServiceCtx, CollabService } from "@milkdown/plugin-collab";
import { block } from "@milkdown/kit/plugin/block";
import { tableBlock, tableBlockConfig } from "@milkdown/kit/component/table-block";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose, insert, insertPos, replaceRange } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { defaultMarkdownParser } from "prosemirror-markdown";

// Import new components
import { EditorToolbar } from "./editor-toolbar";
import { useEditorCommands } from "./hooks/use-editor-commands";
import { useAIChangeTracker } from "./hooks/use-ai-change-tracker";
import { DocumentTree } from "./document-tree";
import { ResourceSelectorDialog } from "@/components/ui/resource-selector-dialog";
import { SaveTemplateDialog } from "./save-template-dialog";
import { Layout, FileText } from "lucide-react";

// Import AI highlight styles
import "./styles/ai-highlights.css";

// Import API config
import { apiUrl } from "@/lib/config";
import { useTemplateSelector } from "@/hooks/use-template-selector";
import { extractTags } from "@/lib/utils";

// Helper function to render Lucide icons as SVG strings
const renderIcon = (iconType: string, size = 16) => {
  const iconPaths: Record<string, string> = {
    'align-left': '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>',
    'align-center': '<line x1="21" x2="3" y1="6" y2="6"/><line x1="18" x2="6" y1="12" y2="12"/><line x1="21" x2="3" y1="18" y2="18"/>',
    'align-right': '<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'grip-vertical': '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    'grip-horizontal': '<circle cx="12" cy="9" r="1"/><circle cx="5" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="5" cy="15" r="1"/><circle cx="19" cy="15" r="1"/>',
  };

  const path = iconPaths[iconType] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
};

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

// Custom plugin to handle Ctrl+T shortcut for template insertion
const templateShortcutPlugin = (onOpenTemplateSelector: () => void) => $prose(() => {
  return new Plugin({
    key: new PluginKey('templateShortcut'),
    props: {
      handleKeyDown(view, event) {
        // Check for Ctrl+T (or Cmd+T on Mac)
        if ((event.ctrlKey || event.metaKey) && event.key === 't' && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          onOpenTemplateSelector();
          return true;
        }
        return false;
      },
    },
  });
});

const ACTIVE_DOCUMENT_KEY = "active-document";

function getStoredActiveDocument(): string {
  if (typeof window === "undefined") return "shared-document";
  try {
    const stored = localStorage.getItem(ACTIVE_DOCUMENT_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // ignore
  }
  return "shared-document";
}

// Props for the editor component
interface MilkdownEditorProps {
  documentName?: string; // Optional: if not provided, will use default or prompt
}

function MilkdownEditorInner({ documentName: propDocumentName }: MilkdownEditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "synced">("disconnected");
  const [currentDocumentName, setCurrentDocumentName] = useState<string>(
    () => propDocumentName ?? getStoredActiveDocument()
  );
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
      const response = await fetch(apiUrl.documents());
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
      url: apiUrl.editorWs(),
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
        
        // Emit document change event when synced (document is active)
        window.dispatchEvent(
          new CustomEvent("active-document-changed", { detail: currentDocumentName })
        );
        localStorage.setItem("active-document", currentDocumentName);
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

  // Use template selector hook
  const templateSelector = useTemplateSelector();

  // Save template dialog state
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateMarkdown, setTemplateMarkdown] = useState("");
  const [availableTemplateTags, setAvailableTemplateTags] = useState<string[]>([]);

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
          ctx.update(tableBlockConfig.key, (prev) => ({
            ...prev,
            renderButton: (type) => {
              switch (type) {
                case 'add_row': return renderIcon('plus');
                case 'add_col': return renderIcon('plus');
                case 'delete_row': return renderIcon('trash');
                case 'delete_col': return renderIcon('trash');
                case 'align_col_left': return renderIcon('align-left');
                case 'align_col_center': return renderIcon('align-center');
                case 'align_col_right': return renderIcon('align-right');
                case 'col_drag_handle': return renderIcon('grip-vertical');
                case 'row_drag_handle': return renderIcon('grip-horizontal');
                default: return '';
              }
            }
          }));
        })
        .use(commonmark)
        .use(gfm)
        .use(tableBlock)
        .use(listener)
        .use(clipboard)
        .use(history)
        .use(block)
        .use(exitListPlugin)
        .use(templateShortcutPlugin(() => templateSelector.setOpen(true)));
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
        ctx.update(tableBlockConfig.key, (prev) => ({
          ...prev,
          renderButton: (type) => {
            switch (type) {
              case 'add_row': return renderIcon('plus');
              case 'add_col': return renderIcon('plus');
              case 'delete_row': return renderIcon('trash');
              case 'delete_col': return renderIcon('trash');
              case 'align_col_left': return renderIcon('align-left');
              case 'align_col_center': return renderIcon('align-center');
              case 'align_col_right': return renderIcon('align-right');
              case 'col_drag_handle': return renderIcon('grip-vertical');
              case 'row_drag_handle': return renderIcon('grip-horizontal');
              default: return '';
            }
          }
        }));
      })
      .use(commonmark)
      .use(gfm)
      .use(tableBlock)
      .use(listener)
      .use(clipboard)
      .use(history)
      .use(collab)
      .use(block)
      .use(exitListPlugin)
      .use(templateShortcutPlugin(() => templateSelector.setOpen(true)));
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
        const ydoc = ydocRef.current;
        
        // Verify editor and service are still valid
        if (!currentEditor || !collabService || !ydoc) return;
        
        currentEditor.action((ctx) => {
          collabService
            .bindCtx(ctx)
            .connect();
          collabConnectedRef.current = true; // Mark as connected
          
          console.log("✅ CollabService connected");
          
          // Initialize empty documents with placeholder to trigger S3 save
          const fragment = ydoc.getXmlFragment('prosemirror');
          if (fragment.length === 0) {
            console.log("📝 Initializing empty document with placeholder");
            
            // Get editor view and insert a space character
            // This triggers Y.js update -> onChange -> S3 save
            const view = ctx.get(editorViewCtx);
            const tr = view.state.tr.insertText(' ', 1);
            view.dispatch(tr);
            
            // Auto-select the space so user can just start typing
            setTimeout(() => {
              try {
                const selectTr = view.state.tr.setSelection(
                  TextSelection.create(view.state.doc, 1, 2)
                );
                view.dispatch(selectTr);
                console.log("✅ Empty document initialized and ready");
              } catch (err) {
                // Ignore selection errors
                console.warn("Selection warning (safe to ignore):", err);
              }
            }, 50);
            
            // Refresh document list after save completes
            // Wait for debounce (2s) + save time + buffer
            setTimeout(() => {
              loadDocuments();
              console.log("🔄 Document list refreshed after save");
            }, 3000);
          }
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
    
    // Emit custom event for other components (e.g., chat interface)
    window.dispatchEvent(
      new CustomEvent("active-document-changed", { detail: docName })
    );
    
    // Store in localStorage as backup
    localStorage.setItem("active-document", docName);
  }, []);

  // Create new document - optionally in a specific folder
  const createNewDocument = useCallback((folderPath?: string) => {
    const promptMessage = folderPath 
      ? `New document in "${folderPath}/" - Enter filename:`
      : "Enter document name:";
    
    const fileName = prompt(promptMessage);
    if (fileName && fileName.trim()) {
      // Construct full path: folder/filename (folder path is automatic, not editable)
      const fullPath = folderPath 
        ? `${folderPath}/${fileName.trim()}`
        : fileName.trim();
      switchDocument(fullPath);
      // No timeout needed - onSynced will refresh automatically
    }
  }, [switchDocument]);

  // Get editor commands hook
  const commands = useEditorCommands(get);

  // Use AI change tracker hook (needs editor's get function)
  const aiTracker = useAIChangeTracker(ydocRef.current, currentDocumentName, get);

  // Handle AI suggestions from server (Yjs-native approach with incremental operations)
  useEffect(() => {
    const ydoc = ydocRef.current;
    const editor = get();
    
    if (!ydoc || !editor) return;
    
    console.log('📡 Setting up AI operations observer (Yjs-native incremental)');
    
    // Observe the __aiSuggestions Map for new suggestions
    const suggestions = ydoc.getMap('__aiSuggestions');
    
    const handleSuggestionChange = (event: any) => {
      event.changes.keys.forEach((change: any, key: string) => {
        if (change.action === 'add' || change.action === 'update') {
          const suggestion = suggestions.get(key);
          
          if (suggestion && suggestion.type === 'ai-operations' && !suggestion.applied) {
            console.log('🤖 Received AI operations:', suggestion.changeId, `(${suggestion.operations.length} ops)`);
            applyAIOperations(suggestion.operations, suggestion.changeId, suggestion.metadata);
            
            // Mark as applied and clean up
            suggestions.set(key, { ...suggestion, applied: true });
            setTimeout(() => suggestions.delete(key), 1000);
          }
        }
      });
    };
    
    const applyAIOperations = (operations: any[], changeId: string, metadata: any) => {
      try {
        console.log(`📝 Applying ${operations.length} AI operations using append strategy...`);
        
        // Get current document info for logging
        let docSize = 0;
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          docSize = view.state.doc.content.size;
          console.log(`📏 Current document size: ${docSize} positions`);
        });
        
        // Sort operations to maintain order (though we're appending, keep original order)
        const sortedOps = [...operations].sort((a, b) => (a.pos || 0) - (b.pos || 0));
        
        for (const op of sortedOps) {
          try {
            if (op.type === 'insert') {
              console.log(`  ✓ Appending insert content: "${op.content.substring(0, 50)}..."`);
              
              // Use insert() which appends at cursor/end - most reliable approach
              // Add spacing before content for readability
              editor.action(insert('\n\n' + op.content));
              
              console.log(`  → Content appended successfully`);
              
            } else if (op.type === 'replace') {
              console.log(`  ✓ Appending replace content: "${op.content.substring(0, 50)}..."`);
              // For replace operations in append mode, just add the new content
              editor.action(insert('\n\n' + op.content));
              console.log(`  → Replace content appended (original content remains)`);
              
            } else if (op.type === 'delete') {
              console.warn(`  ⚠️ Delete operation skipped in append mode (content not removed)`);
              // Delete operations don't make sense in append-only mode
            }
          } catch (opError) {
            console.error(`❌ Failed to append operation:`, op, opError);
          }
        }
        
        console.log('✅ All AI operations appended successfully');
        
        // Store metadata in Yjs for tracking
        const changeHistory = ydoc.getMap('aiChangeHistory');
        const persistedMeta = ydoc.getMap('__persistedMetadata');
        
        changeHistory.set(changeId, {
          id: changeId,
          timestamp: Date.now(),
          model: metadata?.model || 'unknown',
          prompt: metadata?.prompt || '',
          summary: metadata?.summary || 'AI changes',
          status: 'pending',
          undoable: true
        });
        
        persistedMeta.set(`change_${changeId}_status`, 'pending');
        persistedMeta.set(`change_${changeId}_timestamp`, Date.now());
        
        console.log('✅ AI change metadata stored');
        
      } catch (error) {
        console.error('❌ Failed to apply AI operations:', error);
      }
    };
    
    // Start observing
    suggestions.observe(handleSuggestionChange);
    
    return () => {
      suggestions.unobserve(handleSuggestionChange);
    };
  }, [get, ydocRef.current]);

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Handle save as template
  const handleSaveAsTemplate = useCallback(() => {
    const markdown = commands.getMarkdown();
    if (!markdown) {
      console.warn('Failed to get markdown content');
      return;
    }

    // Get available tags from existing templates
    const tags = extractTags(templateSelector.templates);
    setAvailableTemplateTags(tags);

    setTemplateMarkdown(markdown);
    setSaveTemplateOpen(true);
  }, [commands, templateSelector.templates]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-hidden px-4 pt-4 pb-4">
        <div className="h-full rounded-lg border border-border bg-card flex overflow-hidden">
          {/* Document Tree Sidebar - Fixed position, scrollable */}
          <div
            className={`border-r border-border flex-shrink-0 transition-all duration-300 ${
              isSidebarCollapsed ? "w-0" : "w-64"
            }`}
          >
            <DocumentTree
              currentDocument={currentDocumentName}
              onSelectDocument={switchDocument}
              onCreateNew={createNewDocument}
            />
          </div>

          {/* Editor Area - Fixed toolbar + scrollable content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Fixed Toolbar - Always visible */}
            <div className="flex-shrink-0 border-b border-border bg-card h-12">
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
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                onOpenTemplateSelector={() => templateSelector.setOpen(true)}
                onSaveAsTemplate={handleSaveAsTemplate}
              />
            </div>

            {/* Scrollable Editor Content - "desk" surface */}
            <div className="flex-1 overflow-auto editor-scrollbar bg-[var(--editor-desk)]">
              {/* A4-style paper card */}
              <div className="editor-paper mx-auto my-6 min-h-[80vh] w-full max-w-[210mm] rounded-sm px-8 py-10 shadow-[var(--editor-paper-shadow)] bg-[var(--editor-paper)]">
                <div className="milkdown-editor-root">
                  <Milkdown />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Selector Dialog */}
      <ResourceSelectorDialog
        open={templateSelector.open}
        onOpenChange={templateSelector.setOpen}
        title="Insert Template"
        description="Choose a template to insert at cursor position"
        items={templateSelector.templates}
        loading={templateSelector.loading}
        onSelect={(template) => 
          templateSelector.handleTemplateSelect(
            template.name, 
            (markdown) => commands.insertTemplate(markdown)
          )
        }
        renderItem={(template) => ({
          key: template.name,
          label: template.name.replace("templates/", ""),
          icon: <Layout className="size-4" />,
        })}
        searchPlaceholder="Search templates..."
        emptyText="No templates found."
        loadingText="Loading templates..."
        groupHeading="Templates"
      />

      {/* Save Template Dialog */}
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        markdown={templateMarkdown}
        availableTags={availableTemplateTags}
      />
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
