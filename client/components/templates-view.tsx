"use client";

import { Layout } from "lucide-react";
import { FileManagerView } from "@/components/file-manager-view";

export function TemplatesView() {
  return (
    <FileManagerView
      folder="templates"
      icon={Layout}
      title="Document Templates"
      defaultFileName="new-template.md"
      emptyStateTitle="Document Templates"
      emptyStateDescription="No templates found. Create a new template or upload an existing file to get started."
    />
  );
}
