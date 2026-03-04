"use client";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ChatInterface } from "@/components/chat-interface";
import { MilkdownEditor } from "@/components/milkdown-editor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function Home() {
  return (
    <PromptInputProvider>
      <div className="h-screen bg-black">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50} minSize={30}>
            <ChatInterface />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <MilkdownEditor />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </PromptInputProvider>
  );
}
