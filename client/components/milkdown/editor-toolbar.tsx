"use client";

import { memo } from 'react';
import { EditorCommands } from './hooks/use-editor-commands';
import { 
  Bold, 
  Italic, 
  Code, 
  Quote, 
  List, 
  ListOrdered, 
  Heading1,
  Heading2,
  Heading3,
  FileCode,
  Minus,
  Type,
  Undo2,
  Redo2,
  RefreshCw,
  FilePlus,
} from 'lucide-react';
import { AIChangesButton } from './ai-changes-button';
import { AIChange } from './hooks/use-ai-change-tracker';

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "synced";

// Font families list
const FONT_FAMILIES = [
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe UI' },
  { value: 'system-ui, -apple-system, sans-serif', label: 'System' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, sans-serif', label: 'Arial' },
];

interface Document {
  name: string;
  size: number;
  lastModified: Date;
}

interface EditorToolbarProps {
  commands: EditorCommands;
  disabled?: boolean;
  // AI tracker props
  aiChanges?: AIChange[];
  canUndoAI?: boolean;
  canRedoAI?: boolean;
  onUndoLastAI?: () => void;
  onUndoAllAI?: () => void;
  onRedoAI?: () => void;
  onAcceptAI?: (changeId: string) => void;
  onRejectAI?: (changeId: string) => void;
  // Document management props
  connectionStatus?: ConnectionStatus;
  currentDocumentName: string;
  availableDocuments: Document[];
  isLoadingDocuments?: boolean;
  onSwitchDocument: (docName: string) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  icon: React.ReactNode;
}

const ToolbarButton = memo(({ onClick, disabled, active, title, icon }: ToolbarButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      flex h-8 w-8 items-center justify-center rounded
      transition-colors duration-150
      hover:bg-accent hover:text-accent-foreground
      disabled:opacity-40 disabled:cursor-not-allowed
      ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}
    `}
  >
    {icon}
  </button>
));

ToolbarButton.displayName = 'ToolbarButton';

const ToolbarDivider = () => (
  <div className="mx-1 h-6 w-px bg-border" />
);

export const EditorToolbar = memo(({ 
  commands, 
  disabled = false,
  aiChanges = [],
  canUndoAI = false,
  canRedoAI = false,
  onUndoLastAI,
  onUndoAllAI,
  onRedoAI,
  onAcceptAI,
  onRejectAI,
  connectionStatus,
  currentDocumentName,
  availableDocuments,
  isLoadingDocuments = false,
  onSwitchDocument,
  onCreateNew,
  onRefresh,
}: EditorToolbarProps) => {
  // Get status dot color based on connection status
  const getStatusColor = () => {
    switch (connectionStatus) {
      case "synced":
        return "bg-green-500";
      case "connected":
        return "bg-yellow-500";
      case "connecting":
        return "bg-blue-500 animate-pulse";
      case "disconnected":
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
      {/* Connection Status Dot - First element */}
      {connectionStatus && (
        <div
          className={`h-2 w-2 rounded-full ${getStatusColor()}`}
          title={
            connectionStatus === "synced" ? "Synced & Ready" :
            connectionStatus === "connected" ? "Connected" :
            connectionStatus === "connecting" ? "Connecting..." :
            "Disconnected"
          }
        />
      )}

      {/* Document Switcher - Second element */}
      <select
        value={currentDocumentName}
        onChange={(e) => onSwitchDocument(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary h-8 min-w-[120px]"
        disabled={disabled}
        title="Select document"
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

      {/* Refresh Button - Third element */}
      <ToolbarButton
        onClick={onRefresh}
        disabled={disabled || isLoadingDocuments}
        title="Refresh documents"
        icon={<RefreshCw size={16} className={isLoadingDocuments ? "animate-spin" : ""} />}
      />

      {/* New Document Button - Fourth element */}
      <ToolbarButton
        onClick={onCreateNew}
        disabled={disabled}
        title="Create new document"
        icon={<FilePlus size={16} />}
      />

      {/* Vertical Divider before Undo/Redo */}
      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => commands.undo()}
        disabled={disabled || !commands.canUndo}
        title="Undo (Ctrl+Z)"
        icon={<Undo2 size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.redo()}
        disabled={disabled || !commands.canRedo}
        title="Redo (Ctrl+Y)"
        icon={<Redo2 size={16} />}
      />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => commands.setHeading(1)}
        disabled={disabled}
        title="Heading 1"
        icon={<Heading1 size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.setHeading(2)}
        disabled={disabled}
        title="Heading 2"
        icon={<Heading2 size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.setHeading(3)}
        disabled={disabled}
        title="Heading 3"
        icon={<Heading3 size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.turnIntoParagraph()}
        disabled={disabled}
        title="Turn into paragraph"
        icon={<Type size={16} />}
      />

      <ToolbarDivider />

      {/* Font Family Selector */}
      <select
        onChange={(e) => commands.setFontFamily(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary h-8 min-w-[140px]"
        disabled={disabled}
        title="Font family"
        defaultValue="Inter, sans-serif"
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => commands.toggleBold()}
        disabled={disabled}
        title="Bold (Ctrl+B)"
        icon={<Bold size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.toggleItalic()}
        disabled={disabled}
        title="Italic (Ctrl+I)"
        icon={<Italic size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.toggleInlineCode()}
        disabled={disabled}
        title="Inline code"
        icon={<Code size={16} />}
      />

      <ToolbarDivider />

      {/* Blocks */}
      <ToolbarButton
        onClick={() => commands.toggleBlockquote()}
        disabled={disabled}
        title="Blockquote"
        icon={<Quote size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.toggleBulletList()}
        disabled={disabled}
        title="Bullet list"
        icon={<List size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.toggleOrderedList()}
        disabled={disabled}
        title="Numbered list"
        icon={<ListOrdered size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.insertCodeBlock()}
        disabled={disabled}
        title="Code block"
        icon={<FileCode size={16} />}
      />
      <ToolbarButton
        onClick={() => commands.insertHorizontalRule()}
        disabled={disabled}
        title="Horizontal rule"
        icon={<Minus size={16} />}
      />

      {/* AI Changes Tooltip Button - Right aligned */}
      {aiChanges.length > 0 && (
        <>
          <div className="ml-auto" />
          <AIChangesButton
            changes={aiChanges}
            canUndo={canUndoAI}
            canRedo={canRedoAI}
            onUndoLast={onUndoLastAI || (() => {})}
            onUndoAll={onUndoAllAI || (() => {})}
            onRedo={onRedoAI || (() => {})}
            onAccept={onAcceptAI || (() => {})}
            onReject={onRejectAI || (() => {})}
          />
        </>
      )}
    </div>
  );
});

EditorToolbar.displayName = 'EditorToolbar';
