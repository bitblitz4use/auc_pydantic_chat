"use client";

import { Wand2 } from "lucide-react";
import { FileManagerView } from "@/components/file-manager-view";

export function PromptsView() {
  return (
    <FileManagerView
      folder="prompts"
      icon={Wand2}
      title="Prompts Library"
      defaultFileName="new-prompt.md"
      emptyStateTitle="Prompts Library"
      emptyStateDescription="No prompts found. Create a new prompt or upload an existing file to get started."
    />
  );
}
