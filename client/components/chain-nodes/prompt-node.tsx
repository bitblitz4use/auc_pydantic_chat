"use client";

import { Handle, Position } from "@xyflow/react";
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

        {/* Body - extra compact */}
        <div className="px-2 py-1 space-y-0.5">
          <div className="text-[9px] text-muted-foreground truncate">
            {data.promptFile ? `📄 ${data.promptFile}` : '⚠️ No file'}
          </div>
          {data.model && (
            <div className="text-[9px] text-muted-foreground truncate">
              🤖 {data.model}
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
