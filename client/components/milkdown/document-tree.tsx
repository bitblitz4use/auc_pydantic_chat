"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { apiUrl } from "@/lib/config";
import { FileText, Loader2, Plus, RefreshCw } from "lucide-react";

interface Document {
  name: string;
  size: number;
  lastModified: Date;
}

interface DocumentTreeProps {
  currentDocument: string;
  onSelectDocument: (docName: string) => void;
  onCreateNew: () => void;
}

// Organize flat documents into folders
function organizeDocuments(documents: Document[]) {
  const tree: Record<string, Document[]> = { root: [] };

  documents.forEach((doc) => {
    const parts = doc.name.split("/");
    if (parts.length > 1) {
      const folder = parts[0];
      if (!tree[folder]) tree[folder] = [];
      tree[folder].push({ ...doc, name: parts.slice(1).join("/") });
    } else {
      tree.root.push(doc);
    }
  });

  return tree;
}

export function DocumentTree({
  currentDocument,
  onSelectDocument,
  onCreateNew,
}: DocumentTreeProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(currentDocument);

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

  const handleSelect = useCallback(
    (path: string) => {
      setSelectedPath(path);
      onSelectDocument(path);
    },
    [onSelectDocument]
  );

  const tree = organizeDocuments(documents);
  const folders = Object.keys(tree).filter((key) => key !== "root");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 bg-card h-12">
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
            onClick={onCreateNew}
            title="New document"
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-2 overflow-auto flex-1">
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
            defaultExpanded={new Set(folders)}
          >
            {tree.root.map((doc) => (
              <FileTreeFile
                key={doc.name}
                path={doc.name}
                name={doc.name}
                icon={<FileText className="size-4 text-blue-400" />}
              />
            ))}
            {folders.map((folder) => (
              <FileTreeFolder key={folder} path={folder} name={folder}>
                {tree[folder].map((doc) => (
                  <FileTreeFile
                    key={`${folder}/${doc.name}`}
                    path={`${folder}/${doc.name}`}
                    name={doc.name}
                    icon={<FileText className="size-4 text-blue-400" />}
                  />
                ))}
              </FileTreeFolder>
            ))}
          </FileTree>
        )}
      </div>
    </div>
  );
}
