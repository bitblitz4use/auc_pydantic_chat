"use client";

import { MilkdownEditor } from "@/components/milkdown/milkdown-editor";
import { PromptsView } from "@/components/prompts-view";
import { TemplatesView } from "@/components/templates-view";
import { SourcesView } from "@/components/sources-view";
import { useState } from "react";
import { Settings, FileText, Wand2, Layout, Database } from "lucide-react";

type ContentView = "editor" | "prompts" | "templates" | "sources";

export function RightPanelContent() {
  const [activeView, setActiveView] = useState<ContentView>("editor");

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
            activeView === "editor"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
          }`}
          title="Editor"
          onClick={() => setActiveView("editor")}
        >
          <FileText size={20} />
        </button>
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
            activeView === "prompts"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
          }`}
          title="Prompts"
          onClick={() => setActiveView("prompts")}
        >
          <Wand2 size={20} />
        </button>
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
            activeView === "templates"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
          }`}
          title="Templates"
          onClick={() => setActiveView("templates")}
        >
          <Layout size={20} />
        </button>
        <button
          className={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
            activeView === "sources"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
          }`}
          title="Sources"
          onClick={() => setActiveView("sources")}
        >
          <Database size={20} />
        </button>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Settings button */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 hover:bg-accent/50 hover:text-accent-foreground text-muted-foreground"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Content Area with Animation */}
      <div className="flex-1 overflow-hidden relative">
        <div
          key={activeView}
          className="h-full w-full animate-in fade-in-0 slide-in-from-right-4 duration-300"
        >
          {activeView === "editor" && <MilkdownEditor />}
          {activeView === "prompts" && <PromptsView />}
          {activeView === "templates" && <TemplatesView />}
          {activeView === "sources" && <SourcesView />}
        </div>
      </div>
    </div>
  );
}
