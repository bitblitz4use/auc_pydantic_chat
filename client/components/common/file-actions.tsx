"use client";

import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface FileActionsProps {
  onNew: () => void;
  onUpload: () => void;
  uploading?: boolean;
  newLabel?: string;
  size?: "default" | "sm";
}

/**
 * Reusable file action buttons (New, Upload)
 * Displays buttons for creating new files and uploading
 */
export function FileActions({ 
  onNew, 
  onUpload, 
  uploading = false, 
  newLabel = "New",
  size = "default"
}: FileActionsProps) {
  return (
    <div className="flex gap-2">
      <Button onClick={onNew} variant="outline" size={size}>
        <Plus className="mr-2 size-4" />
        {newLabel}
      </Button>
      <Button onClick={onUpload} variant="outline" size={size} disabled={uploading}>
        {uploading ? (
          <>
            <Spinner className="mr-2 size-4" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 size-4" />
            Upload
          </>
        )}
      </Button>
    </div>
  );
}
