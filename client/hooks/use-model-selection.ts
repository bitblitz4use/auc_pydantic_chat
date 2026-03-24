"use client";

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/config";

export interface ModelInfo {
  id: string;
  name: string;
  chef: string;
  chefSlug: string;
  providers: string[];
}

// Default models for initial state (will be replaced by API fetch)
const defaultModels: ModelInfo[] = [
  {
    chef: "Ollama",
    chefSlug: "ollama",
    id: "ollama:gpt-oss:20b",
    name: "gpt-oss:20b",
    providers: ["ollama"],
  },
];

const MODEL_SELECTION_STORAGE_KEY = "auc.chat.selectedModel.v1";

export function useModelSelection() {
  const [models, setModels] = useState<ModelInfo[]>(defaultModels);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  
  // Initialize model with safe fallback - use defaultModels directly
  const initialModel = defaultModels.length > 0 
    ? defaultModels[0].id 
    : "ollama:gpt-oss:20b";
  
  const [selectedModel, setSelectedModel] = useState<string>(initialModel);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODEL_SELECTION_STORAGE_KEY);
      if (stored && stored.trim()) {
        setSelectedModel(stored.trim());
      }
    } catch {
      // Ignore localStorage failures.
    }
  }, []);

  // Fetch available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(apiUrl.providers());
        if (response.ok) {
          const data = await response.json();
          const fetchedModels = data.models || defaultModels;
          setModels(fetchedModels);
          setSelectedModel((prev) => {
            if (fetchedModels.some((model: ModelInfo) => model.id === prev)) {
              return prev;
            }
            return fetchedModels.length > 0 ? fetchedModels[0].id : prev;
          });
        } else {
          console.error("Failed to fetch models:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching models:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    try {
      window.localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, selectedModel);
    } catch {
      // Ignore localStorage failures.
    }
  }, [selectedModel]);

  const handleModelSelect = useCallback((id: string) => {
    setSelectedModel(id);
    setSelectorOpen(false);
  }, []);

  const selectedModelData = models.find((m) => m.id === selectedModel);

  return {
    models,
    selectedModel,
    selectedModelData,
    loading,
    selectorOpen,
    setSelectorOpen,
    handleModelSelect,
  };
}
