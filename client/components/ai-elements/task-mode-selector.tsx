"use client";

import { MessageSquare, FileEdit, FileText } from "lucide-react";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type TaskMode = "ask" | "write" | "summarize";

interface TaskModeSelectorProps {
  mode: TaskMode;
  onModeChange: (mode: TaskMode) => void;
  activeDocument?: string | null;
  activeSource?: string | null;
  className?: string;
}

export function TaskModeSelector({
  mode,
  onModeChange,
  activeDocument,
  activeSource,
  className,
}: TaskModeSelectorProps) {
  const handleValueChange = (value: TaskMode) => {
    onModeChange(value);
  };

  return (
    <PromptInputSelect 
      value={mode} 
      onValueChange={handleValueChange}
    >
      <PromptInputSelectTrigger 
        className={cn("w-fit", className)}
        disabled={mode === "write" && !activeDocument}
      >
        <PromptInputSelectValue>
          {mode === "ask" ? (
            <div className="flex items-center gap-1.5">
              <MessageSquare className="size-4 text-orange-400" />
              <span className="text-xs">Ask</span>
            </div>
          ) : mode === "write" ? (
            <div className="flex items-center gap-1.5">
              <FileEdit className="size-4 text-green-500" />
              <span className="text-xs">Write</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <FileText className="size-4 text-blue-500" />
              <span className="text-xs">Summarize</span>
            </div>
          )}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        <PromptInputSelectItem value="ask">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-orange-400" />
            <span>Ask</span>
          </div>
        </PromptInputSelectItem>
        <PromptInputSelectItem value="write" disabled={!activeDocument}>
          <div className="flex items-center gap-2">
            <FileEdit className="size-4 text-green-500" />
            <span>Write</span>
          </div>
        </PromptInputSelectItem>
        <PromptInputSelectItem value="summarize">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-blue-500" />
            <span>Summarize</span>
          </div>
        </PromptInputSelectItem>
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}
