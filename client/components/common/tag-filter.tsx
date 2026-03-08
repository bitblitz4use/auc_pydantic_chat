"use client";

import { Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClear: () => void;
}

/**
 * Reusable tag filter component
 * Displays clickable tags for filtering and a clear button
 */
export function TagFilter({ 
  availableTags, 
  selectedTags, 
  onToggleTag, 
  onClear 
}: TagFilterProps) {
  if (availableTags.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 flex-shrink-0">
      {availableTags.map((tag) => {
        const isSelected = selectedTags.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-accent"
            )}
          >
            <Tag className="size-3" />
            {tag}
            {isSelected && <X className="size-3" />}
          </button>
        );
      })}
      {selectedTags.length > 0 && (
        <button
          onClick={onClear}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
