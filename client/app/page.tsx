"use client";

import dynamic from "next/dynamic";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

const MainLayout = dynamic(
  () => import("@/components/main-layout").then((m) => m.MainLayout),
  { ssr: false }
);

export default function Home() {
  return (
    <PromptInputProvider>
      <div className="h-screen bg-background">
        <MainLayout />
      </div>
    </PromptInputProvider>
  );
}
