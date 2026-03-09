"use client";

import { useState, useCallback } from "react";
import { getFileContent, updateFileContent, deleteFile, type StorageObject } from "@/lib/storage";
import { parsePromptChain, serializePromptChain, type ParsedChain } from "@/lib/prompt-chains";
import { useAppDialog } from "@/components/app-dialog-provider";

/**
 * Hook to manage chain operations: expand, update, save, delete
 * Handles all chain-specific business logic
 */
export function useChainManager(refetch: () => Promise<void>) {
  const { alert, confirm } = useAppDialog();
  const [expandedChainId, setExpandedChainId] = useState<string | null>(null);
  const [loadingChainId, setLoadingChainId] = useState<string | null>(null);
  const [chainData, setChainData] = useState<Map<string, ParsedChain>>(new Map());
  const [saving, setSaving] = useState(false);

  const handleExpandChain = useCallback(async (chain: StorageObject) => {
    const chainId = chain.name;
    
    if (expandedChainId === chainId) {
      // Collapse
      setExpandedChainId(null);
      return;
    }

    // Load chain data if not already loaded
    if (!chainData.has(chainId)) {
      try {
        setLoadingChainId(chainId);
        const content = await getFileContent(chain.name);
        const parsed = parsePromptChain(content);
        setChainData(prev => new Map(prev).set(chainId, parsed));
        setExpandedChainId(chainId);
      } catch (error) {
        console.error("Error loading chain:", error);
        await alert("Failed to load chain");
      } finally {
        setLoadingChainId(null);
      }
    } else {
      setExpandedChainId(chainId);
    }
  }, [expandedChainId, chainData, alert]);

  const handleChainUpdate = useCallback((chainId: string, updatedParsed: ParsedChain) => {
    setChainData(prev => new Map(prev).set(chainId, updatedParsed));
  }, []);

  const handleSaveChain = useCallback(async (chainId: string) => {
    const parsed = chainData.get(chainId);
    if (!parsed) return;

    try {
      setSaving(true);
      const serialized = serializePromptChain(parsed.metadata, parsed.content);
      await updateFileContent(chainId, serialized, parsed.metadata.tags);
      await refetch();
    } catch (error) {
      console.error("Error saving chain:", error);
      await alert("Failed to save chain");
    } finally {
      setSaving(false);
    }
  }, [chainData, refetch, alert]);

  const handleDeleteChain = useCallback(async (objectName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const fileName = objectName.replace('chains/', '');
    if (!(await confirm(`Delete "${fileName}"?`))) return;

    try {
      await deleteFile(objectName);
      setChainData(prev => {
        const newMap = new Map(prev);
        newMap.delete(objectName);
        return newMap;
      });
      if (expandedChainId === objectName) {
        setExpandedChainId(null);
      }
      await refetch();
    } catch (error) {
      console.error("Error deleting chain:", error);
      await alert("Failed to delete chain");
    }
  }, [expandedChainId, refetch, alert, confirm]);

  return {
    expandedChainId,
    chainData,
    loadingChainId,
    saving,
    handleExpandChain,
    handleChainUpdate,
    handleSaveChain,
    handleDeleteChain,
  };
}
