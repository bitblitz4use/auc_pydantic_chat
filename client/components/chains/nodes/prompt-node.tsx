"use client";

import { Handle, Position } from "@xyflow/react";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromptNode({ data }: any) {
  return (
    <>
      {/* Input handle (connections come from left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-primary border border-background"
      />

      {/* Node card - shadcn design - extra compact; ring when active (panel open) */}
      <div
        className={cn(
          "bg-card border border-border rounded-md shadow-md min-w-[140px] max-w-[160px] hover:border-primary/50 transition-all",
          data.isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30">
          <Wand2 className="size-3 text-primary flex-shrink-0" />
          <span className="text-[11px] font-semibold text-foreground truncate">
            {data.label || "Step"}
          </span>
        </div>

        {/* Body - extra compact */}
        <div className="px-2 py-1 space-y-0.5">
          <div className="text-[9px] text-muted-foreground truncate">
            {data.promptFile ? `📄 ${data.promptFile}` : "⚠️ No file"}
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
