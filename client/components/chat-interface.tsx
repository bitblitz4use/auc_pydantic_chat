"use client";

import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputButton, usePromptInputController } from "@/components/ai-elements/prompt-input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback } from "react";

export function ChatInterface() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "http://localhost:8000/api/chat",
    }),
  });
  const controller = usePromptInputController();
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(async (data: { text: string; files?: any[] }) => {
    if (!data.text.trim() || isLoading) return;

    controller.textInput.clear();
    await sendMessage({
      text: data.text,
    });
  }, [sendMessage, isLoading, controller]);

  // Helper function to extract text content from message (handles both old and new formats)
  const getMessageText = (message: any) => {
    if (message.content) return message.content;
    if (message.parts) {
      const textPart = message.parts.find((p: any) => p.type === "text");
      return textPart?.text || "";
    }
    return "";
  };

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <div className="mx-auto flex w-full flex-1 flex-col">
        <div className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <Conversation className="flex-1 overflow-auto">
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
                        <p>{getMessageText(message)}</p>
                      ) : (
                        <MessageResponse>{getMessageText(message)}</MessageResponse>
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
          </Conversation>
          <div className="border-t border-border bg-card p-4">
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
      </div>
    </div>
  );
}
