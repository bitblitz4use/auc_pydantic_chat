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

export function useModelSelection() {
  const [models, setModels] = useState<ModelInfo[]>(defaultModels);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  
  // Initialize model with safe fallback - use defaultModels directly
  const initialModel = defaultModels.length > 0 
    ? defaultModels[0].id 
    : "ollama:gpt-oss:20b";
  
  const [selectedModel, setSelectedModel] = useState<string>(initialModel);

  // Fetch available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(apiUrl.providers());
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || defaultModels);
          if (data.models && data.models.length > 0) {
            setSelectedModel(data.models[0].id);
          }
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
