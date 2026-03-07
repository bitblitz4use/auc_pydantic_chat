"use client";

import { CheckCircle2, Loader2, AlertCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversionProgress } from "@/lib/storage";

interface ConversionProgressCardProps {
  progress: ConversionProgress;
  filename: string;
}

export function ConversionProgressCard({ progress, filename }: ConversionProgressCardProps) {
  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg border p-4 transition-all",
      isError && "border-destructive/50 bg-destructive/5",
      isComplete && "border-green-500/50 bg-green-500/5",
      !isError && !isComplete && "border-primary/50 bg-primary/5"
    )}>
      {/* Animated background */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent transition-all duration-300"
        style={{ width: `${progress.progress}%` }}
      />

      <div className="relative flex items-center gap-3">
        <div className="flex shrink-0">
          {isError ? (
            <AlertCircle className="size-5 text-destructive" />
          ) : isComplete ? (
            <CheckCircle2 className="size-5 text-green-500" />
          ) : (
            <Loader2 className="size-5 animate-spin text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <p className="truncate text-sm font-medium">{filename}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progress.message}</p>
        </div>

        <div className="shrink-0 text-xs font-mono text-muted-foreground">
          {progress.progress}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-300",
            isError && "bg-destructive",
            isComplete && "bg-green-500",
            !isError && !isComplete && "bg-primary"
          )}
          style={{ width: `${progress.progress}%` }}
        />
      </div>
    </div>
  );
}
