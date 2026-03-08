"use client";

import { Handle, Position } from "@xyflow/react";
import { Wand2, Settings, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { listStorageObjects } from "@/lib/storage";
import { Spinner } from "@/components/ui/spinner";
import { apiUrl } from "@/lib/config";

interface ModelInfo {
  id: string;
  name: string;
  chef: string;
  chefSlug: string;
  providers: string[];
}

export function PromptNode({ data, id }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [promptFiles, setPromptFiles] = useState<string[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Fetch available prompt files when popover opens
  useEffect(() => {
    if (isEditing && promptFiles.length === 0) {
      const fetchPrompts = async () => {
        try {
          setLoadingPrompts(true);
          const files = await listStorageObjects("prompts", false, false);
          const fileNames = files.map(f => f.name.replace('prompts/', ''));
          setPromptFiles(fileNames);
        } catch (error) {
          console.error("Error fetching prompts:", error);
        } finally {
          setLoadingPrompts(false);
        }
      };
      fetchPrompts();
    }
  }, [isEditing]);

  // Fetch available models from API
  useEffect(() => {
    if (isEditing && models.length === 0) {
      const fetchModels = async () => {
        try {
          setLoadingModels(true);
          const response = await fetch(apiUrl.providers());
          if (response.ok) {
            const data = await response.json();
            setModels(data.models || []);
          }
        } catch (error) {
          console.error("Error fetching models:", error);
        } finally {
          setLoadingModels(false);
        }
      };
      fetchModels();
    }
  }, [isEditing]);

  const handleDelete = () => {
    if (confirm(`Delete step "${data.label || 'Step'}"?`)) {
      data.onDelete?.(id);
      setIsEditing(false);
    }
  };

  return (
    <>
      {/* Input handle (connections come from left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-primary border border-background"
      />

      {/* Node card - shadcn design - extra compact */}
      <div className="bg-card border border-border rounded-md shadow-md min-w-[140px] max-w-[160px] hover:border-primary/50 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1 min-w-0">
            <Wand2 className="size-3 text-primary flex-shrink-0" />
            <span className="text-[11px] font-semibold text-foreground truncate">
              {data.label || 'Step'}
            </span>
          </div>
          
          {/* Settings popover */}
          <Popover open={isEditing} onOpenChange={setIsEditing}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-4 w-4 flex-shrink-0">
                <Settings className="size-2.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start" side="right">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`label-${id}`} className="text-xs font-medium">
                    Step Name
                  </Label>
                  <Input
                    id={`label-${id}`}
                    defaultValue={data.label}
                    onChange={(e) => {
                      data.onUpdate?.(id, { ...data, label: e.target.value });
                    }}
                    placeholder="e.g., Research Phase"
                    className="h-8"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor={`prompt-${id}`} className="text-xs font-medium">
                    Prompt File
                  </Label>
                  {loadingPrompts ? (
                    <div className="flex items-center justify-center h-8 border rounded-md w-full">
                      <Spinner className="size-4" />
                    </div>
                  ) : (
                    <Select
                      value={data.promptFile || ""}
                      onValueChange={(value) => {
                        data.onUpdate?.(id, { ...data, promptFile: value });
                      }}
                    >
                      <SelectTrigger id={`prompt-${id}`} className="h-8 font-mono text-xs w-full">
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
                  <p className="text-xs text-muted-foreground">
                    From prompts/ folder
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`model-${id}`} className="text-xs font-medium">
                    AI Model
                  </Label>
                  {loadingModels ? (
                    <div className="flex items-center justify-center h-8 border rounded-md w-full">
                      <Spinner className="size-4" />
                    </div>
                  ) : (
                    <Select
                      value={data.model || (models.length > 0 ? models[0].id : '')}
                      onValueChange={(value) => {
                        data.onUpdate?.(id, { ...data, model: value });
                      }}
                    >
                      <SelectTrigger id={`model-${id}`} className="h-8 w-full">
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
                                <span className="text-xs text-muted-foreground">
                                  {model.chef}
                                </span>
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
                  <Label htmlFor={`desc-${id}`} className="text-xs font-medium">
                    Description (optional)
                  </Label>
                  <Textarea
                    id={`desc-${id}`}
                    defaultValue={data.description || ''}
                    onChange={(e) => {
                      data.onUpdate?.(id, { ...data, description: e.target.value });
                    }}
                    placeholder="What does this step do?"
                    className="h-16 text-xs resize-none"
                  />
                </div>

                <Separator />

                {/* Delete button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete Step
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Body - extra compact */}
        <div className="px-2 py-1 space-y-0.5">
          <div className="text-[9px] text-muted-foreground truncate">
            {data.promptFile ? `📄 ${data.promptFile}` : '⚠️ No file'}
          </div>
          {data.model && (
            <div className="text-[9px] text-muted-foreground truncate">
              🤖 {models.find(m => m.id === data.model)?.name || data.model}
            </div>
          )}
        </div>
      </div>

      {/* Output handle (connections go right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-primary border border-background"
      />
    </>
  );
}
