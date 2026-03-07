"use client";

import { useState, useEffect, useCallback } from "react";
import { listSources, type Source } from "@/lib/storage";
import { type TaskMode } from "@/components/ai-elements/task-mode-selector";

export function useSourceSelector(taskMode: TaskMode, activeSource: string | null) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);

  // Auto-open source selector when switching to summarize mode
  useEffect(() => {
    if (taskMode === "summarize" && !activeSource) {
      setOpen(true);
    }
  }, [taskMode, activeSource]);

  // Fetch sources when selector opens
  useEffect(() => {
    if (open) {
      const fetchSources = async () => {
        try {
          setLoading(true);
          const fetchedSources = await listSources(true);
          setSources(fetchedSources);
        } catch (error) {
          console.error("Error fetching sources:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchSources();
    }
  }, [open]);

  const handleSourceSelect = useCallback(
    (source: Source, onSelect: (sourceId: string, sourceName: string) => void) => {
      onSelect(source.source_id, source.original_filename || source.source_id);
      setOpen(false);
    },
    []
  );

  return {
    open,
    setOpen,
    sources,
    loading,
    handleSourceSelect,
  };
}
