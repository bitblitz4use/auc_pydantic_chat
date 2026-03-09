"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, X, Save, FileText, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getFileContent, updateFileContent, getFileTags, listStorageObjects } from "@/lib/storage";
import { TagSelector } from "@/components/ui/tag-selector";
import { extractTags, ensureMdExtension } from "@/lib/utils";
import type { ChainMetadata } from "@/lib/prompt-chains";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useAppDialog } from "@/components/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/config";

interface ModelInfo {
  id: string;
  name: string;
  chef: string;
  chefSlug: string;
  providers: string[];
}

export interface ChainStepPanelProps {
  activeNodeId: string | null;
  orderedStepIds: string[];
  chain: ChainMetadata;
  onActiveNodeChange: (nodeId: string | null) => void;
  onUpdateNodePromptFile?: (nodeId: string, promptFile: string) => void;
  onUpdateNodeData?: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode?: (nodeId: string) => void;
}

const MIN_TEXTAREA_HEIGHT = 140;
const MAX_TEXTAREA_HEIGHT = 400;

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    el.style.height = `${h}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      rows={5}
    />
  );
}

/**
 * Must be rendered inside ReactFlow (as a child of Canvas). Centers the active node in view
 * while keeping the current zoom level. Renders nothing.
 */
export function FitViewOnActiveNode({ activeNodeId }: { activeNodeId: string | null }) {
  const { setCenter, getZoom, getNodesBounds } = useReactFlow();
  useEffect(() => {
    if (!activeNodeId) return;
    const bounds = getNodesBounds([activeNodeId]);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const zoom = getZoom();
    setCenter(cx, cy, { zoom, duration: 300 });
  }, [activeNodeId, setCenter, getZoom, getNodesBounds]);
  return null;
}

/**
 * Must be rendered inside ReactFlow. Listens for fullscreen changes and runs fitView
 * so nodes stay in correct view when entering or leaving fullscreen.
 */
export function FitViewOnFullscreenChange() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const onFullscreenChange = () => {
      setTimeout(() => {
        fitView({ duration: 300, padding: 0.2, maxZoom: 1 });
      }, 100);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [fitView]);
  return null;
}

/**
 * Panel content only. Render outside ReactFlow (e.g. in chain-canvas as sibling to Canvas)
 * with position absolute bottom-left so it does not affect React Flow internals.
 */
const DEFAULT_NEW_PROMPT_NAME = "new-prompt";

export function ChainStepPanelContent({
  activeNodeId,
  orderedStepIds,
  chain,
  onActiveNodeChange,
  onUpdateNodePromptFile,
  onUpdateNodeData,
  onDeleteNode,
}: ChainStepPanelProps) {
  const { alert, confirm } = useAppDialog();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [creating, setCreating] = useState(false);
  const [promptFiles, setPromptFiles] = useState<string[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const nodes = chain.canvas?.nodes ?? [];
  const activeNode = activeNodeId
    ? nodes.find((n) => n.id === activeNodeId)
    : null;
  const promptFile =
    activeNode?.type === "prompt" ? (activeNode.data?.promptFile as string) ?? "" : "";
  const currentIndex = activeNodeId ? orderedStepIds.indexOf(activeNodeId) : -1;
  const stepLabel = activeNode?.type === "prompt" ? (activeNode.data?.label as string) ?? "Step" : "";
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < orderedStepIds.length - 1;

  // Fetch prompt files and models when panel is open (for Settings tab)
  useEffect(() => {
    if (!activeNodeId) return;
    const fetchPrompts = async () => {
      try {
        setLoadingPrompts(true);
        const files = await listStorageObjects("prompts", false, false);
        setPromptFiles(files.map((f) => f.name.replace("prompts/", "")));
      } catch (e) {
        console.warn("Failed to fetch prompts:", e);
      } finally {
        setLoadingPrompts(false);
      }
    };
    const fetchModels = async () => {
      try {
        setLoadingModels(true);
        const response = await fetch(apiUrl.providers());
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || []);
        }
      } catch (e) {
        console.warn("Failed to fetch models:", e);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchPrompts();
    fetchModels();
  }, [activeNodeId]);

  const loadPrompt = useCallback(async () => {
    if (!promptFile) {
      setContent("");
      setOriginalContent("");
      setFileTags([]);
      setOriginalTags([]);
      return;
    }
    setLoading(true);
    try {
      const path = `prompts/${promptFile}`;
      const [text, tags] = await Promise.all([
        getFileContent(path),
        getFileTags(path),
      ]);
      setContent(text);
      setOriginalContent(text);
      setFileTags(tags ?? []);
      setOriginalTags(tags ?? []);
      const files = await listStorageObjects("prompts", false, true);
      setAvailableTags(extractTags(files));
    } catch (e) {
      console.warn("Failed to load prompt:", e);
      setContent("");
      setOriginalContent("");
      setFileTags([]);
      setOriginalTags([]);
    } finally {
      setLoading(false);
    }
  }, [promptFile]);

  useEffect(() => {
    loadPrompt();
  }, [loadPrompt]);

  // When no prompt file, fetch available tags for the create form and set default new filename
  useEffect(() => {
    if (!promptFile && activeNodeId) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      setNewFileName(`${DEFAULT_NEW_PROMPT_NAME}-${timestamp}.md`);
      listStorageObjects("prompts", false, true).then((files) => setAvailableTags(extractTags(files)));
    }
  }, [promptFile, activeNodeId]);

  const handleCreatePrompt = async () => {
    if (!activeNodeId || !onUpdateNodePromptFile) return;
    const fileName = ensureMdExtension(newFileName.trim() || `${DEFAULT_NEW_PROMPT_NAME}.md`);
    if (!fileName) return;
    setCreating(true);
    try {
      await updateFileContent(`prompts/${fileName}`, content, fileTags);
      onUpdateNodePromptFile(activeNodeId, fileName);
      setContent("");
      setOriginalContent("");
      setNewFileName("");
    } catch (e) {
      console.error("Failed to create prompt:", e);
      await alert("Failed to create prompt");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!promptFile) return;
    setSaving(true);
    try {
      await updateFileContent(`prompts/${promptFile}`, content, fileTags);
      setOriginalContent(content);
      setOriginalTags(fileTags);
    } catch (e) {
      console.error("Failed to save prompt:", e);
      await alert("Failed to save prompt");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent || JSON.stringify(fileTags) !== JSON.stringify(originalTags);

  const handlePrev = () => {
    if (!canPrev) return;
    onActiveNodeChange(orderedStepIds[currentIndex - 1]);
  };

  const handleNext = () => {
    if (!canNext) return;
    onActiveNodeChange(orderedStepIds[currentIndex + 1]);
  };

  const handleClose = () => onActiveNodeChange(null);

  const handleDeleteStep = async () => {
    if (!activeNodeId || !onDeleteNode) return;
    if (await confirm(`Delete step "${stepLabel}"?`)) {
      onDeleteNode(activeNodeId);
    }
  };

  const updateNodeData = (partial: Record<string, unknown>) => {
    if (!activeNodeId || !onUpdateNodeData || !activeNode?.data) return;
    onUpdateNodeData(activeNodeId, { ...activeNode.data, ...partial });
  };

  // Settings tab only shows for prompt nodes; cast to prompt node data shape
  const promptNodeData =
    activeNode?.type === "prompt"
      ? (activeNode.data as { label?: string; promptFile?: string; model?: string; description?: string })
      : null;

  if (!activeNodeId) return null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg w-[420px] min-h-[200px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <FileText className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{stepLabel}</span>
          {orderedStepIds.length > 1 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {currentIndex + 1} / {orderedStepIds.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {orderedStepIds.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrev}
                disabled={!canPrev}
                aria-label="Previous step"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNext}
                disabled={!canNext}
                aria-label="Next step"
              >
                <ChevronRight className="size-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="shrink-0 mx-3 mt-2 w-[calc(100%-1.5rem)]">
          <TabsTrigger value="settings" className="flex-1">
            <Settings className="size-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="prompt" className="flex-1">
            <FileText className="size-3.5 mr-1.5" />
            Prompt
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="flex-1 min-h-0 overflow-auto p-3 mt-2 data-[state=inactive]:hidden flex flex-col">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="panel-label" className="text-xs font-medium">
                Step Name
              </Label>
              <Input
                id="panel-label"
                value={promptNodeData?.label ?? ""}
                onChange={(e) => updateNodeData({ label: e.target.value })}
                placeholder="e.g., Research Phase"
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-prompt" className="text-xs font-medium">
                Prompt File
              </Label>
              {loadingPrompts ? (
                <div className="flex items-center justify-center h-8 border rounded-md w-full">
                  <Spinner className="size-4" />
                </div>
              ) : (
                <Select
                  value={promptNodeData?.promptFile || ""}
                  onValueChange={(value) => updateNodeData({ promptFile: value })}
                >
                  <SelectTrigger id="panel-prompt" className="h-8 font-mono text-xs w-full">
                    <SelectValue placeholder="Select a prompt file..." />
                  </SelectTrigger>
                  <SelectContent>
                    {promptFiles.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        No prompts available
                      </SelectItem>
                    ) : (
                      promptFiles.map((file) => (
                        <SelectItem key={file} value={file} className="font-mono text-xs">
                          {file}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">From prompts/ folder</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-model" className="text-xs font-medium">
                AI Model
              </Label>
              {loadingModels ? (
                <div className="flex items-center justify-center h-8 border rounded-md w-full">
                  <Spinner className="size-4" />
                </div>
              ) : (
                <Select
                  value={promptNodeData?.model || ""}
                  onValueChange={(value) => updateNodeData({ model: value })}
                >
                  <SelectTrigger id="panel-model" className="h-8 w-full">
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        No models available
                      </SelectItem>
                    ) : (
                      models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{model.chef}</span>
                            <span>·</span>
                            <span>{model.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-desc" className="text-xs font-medium">
                Description (optional)
              </Label>
              <Textarea
                id="panel-desc"
                value={promptNodeData?.description ?? ""}
                onChange={(e) => updateNodeData({ description: e.target.value })}
                placeholder="What does this step do?"
                className="h-16 text-xs resize-none"
              />
            </div>
            <Separator />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDeleteStep}
              disabled={!onDeleteNode}
            >
              <Trash2 className="mr-2 size-4" />
              Delete Step
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="prompt" className="flex-1 flex flex-col min-h-0 overflow-auto p-3 mt-2 data-[state=inactive]:hidden">
          {!promptFile ? (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-muted-foreground text-center">
                No prompt linked. Create one below or pick one in the Settings tab.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Filename</label>
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="prompt-name.md"
                  className="font-mono text-sm"
                />
              </div>
              <div className="shrink-0">
                <TagSelector tags={fileTags} availableTags={availableTags} onChange={setFileTags} />
              </div>
              <div className="flex-1 min-h-[100px]">
                <AutoGrowTextarea
                  value={content}
                  onChange={setContent}
                  placeholder="Prompt content..."
                  className={cn(
                    "w-full min-h-[100px] resize-none font-mono text-sm overflow-y-auto",
                    "border border-input rounded-md px-3 py-2"
                  )}
                />
              </div>
              <Button
                size="sm"
                onClick={handleCreatePrompt}
                disabled={creating || !onUpdateNodePromptFile}
                className="w-full"
              >
                {creating ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 size-4" />
                    Create prompt
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="text-xs font-mono text-muted-foreground truncate shrink-0" title={promptFile}>
                📄 {promptFile}
              </div>
              {!loading && (
                <div className="shrink-0">
                  <TagSelector
                    tags={fileTags}
                    availableTags={availableTags}
                    onChange={setFileTags}
                  />
                </div>
              )}
              <div className="shrink-0 min-h-[120px]">
                {loading ? (
                  <div className="flex items-center justify-center min-h-[140px]">
                    <Spinner className="size-6" />
                  </div>
                ) : (
                  <AutoGrowTextarea
                    value={content}
                    onChange={setContent}
                    placeholder="Prompt content..."
                    className={cn(
                      "w-full min-h-[140px] resize-none font-mono text-sm overflow-y-auto",
                      "border border-input rounded-md"
                    )}
                  />
                )}
              </div>
              <div className="flex justify-end gap-2 shrink-0 pt-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges || loading}
                >
                  {saving ? (
                    <>
                      <Spinner className="mr-2 size-4" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
