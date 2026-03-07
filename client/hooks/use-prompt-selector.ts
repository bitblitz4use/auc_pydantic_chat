"use client";

import { useState, useEffect, useCallback } from "react";
import { listStorageObjects, getFileContent, type StorageObject } from "@/lib/storage";

export function usePromptSelector() {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch prompts when selector opens
  useEffect(() => {
    if (open) {
      const fetchPrompts = async () => {
        try {
          setLoading(true);
          const files = await listStorageObjects("prompts", false);
          setPrompts(files);
        } catch (error) {
          console.error("Error fetching prompts:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchPrompts();
    }
  }, [open]);

  const handlePromptSelect = useCallback(
    async (promptName: string, onInsert: (text: string) => void) => {
      try {
        const content = await getFileContent(promptName);
        onInsert(content);
        setOpen(false);
      } catch (error) {
        console.error("Error loading prompt:", error);
      }
    },
    []
  );

  return {
    open,
    setOpen,
    prompts,
    loading,
    handlePromptSelect,
  };
}
