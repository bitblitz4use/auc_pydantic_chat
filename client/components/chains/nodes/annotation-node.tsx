"use client";

import { NodeResizer } from "@xyflow/react";
import { MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AnnotationNode({ data, selected, id }: any) {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const handleDelete = () => {
    if (confirm(`Delete note "${data.title || 'Note'}"?`)) {
      data.onDelete?.(id);
    }
  };

  return (
    <>
      {/* Make it resizable */}
      <NodeResizer 
        minWidth={200} 
        minHeight={100}
        isVisible={selected}
        lineClassName="border-amber-400"
        handleClassName="size-2 bg-amber-400"
      />
      
      {/* Semi-transparent container with backdrop blur */}
      <div 
        className="w-full h-full bg-amber-50/40 dark:bg-amber-900/20 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-lg p-3 backdrop-blur-sm"
        style={{ minWidth: 200, minHeight: 100 }}
      >
        {/* Header with icon, editable title, and delete button */}
        <div className="flex items-center gap-2 mb-2 justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <MessageSquare className="size-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            {isEditingTitle ? (
              <Input
                defaultValue={data.title || 'Note'}
                onBlur={(e) => {
                  data.onUpdate?.(id, { ...data, title: e.target.value });
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                autoFocus
                className="h-5 text-xs font-semibold px-1 py-0"
              />
            ) : (
              <span 
                className="text-xs font-semibold text-amber-900 dark:text-amber-100 cursor-text truncate"
                onClick={() => setIsEditingTitle(true)}
              >
                {data.title || 'Note'}
              </span>
            )}
          </div>
          
          {/* Delete button - only visible when selected */}
          {selected && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0 opacity-60 hover:opacity-100 nopan nodrag"
              onClick={handleDelete}
            >
              <Trash2 className="size-3 text-amber-700 dark:text-amber-300" />
            </Button>
          )}
        </div>
        
        {/* Comment text - editable */}
        {isEditingComment ? (
          <Textarea
            defaultValue={data.comment}
            onBlur={(e) => {
              data.onUpdate?.(id, { ...data, comment: e.target.value });
              setIsEditingComment(false);
            }}
            autoFocus
            className="text-xs min-h-[60px] bg-white/50 dark:bg-gray-800/50 resize-none nopan"
          />
        ) : (
          <p 
            className="text-xs text-amber-800 dark:text-amber-200 whitespace-pre-wrap cursor-text min-h-[60px]"
            onClick={() => setIsEditingComment(true)}
          >
            {data.comment || 'Click to add comment...'}
          </p>
        )}
      </div>
    </>
  );
}
