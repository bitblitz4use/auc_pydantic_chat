"use client";

import { useState, useCallback, useMemo } from "react";

/**
 * Hook to manage tag-based filtering for items
 * Generic hook that works with any item type that has optional tags
 */
export function useTagFilter<T extends { tags?: string[] }>(
  items: T[],
  availableTags: string[]
) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredItems = useMemo(() => {
    if (selectedTags.length === 0) return items;
    return items.filter((item) =>
      item.tags && selectedTags.every((tag) => item.tags!.includes(tag))
    );
  }, [items, selectedTags]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

  return {
    selectedTags,
    filteredItems,
    availableTags,
    toggleTag,
    clearTags,
  };
}
