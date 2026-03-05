"use client";

import { memo } from 'react';

interface Document {
  name: string;
  size: number;
  lastModified: Date;
}

interface DocumentSelectorProps {
  currentDocumentName: string;
  availableDocuments: Document[];
  isLoadingDocuments: boolean;
  onSwitchDocument: (docName: string) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
  disabled?: boolean;
}

export const DocumentSelector = memo(({
  currentDocumentName,
  availableDocuments,
  isLoadingDocuments,
  onSwitchDocument,
  onCreateNew,
  onRefresh,
  disabled = false,
}: DocumentSelectorProps) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <label className="text-sm text-muted-foreground">Document:</label>
      <select
        value={currentDocumentName}
        onChange={(e) => onSwitchDocument(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={disabled}
      >
        {availableDocuments.map((doc) => (
          <option key={doc.name} value={doc.name}>
            {doc.name}
          </option>
        ))}
        {!availableDocuments.find((d) => d.name === currentDocumentName) && (
          <option value={currentDocumentName}>{currentDocumentName} (new)</option>
        )}
      </select>
      <button
        onClick={onCreateNew}
        className="rounded px-3 py-1 text-xs bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors"
        disabled={disabled}
      >
        New
      </button>
      <button
        onClick={onRefresh}
        className="rounded px-3 py-1 text-xs bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors"
        disabled={isLoadingDocuments}
      >
        {isLoadingDocuments ? "Loading..." : "Refresh"}
      </button>
    </div>
  );
});

DocumentSelector.displayName = 'DocumentSelector';
