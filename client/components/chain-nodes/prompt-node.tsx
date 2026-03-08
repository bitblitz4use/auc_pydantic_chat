"use client";

import { Handle, Position } from "reactflow";
import { Wand2, Settings } from "lucide-react";
import { useState } from "react";
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

export function PromptNode({ data, id }: any) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      {/* Input handle (connections come from above) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary border-2 border-background"
      />

      {/* Node card - shadcn design */}
      <div className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[240px] hover:border-primary/50 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="size-4 text-primary flex-shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">
              {data.label || 'Prompt Step'}
            </span>
          </div>
          
          {/* Settings popover */}
          <Popover open={isEditing} onOpenChange={setIsEditing}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                <Settings className="size-3.5" />
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
                  <Input
                    id={`prompt-${id}`}
                    defaultValue={data.promptFile}
                    onChange={(e) => {
                      data.onUpdate?.(id, { ...data, promptFile: e.target.value });
                    }}
                    placeholder="prompt-name.md"
                    className="h-8 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    From prompts/ folder
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`model-${id}`} className="text-xs font-medium">
                    AI Model
                  </Label>
                  <Select
                    defaultValue={data.model || 'gpt-4'}
                    onValueChange={(value) => {
                      data.onUpdate?.(id, { ...data, model: value });
                    }}
                  >
                    <SelectTrigger id={`model-${id}`} className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                      <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                    </SelectContent>
                  </Select>
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
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono truncate">
              {data.promptFile ? `📄 ${data.promptFile}` : '⚠️ No prompt selected'}
            </span>
          </div>
          {data.model && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>🤖 {data.model}</span>
            </div>
          )}
          {data.description && (
            <div className="text-xs text-muted-foreground/80 line-clamp-2 pt-1 border-t border-border/50">
              {data.description}
            </div>
          )}
        </div>
      </div>

      {/* Output handle (connections go down) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary border-2 border-background"
      />
    </>
  );
}
