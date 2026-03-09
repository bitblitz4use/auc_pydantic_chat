"use client";

import { MilkdownEditor } from "@/components/milkdown/milkdown-editor";
import { PromptsView } from "@/components/prompts-view";
import { TemplatesView } from "@/components/templates-view";
import { SourcesView } from "@/components/sources-view";
import { ChainsView } from "@/components/chains/chains-view";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState, useCallback, useEffect } from "react";
import { FileText, Wand2, Layout, Database, Network } from "lucide-react";

type ContentView = "editor" | "prompts" | "chains" | "templates" | "sources";

const RIGHT_PANEL_VIEW_KEY = "right-panel-view";
const VIEWS: ContentView[] = ["editor", "prompts", "chains", "templates", "sources"];

function getStoredView(): ContentView {
  if (typeof window === "undefined") return "editor";
  try {
    const stored = window.localStorage.getItem(RIGHT_PANEL_VIEW_KEY);
    if (stored && VIEWS.includes(stored as ContentView)) return stored as ContentView;
  } catch {
    // ignore
  }
  return "editor";
}

export function RightPanelContent() {
  const [activeView, setActiveView] = useState<ContentView>("editor");

  useEffect(() => {
    setActiveView(getStoredView());
  }, []);

  const setView = useCallback((view: ContentView) => {
    setActiveView(view);
    try {
      window.localStorage.setItem(RIGHT_PANEL_VIEW_KEY, view);
    } catch {
      // ignore quota / private mode
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <ToolbarButton
          icon={FileText}
          isActive={activeView === "editor"}
          onClick={() => setView("editor")}
          title="Editor"
        />
        <ToolbarButton
          icon={Wand2}
          isActive={activeView === "prompts"}
          onClick={() => setView("prompts")}
          title="Prompts"
        />
        <ToolbarButton
          icon={Network}
          isActive={activeView === "chains"}
          onClick={() => setView("chains")}
          title="Chains"
        />
        <ToolbarButton
          icon={Layout}
          isActive={activeView === "templates"}
          onClick={() => setView("templates")}
          title="Templates"
        />
        <ToolbarButton
          icon={Database}
          isActive={activeView === "sources"}
          onClick={() => setView("sources")}
          title="Sources"
        />
        
        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme toggle (dark / light) */}
        <ThemeToggle />
      </div>

      {/* Content Area with Animation */}
      <div className="flex-1 overflow-hidden relative bg-background">
        <div
          key={activeView}
          className="h-full w-full animate-in fade-in-0 slide-in-from-right-4 duration-300"
        >
          {activeView === "editor" && <MilkdownEditor />}
          {activeView === "prompts" && <PromptsView />}
          {activeView === "chains" && <ChainsView />}
          {activeView === "templates" && <TemplatesView />}
          {activeView === "sources" && <SourcesView />}
        </div>
      </div>
    </div>
  );
}
