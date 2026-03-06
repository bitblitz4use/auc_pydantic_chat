"use client";

import { Wand2 } from "lucide-react";

export function PromptsView() {
  return (
    <div className="h-full overflow-hidden px-4 pt-4 pb-4">
      <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border">
        <div className="max-w-md space-y-4 text-center px-8">
          <Wand2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Prompts Library</h2>
          <p className="text-sm text-muted-foreground">
            Your saved prompts will appear here. Create and manage reusable prompts for your AI conversations.
          </p>
        </div>
      </div>
    </div>
  );
}
