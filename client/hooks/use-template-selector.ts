"use client";

import { useState, useEffect, useCallback } from "react";
import { listStorageObjects, getFileContent, type StorageObject } from "@/lib/storage";

export function useTemplateSelector() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch templates when selector opens
  useEffect(() => {
    if (open) {
      const fetchTemplates = async () => {
        try {
          setLoading(true);
          const files = await listStorageObjects("templates", false);
          setTemplates(files);
        } catch (error) {
          console.error("Error fetching templates:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchTemplates();
    }
  }, [open]);

  const handleTemplateSelect = useCallback(
    async (templateName: string, onInsert: (markdown: string) => void) => {
      try {
        const content = await getFileContent(templateName);
        onInsert(content);
        setOpen(false);
      } catch (error) {
        console.error("Error loading template:", error);
      }
    },
    []
  );

  return {
    open,
    setOpen,
    templates,
    loading,
    handleTemplateSelect,
  };
}
