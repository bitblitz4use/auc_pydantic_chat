"use client";

import { useDefaultLayout } from "react-resizable-panels";
import { ChatInterface } from "@/components/chat-interface";
import { RightPanelContent } from "@/components/right-panel-content";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const LAYOUT_STORAGE_KEY = "main-layout";

export function MainLayout() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: LAYOUT_STORAGE_KEY,
    storage: window.localStorage,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={LAYOUT_STORAGE_KEY}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="chat" defaultSize={50} minSize={30}>
        <ChatInterface />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="right-panel" defaultSize={50} minSize={30}>
        <RightPanelContent />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
