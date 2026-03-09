"use client";

import { useState, KeyboardEvent, useRef, useEffect } from "react";
import { X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagSelectorProps {
  tags: string[];
  availableTags?: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

export function TagSelector({
  tags,
  availableTags = [],
  onChange,
  className,
}: TagSelectorProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputValue("");
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  // Filter suggestions - show all available tags when input is empty, filter when typing
  const suggestions = availableTags.filter((tag) => {
    if (tags.includes(tag)) return false; // Don't show already selected tags
    if (inputValue.trim().length === 0) return true; // Show all when input is empty
    return tag.toLowerCase().includes(inputValue.toLowerCase()); // Filter when typing
  });

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div
            key={tag}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
          >
            <Tag className="size-3 text-muted-foreground" />
            <span className="font-medium">{tag}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-4 w-4 hover:bg-destructive/20"
              onClick={() => handleRemoveTag(tag)}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Type to filter or press Enter to create new tag..."
          className="pr-20"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md max-h-48 overflow-y-auto">
            {suggestions.slice(0, 10).map((tag) => (
              <button
                key={tag}
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                onClick={() => handleAddTag(tag)}
              >
                <Tag className="size-3 text-muted-foreground" />
                {tag}
              </button>
            ))}
          </div>
        )}
        {showSuggestions &&
          inputValue.trim() &&
          !tags.includes(inputValue.trim()) &&
          suggestions.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                onClick={() => handleAddTag(inputValue)}
              >
                Create "{inputValue.trim()}"
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
