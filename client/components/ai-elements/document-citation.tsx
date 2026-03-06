"use client";

import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentCitationProps {
  documentName: string;
  onClear?: () => void;
  className?: string;
}

export function DocumentCitation({
  documentName,
  onClear,
  className,
}: DocumentCitationProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground w-fit px-2 py-1 rounded-md border border-border",
        className
      )}
    >
      <FileText className="size-3" />
      <span className="truncate max-w-[120px]">{documentName}</span>
      {onClear && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto w-auto p-0.5 hover:bg-transparent"
          onClick={onClear}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
