"use client";

import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputButton, PromptInputProvider, usePromptInputController } from "@/components/ai-elements/prompt-input";
import { useChat } from "@ai-sdk/react";
import { useCallback } from "react";

function ChatInterface() {
  const { messages, append, isLoading } = useChat({
    api: "http://localhost:8000/api/chat",
  });
  const controller = usePromptInputController();

  const handleSubmit = useCallback(async (data: { text: string; files?: any[] }) => {
    if (!data.text.trim() || isLoading) return;

    controller.textInput.clear();
    await append({
      role: "user",
      content: data.text,
    });
  }, [append, isLoading, controller]);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Conversation Area */}
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Ask me anything!"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.role === "user" ? (
                    <p>{message.content}</p>
                  ) : (
                    <MessageResponse>{message.content}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
      </Conversation>

      {/* Input Area */}
      <div className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={controller.textInput.value}
            onChange={(e) => controller.textInput.setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <PromptInputButton disabled={isLoading || !controller.textInput.value.trim()}>
            Send
          </PromptInputButton>
        </PromptInput>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <PromptInputProvider>
      <ChatInterface />
    </PromptInputProvider>
  );
}
