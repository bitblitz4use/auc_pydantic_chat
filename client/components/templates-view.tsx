"use client";

import { Layout } from "lucide-react";

export function TemplatesView() {
  return (
    <div className="h-full overflow-hidden px-4 pt-4 pb-4">
      <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border">
        <div className="max-w-md space-y-4 text-center px-8">
          <Layout className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Document Templates</h2>
          <p className="text-sm text-muted-foreground">
            Your document templates will appear here. Use templates to quickly start new documents with predefined structures.
          </p>
        </div>
      </div>
    </div>
  );
}
