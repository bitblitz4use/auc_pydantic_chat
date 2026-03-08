"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { apiUrl } from "@/lib/config";
import { 
  FileText, 
  Loader2, 
  Plus, 
  RefreshCw, 
  FolderPlus,
  Edit,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface Document {
  name: string;
  size: number;
  lastModified: Date;
  isFolder?: boolean;
}

interface DocumentTreeProps {
  currentDocument: string;
  onSelectDocument: (docName: string) => void;
  onCreateNew: () => void;
}

// Organize flat documents into folders by their FULL parent path
function organizeDocuments(documents: Document[]) {
  const tree: Record<string, Document[]> = { root: [] };

  documents.forEach((doc) => {
    // Skip folder entries - they'll be handled separately
    if (doc.isFolder) return;
    
    const parts = doc.name.split("/");
    if (parts.length > 1) {
      // Get the full parent path (everything except the filename)
      const parentPath = parts.slice(0, -1).join("/");
      const fileName = parts[parts.length - 1];
      
      if (!tree[parentPath]) tree[parentPath] = [];
      tree[parentPath].push({ ...doc, name: fileName });
    } else {
      tree.root.push(doc);
    }
  });

  return tree;
}

// Build complete folder structure from flat folder list
function buildFolderTree(documents: Document[]): Set<string> {
  const allFolders = new Set<string>();
  
  // Get all folder paths from explicit folders (isFolder=true)
  documents
    .filter(d => d.isFolder)
    .forEach(folder => {
      // Add all parent folders in the path
      const parts = folder.name.split('/');
      for (let i = 0; i < parts.length; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        allFolders.add(folderPath);
      }
    });
  
  // Also get folders from document paths
  documents
    .filter(d => !d.isFolder && d.name.includes('/'))
    .forEach(doc => {
      const parts = doc.name.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        allFolders.add(folderPath);
      }
    });
  
  return allFolders;
}

export function DocumentTree({
  currentDocument,
  onSelectDocument,
  onCreateNew,
}: DocumentTreeProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(currentDocument);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(apiUrl.documents());
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    setSelectedPath(currentDocument);
  }, [currentDocument]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  const handleSelect = useCallback(
    (path: string) => {
      if (renamingPath) return; // Don't select while renaming
      setSelectedPath(path);
      onSelectDocument(path);
    },
    [onSelectDocument, renamingPath]
  );

  // Start renaming
  const startRename = useCallback((path: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setRenamingPath(path);
    setRenameValue(path.split("/").pop() || path);
  }, []);

  // Finish renaming
  const finishRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const parts = renamingPath.split("/");
    const newName = parts.length > 1 
      ? [...parts.slice(0, -1), renameValue.trim()].join("/")
      : renameValue.trim();

    if (newName === renamingPath) {
      setRenamingPath(null);
      return;
    }

    try {
      const response = await fetch(apiUrl.documentOps(renamingPath), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_path: newName }),
      });

      if (!response.ok) throw new Error("Rename failed");

      // Update UI
      await loadDocuments();
      
      // If we renamed the current document, switch to new name
      if (renamingPath === currentDocument) {
        onSelectDocument(newName);
      }
    } catch (error) {
      console.error("Failed to rename:", error);
      alert("Failed to rename document");
    } finally {
      setRenamingPath(null);
    }
  }, [renamingPath, renameValue, loadDocuments, currentDocument, onSelectDocument]);

  // Cancel renaming
  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameValue("");
  }, []);

  // Delete document
  const deleteDocument = useCallback(async (path: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!confirm(`Delete "${path}"?`)) return;

    try {
      const response = await fetch(apiUrl.documentOps(path), {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      // If we deleted the current document, clear selection first
      if (path === currentDocument) {
        setSelectedPath("");
      }

      await loadDocuments();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete document");
    }
  }, [loadDocuments, currentDocument]);

  // Create new folder
  const createFolder = useCallback(async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName?.trim()) return;

    try {
      const response = await fetch(apiUrl.documentFolder(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: folderName.trim() }),
      });

      if (!response.ok) throw new Error("Failed to create folder");

      await loadDocuments();
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert("Failed to create folder");
    }
  }, [loadDocuments]);

  // Drag and drop handlers
  const handleDragStart = useCallback((path: string, e: React.DragEvent) => {
    // Prevent dragging the root "documents" folder
    if (path === "documents") {
      e.preventDefault();
      return;
    }
    setDraggedItem(path);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(async (targetFolder: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem) return;

    // Can't drop into root or into itself
    if (targetFolder === "root" || draggedItem === targetFolder) {
      setDraggedItem(null);
      return;
    }

    const fileName = draggedItem.split("/").pop();
    const newPath = `${targetFolder}/${fileName}`;

    if (newPath === draggedItem) {
      setDraggedItem(null);
      return;
    }

    try {
      const response = await fetch(apiUrl.documentOps(draggedItem), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_path: newPath }),
      });

      if (!response.ok) throw new Error("Move failed");

      await loadDocuments();
      
      // If we moved the current document, switch to new location
      if (draggedItem === currentDocument) {
        onSelectDocument(newPath);
      }
    } catch (error) {
      console.error("Failed to move:", error);
      alert("Failed to move document");
    } finally {
      setDraggedItem(null);
    }
  }, [draggedItem, loadDocuments, currentDocument, onSelectDocument]);

  const tree = organizeDocuments(documents);
  
  // Build complete folder tree (including nested folders)
  const allFoldersSet = buildFolderTree(documents);
  const allFolders = Array.from(allFoldersSet);
  
  // Get only top-level folders (for rendering - children will be rendered recursively)
  const topLevelFolders = allFolders.filter(f => !f.includes('/'));

  // Recursive function to render a folder and its subfolders
  const renderFolder = (folderPath: string, folderName: string): JSX.Element => {
    const isRenaming = renamingPath === folderPath;
    
    // Get direct child folders (folders whose parent is this folder)
    const childFolders = allFolders.filter(f => {
      if (f === folderPath) return false;
      const parentPath = f.substring(0, f.lastIndexOf('/'));
      return parentPath === folderPath;
    }).sort();
    
    // Get direct child documents (documents in this folder, not subfolders)
    const childDocs = (tree[folderPath] || [])
      .filter(doc => !doc.name.includes('/'))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <ContextMenu key={folderPath}>
        <ContextMenuTrigger asChild>
          <div
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(folderPath, e)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(folderPath, e)}
          >
            <FileTreeFolder path={folderPath} name={folderName}>
              {/* Render child folders recursively */}
              {childFolders.map(childPath => {
                const childName = childPath.split('/').pop() || childPath;
                return renderFolder(childPath, childName);
              })}
              
              {/* Render child documents */}
              {childDocs.map((doc) => {
                const fullPath = `${folderPath}/${doc.name}`;
                return renderFile(fullPath, doc.name);
              })}
            </FileTreeFolder>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={(e) => startRename(folderPath, e as any)}>
            <Edit />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem 
            variant="destructive"
            onClick={(e) => deleteDocument(folderPath, e as any)}
          >
            <Trash2 />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Render a file with context menu and rename support
  const renderFile = (path: string, name: string, isNew = false) => {
    const isRenaming = renamingPath === path;

    return (
      <ContextMenu key={path}>
        <ContextMenuTrigger asChild>
          <div
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(path, e)}
          >
            <FileTreeFile
              path={path}
              name={name}
              icon={<FileText className={`size-4 ${isNew ? 'text-amber-500' : 'text-muted-foreground'}`} />}
            >
              {isRenaming ? (
                <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                  <span className="size-4" />
                  <FileText className="size-4 text-muted-foreground" />
                  <Input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishRename();
                      if (e.key === "Escape") cancelRename();
                      e.stopPropagation();
                    }}
                    onBlur={finishRename}
                    className="h-6 px-1 text-sm flex-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : null}
            </FileTreeFile>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={(e) => startRename(path, e as any)}>
            <Edit />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem 
            variant="destructive"
            onClick={(e) => deleteDocument(path, e as any)}
          >
            <Trash2 />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 bg-card h-12 flex-shrink-0">
        <h3 className="text-sm font-semibold">Documents</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={loadDocuments}
            disabled={isLoading}
            title="Refresh"
            className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={createFolder}
            title="New folder"
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={onCreateNew}
            title="New document"
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Tree Content - SCROLLABLE */}
      <div className="flex-1 overflow-auto">
        <div className="p-2">
          {isLoading && documents.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No documents yet
            </div>
          ) : (
            <FileTree
              selectedPath={selectedPath}
              onSelect={handleSelect as (path: string) => void}
              defaultExpanded={new Set(allFolders)}
              className="border-0 bg-transparent p-0"
            >
              {/* Show current document if not in list (new document) */}
              {!documents.find(d => d.name === selectedPath) && selectedPath && 
                renderFile(selectedPath, `${selectedPath} (new)`, true)
              }
              
              {/* Top-level folders - SORTED ALPHABETICALLY (subfolders rendered recursively) */}
              {topLevelFolders.sort().map((folder) => renderFolder(folder, folder))}
              
              {/* Root files - SORTED ALPHABETICALLY */}
              {tree.root.sort((a, b) => a.name.localeCompare(b.name)).map((doc) => 
                renderFile(doc.name, doc.name)
              )}
            </FileTree>
          )}
        </div>
      </div>
    </div>
  );
}
