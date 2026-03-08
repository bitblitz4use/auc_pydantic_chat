"use client";

import { useState, useEffect, useCallback } from "react";
import { listStorageObjects, type StorageObject } from "@/lib/storage";
import { extractTags } from "@/lib/utils";

/**
 * Hook to manage file listing for a specific folder
 * Provides loading state, items, and available tags
 */
export function useFileList(folder: string) {
  const [items, setItems] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await listStorageObjects(folder, false, true);
      setItems(files);
      setAvailableTags(extractTags(files));
    } catch (error) {
      console.error(`Error fetching ${folder}:`, error);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return { items, loading, availableTags, refetch: fetchFiles };
}
