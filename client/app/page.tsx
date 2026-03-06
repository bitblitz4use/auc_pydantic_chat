"use client";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ChatInterface } from "@/components/chat-interface";
import { MilkdownEditor } from "@/components/milkdown/milkdown-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Settings } from "lucide-react";

export default function Home() {
  return (
    <PromptInputProvider>
      <div className="h-screen bg-black">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50} minSize={30}>
            <ChatInterface />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col">
            {/* Placeholder Toolbar - Fixed position */}
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              <button
                className="flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                title="Placeholder"
              >
                <Settings size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MilkdownEditor />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </PromptInputProvider>
  );
}
