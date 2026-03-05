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
} from 'lucide-react';

interface EditorToolbarProps {
  commands: EditorCommands;
  disabled?: boolean;
  canUndoAI?: boolean;
  canRedoAI?: boolean;
  onUndoAI?: () => void;
  onRedoAI?: () => void;
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
  canUndoAI = false,
  canRedoAI = false,
  onUndoAI,
  onRedoAI
}: EditorToolbarProps) => {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
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

      {/* AI Undo/Redo - Right aligned */}
      {(onUndoAI || onRedoAI) && (
        <>
          <div className="ml-auto" />
          {onUndoAI && (
            <button
              onClick={onUndoAI}
              disabled={!canUndoAI}
              className="rounded px-3 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              title="Undo all AI changes"
            >
              ⎌ Undo AI
            </button>
          )}
          {onRedoAI && (
            <button
              onClick={onRedoAI}
              disabled={!canRedoAI}
              className="rounded px-3 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              title="Redo AI changes"
            >
              ⟲ Redo AI
            </button>
          )}
        </>
      )}
    </div>
  );
});

EditorToolbar.displayName = 'EditorToolbar';
