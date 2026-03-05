"use client";

import { memo } from 'react';

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "synced";

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
  connectionStatus?: ConnectionStatus;
}

export const DocumentSelector = memo(({
  currentDocumentName,
  availableDocuments,
  isLoadingDocuments,
  onSwitchDocument,
  onCreateNew,
  onRefresh,
  disabled = false,
  connectionStatus,
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

      {/* Connection Status - Right aligned */}
      {connectionStatus && (
        <>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {connectionStatus === "synced" ? "Synced & Ready" :
               connectionStatus === "connected" ? "Connected" :
               connectionStatus === "connecting" ? "Connecting..." :
               "Disconnected"}
            </span>
            <div className={`h-2 w-2 rounded-full ${
              connectionStatus === "synced" ? "bg-green-500" :
              connectionStatus === "connected" ? "bg-yellow-500" :
              connectionStatus === "connecting" ? "bg-blue-500 animate-pulse" :
              "bg-gray-500"
            }`} />
          </div>
        </>
      )}
    </div>
  );
});

DocumentSelector.displayName = 'DocumentSelector';
