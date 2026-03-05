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
} from 'lucide-react';
import { AIChangesButton } from './ai-changes-button';
import { AIChange } from './hooks/use-ai-change-tracker';

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
  onRejectAI
}: EditorToolbarProps) => {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
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
