"use client";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { memo, useCallback, useState, useEffect } from "react";

interface ModelInfo {
  id: string;
  name: string;
  chef: string;
  chefSlug: string;
  providers: string[];
}

// Default models for initial state (will be replaced by API fetch)
const defaultModels: ModelInfo[] = [
  {
    chef: "Ollama",
    chefSlug: "ollama",
    id: "ollama:gpt-oss:20b",
    name: "Gpt Oss 20b",
    providers: ["ollama"],
  },
];

interface AttachmentItemProps {
  attachment: {
    id: string;
    type: "file";
    filename?: string;
    mediaType?: string;
    url: string;
  };
  onRemove: (id: string) => void;
}

const AttachmentItem = memo(({ attachment, onRemove }: AttachmentItemProps) => {
  const handleRemove = useCallback(
    () => onRemove(attachment.id),
    [onRemove, attachment.id]
  );
  return (
    <Attachment data={attachment} key={attachment.id} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
});

AttachmentItem.displayName = "AttachmentItem";

interface ModelItemProps {
  m: ModelInfo;
  selectedModel: string;
  onSelect: (id: string) => void;
}

const ModelItem = memo(({ m, selectedModel, onSelect }: ModelItemProps) => {
  const handleSelect = useCallback(() => onSelect(m.id), [onSelect, m.id]);
  return (
    <ModelSelectorItem key={m.id} onSelect={handleSelect} value={m.id}>
      <ModelSelectorLogo provider={m.chefSlug} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {selectedModel === m.id ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
});

ModelItem.displayName = "ModelItem";

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => attachments.remove(id),
    [attachments]
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  );
};

export function ChatInterface() {
  const [models, setModels] = useState<ModelInfo[]>(defaultModels);
  const [modelsLoading, setModelsLoading] = useState(true);
  
  // Initialize model with safe fallback - use defaultModels directly
  const initialModel = defaultModels.length > 0 
    ? defaultModels[0].id 
    : "ollama:gpt-oss:20b";
  
  const [model, setModel] = useState<string>(initialModel);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [webSearch, setWebSearch] = useState<boolean>(false);
  
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "http://localhost:8000/api/chat",
    }),
  });

  // Fetch available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/providers");
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || defaultModels);
          if (data.models && data.models.length > 0) {
            setModel(data.models[0].id);
          }
        } else {
          console.error("Failed to fetch models:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching models:", error);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, []);

  const selectedModelData = models.find((m) => m.id === model);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  }, []);

  // Component that uses the controller to clear text immediately
  const PromptInputWithController = () => {
    const { textInput } = usePromptInputController();

    const handleSubmit = useCallback(
      async (message: PromptInputMessage) => {
        const hasText = Boolean(message.text);
        const hasAttachments = Boolean(message.files?.length);

        if (!(hasText || hasAttachments)) {
          return;
        }

        // Clear text immediately after submission
        textInput.clear();

        // Send model selection in request body
        // eslint-disable-next-line no-console
        console.log("Submitting with model:", model, "webSearch:", webSearch);

        // Don't await - let it run async, text is already cleared
        sendMessage({
          text: message.text,
          body: { 
            model: model,
            webSearch: webSearch 
          }
        });
      },
      [sendMessage, model, webSearch, textInput]
    );

    const handleStop = useCallback(() => {
      stop();
    }, [stop]);

    return (
      <PromptInput globalDrop multiple onSubmit={handleSubmit}>
        <PromptInputAttachmentsDisplay />
        <PromptInputBody>
          <PromptInputTextarea placeholder="Type your message..." />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <PromptInputButton
              onClick={() => setWebSearch(!webSearch)}
              variant={webSearch ? "default" : "ghost"}
            >
              <GlobeIcon size={16} />
              <span>Search</span>
            </PromptInputButton>
            <ModelSelector
              onOpenChange={setModelSelectorOpen}
              open={modelSelectorOpen}
            >
              <ModelSelectorTrigger asChild>
                <PromptInputButton>
                  {selectedModelData?.chefSlug && (
                    <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                  )}
                  {selectedModelData?.name && (
                    <ModelSelectorName>
                      {selectedModelData.name}
                    </ModelSelectorName>
                  )}
                </PromptInputButton>
              </ModelSelectorTrigger>
              <ModelSelectorContent>
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                  {modelsLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Loading models...
                    </div>
                  ) : (
                    // Group models by provider (chef)
                    Array.from(new Set(models.map((m) => m.chef))).map((chef) => (
                      <ModelSelectorGroup heading={chef} key={chef}>
                        {models
                          .filter((m) => m.chef === chef)
                          .map((m) => (
                            <ModelItem
                              key={m.id}
                              m={m}
                              onSelect={handleModelSelect}
                              selectedModel={model}
                            />
                          ))}
                      </ModelSelectorGroup>
                    ))
                  )}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>
          <PromptInputSubmit status={status} onStop={handleStop} />
        </PromptInputFooter>
      </PromptInput>
    );
  };

  // Helper function to extract text content from message (handles both old and new formats)
  const getMessageText = (message: any) => {
    if (message.content) return message.content;
    if (message.parts) {
      const textPart = message.parts.find((p: any) => p.type === "text");
      return textPart?.text || "";
    }
    return "";
  };

  // Check if we should show loading indicator
  const isLoading = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const showLoadingIndicator = isLoading && (!lastMessage || lastMessage.role === "user");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Scrollable Messages Area */}
      <div className="flex-1 overflow-hidden p-4 pb-0">
        <div className="h-full overflow-hidden rounded-t-lg border border-b-0 border-border bg-card">
          <Conversation className="conversation-scrollbar h-full">
            <ConversationContent>
              {messages.length === 0 && !showLoadingIndicator ? (
                <ConversationEmptyState
                  title="Start a conversation"
                  description="Ask me anything!"
                />
              ) : (
                <>
                  {messages.map((message) => (
                    <Message key={message.id} from={message.role}>
                      <MessageContent>
                        {message.role === "user" ? (
                          <p>{getMessageText(message)}</p>
                        ) : (
                          <MessageResponse>{getMessageText(message)}</MessageResponse>
                        )}
                      </MessageContent>
                    </Message>
                  ))}
                  {showLoadingIndicator && (
                    <Message from="assistant">
                      <MessageContent>
                        <Shimmer>Thinking...</Shimmer>
                      </MessageContent>
                    </Message>
                  )}
                </>
              )}
            </ConversationContent>
          </Conversation>
        </div>
      </div>

      {/* Fixed Prompt Input at Bottom */}
      <div className="px-4 pb-4">
        <div className="rounded-b-lg border border-t-0 border-border bg-card p-4">
          <PromptInputProvider>
            <PromptInputWithController />
          </PromptInputProvider>
        </div>
      </div>
    </div>
  );
}
