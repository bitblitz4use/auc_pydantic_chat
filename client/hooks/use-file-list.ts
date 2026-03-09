"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { listStorageObjects, type StorageObject } from "@/lib/storage";
import { extractTags } from "@/lib/utils";

/**
 * Hook to manage file listing for a specific folder
 * Provides loading state, items, and available tags.
 * Loading spinner is only shown on initial load; refetch updates the list in the background.
 */
export function useFileList(folder: string) {
  const [items, setItems] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const hasLoadedOnce = useRef(false);

  const fetchFiles = useCallback(async () => {
    try {
      if (!hasLoadedOnce.current) setLoading(true);
      const files = await listStorageObjects(folder, false, true);
      hasLoadedOnce.current = true;
      setItems(files);
      setAvailableTags(extractTags(files));
    } catch (error) {
      console.error(`Error fetching ${folder}:`, error);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    fetchFiles();
  }, [fetchFiles]);

  return { items, loading, availableTags, refetch: fetchFiles };
}
