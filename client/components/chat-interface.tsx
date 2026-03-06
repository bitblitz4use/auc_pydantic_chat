"use client";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { FileUIPart } from "ai";

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
import { TaskModeSelector, type TaskMode } from "@/components/ai-elements/task-mode-selector";
import { DocumentCitation } from "@/components/ai-elements/document-citation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useChat } from "@ai-sdk/react";
import { CheckIcon, GlobeIcon, FileText } from "lucide-react";
import { CustomChatTransport } from "@/lib/custom-chat-transport";
import { memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { listStorageObjects, getFileContent, type StorageObject } from "@/lib/storage";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useActiveDocument } from "@/hooks/use-active-document";

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
    name: "gpt-oss:20b",
    providers: ["ollama"],
  },
];

interface AttachmentItemProps {
  attachment: FileUIPart & { id: string };
  onRemove: (id: string) => void;
}

const AttachmentItem = memo(({ attachment, onRemove }: AttachmentItemProps) => {
  return (
    <Attachment data={attachment} key={attachment.id} onRemove={() => onRemove(attachment.id)}>
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
  return (
    <ModelSelectorItem key={m.id} onSelect={() => onSelect(m.id)} value={m.id}>
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

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={(id) => attachments.remove(id)}
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
  
  // Task mode and active document
  const [taskMode, setTaskMode] = useState<TaskMode>("ask");
  const activeDocument = useActiveDocument();
  
  // Prompt selector state
  const [promptSelectorOpen, setPromptSelectorOpen] = useState(false);
  const [prompts, setPrompts] = useState<StorageObject[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [isInputActive, setIsInputActive] = useState(false);
  
  // Create transport - headers will be set dynamically on each request
  const transport = useMemo(() => {
    return new CustomChatTransport({
      api: "http://localhost:8000/api/chat",
    });
  }, []); // Only create once, headers updated per request
  
  // Update transport headers when model, task mode, or document changes
  useEffect(() => {
    const headers: Record<string, string> = {
      "X-Model-ID": model,
      "X-Task-Mode": taskMode,
    };
    
    if (taskMode === "write" && activeDocument) {
      headers["X-Active-Document"] = activeDocument;
    }
    
    transport.setHeaders(headers);
  }, [model, taskMode, activeDocument, transport]);
  
  const { messages, sendMessage, status, stop } = useChat({
    transport,
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

  // Fetch prompts when selector opens
  useEffect(() => {
    if (promptSelectorOpen) {
      const fetchPrompts = async () => {
        try {
          setPromptsLoading(true);
          const files = await listStorageObjects("prompts", false);
          setPrompts(files);
        } catch (error) {
          console.error("Error fetching prompts:", error);
        } finally {
          setPromptsLoading(false);
        }
      };
      fetchPrompts();
    }
  }, [promptSelectorOpen]);

  const selectedModelData = models.find((m) => m.id === model);

  const handleModelSelect = (id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  };

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

        // Update headers synchronously right before sending to ensure they're current
        const headers: Record<string, string> = {
          "X-Model-ID": model,
          "X-Task-Mode": taskMode,
        };
        
        if (taskMode === "write" && activeDocument) {
          headers["X-Active-Document"] = activeDocument;
        }
        
        transport.setHeaders(headers);

        // Send model selection in request body
        // eslint-disable-next-line no-console
        console.log("Submitting with model:", model, "taskMode:", taskMode, "activeDocument:", activeDocument);
        console.log("Headers being sent:", headers);

        // Don't await - let it run async, text is already cleared
        sendMessage({
          text: message.text,
          files: message.files,
          // @ts-expect-error - body is supported by our custom transport
          body: { 
            model: model,
            webSearch: webSearch 
          },
        });
      },
      [sendMessage, model, webSearch, taskMode, activeDocument, textInput, transport]
    );

    const handleStop = () => {
      stop();
    };

    // Handlers for focus state
    const handleTextareaFocus = () => {
      setIsInputActive(true);
    };

    const handleTextareaBlur = () => {
      setIsInputActive(false);
    };

    // Handle prompt selection
    const handlePromptSelect = useCallback(
      async (promptName: string) => {
        try {
          const content = await getFileContent(promptName);
          // Append to existing text if any, otherwise set it
          const currentText = textInput.value;
          const newText = currentText ? `${currentText}\n\n${content}` : content;
          textInput.setInput(newText);
          setPromptSelectorOpen(false);
          
          // Focus textarea and set cursor to end after dialog closes
          // Use setTimeout to ensure DOM has updated after dialog closes
          setTimeout(() => {
            // Find the textarea by name attribute (name="message")
            const textarea = document.querySelector(
              'textarea[name="message"]'
            ) as HTMLTextAreaElement | null;
            if (textarea) {
              textarea.focus();
              // Set cursor to end of text
              const length = newText.length;
              textarea.setSelectionRange(length, length);
            }
          }, 100);
        } catch (error) {
          console.error("Error loading prompt:", error);
        }
      },
      [textInput]
    );

    // Keyboard shortcut handler - only when textarea is focused
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check if Shift+P is pressed and textarea is focused
        if (e.shiftKey && e.key === "P" && !e.ctrlKey && !e.metaKey) {
          const activeElement = document.activeElement;
          // Check if the active element is the textarea or inside the prompt input form
          if (
            activeElement?.tagName === "TEXTAREA" ||
            activeElement?.closest('form[class*="w-full"]')
          ) {
            e.preventDefault();
            setPromptSelectorOpen(true);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
      <>
        <PromptInput globalDrop multiple onSubmit={handleSubmit}>
          <PromptInputAttachmentsDisplay />
          <PromptInputBody>
            <div className="flex flex-col w-full">
              {/* Document Citation (when in write mode) - above textarea */}
              {taskMode === "write" && activeDocument && (
                <div className="px-3 pt-2">
                  <DocumentCitation
                    documentName={activeDocument}
                    onClear={() => {
                      // Just switch to ask mode, don't clear the document
                      setTaskMode("ask");
                    }}
                  />
                </div>
              )}
              <PromptInputTextarea 
                placeholder="Type your message..."
                onFocus={handleTextareaFocus}
                onBlur={handleTextareaBlur}
              />
            </div>
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <TaskModeSelector
                mode={taskMode}
                onModeChange={setTaskMode}
                activeDocument={activeDocument}
              />
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

        {/* Prompt Selector Dialog */}
        <CommandDialog
          open={promptSelectorOpen}
          onOpenChange={setPromptSelectorOpen}
          title="Select Prompt"
          description="Choose a prompt to insert into your message"
        >
          <CommandInput placeholder="Search prompts..." />
          <CommandList>
            <CommandEmpty>
              {promptsLoading ? "Loading prompts..." : "No prompts found."}
            </CommandEmpty>
            {!promptsLoading && prompts.length > 0 && (
              <CommandGroup heading="Prompts">
                {prompts.map((prompt) => {
                  const fileName = prompt.name.replace("prompts/", "");
                  return (
                    <CommandItem
                      key={prompt.name}
                      onSelect={() => handlePromptSelect(prompt.name)}
                    >
                      <FileText className="size-4" />
                      <span>{fileName}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      </>
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
  // Show loading if: no messages yet, last message is from user, or assistant message is empty (still streaming)
  const showLoadingIndicator = isLoading && (
    !lastMessage || 
    lastMessage.role === "user" || 
    (lastMessage.role === "assistant" && !getMessageText(lastMessage))
  );

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
        <div className="rounded-b-lg border border-t-0 border-border bg-card p-4 relative">
          {/* Keyboard Shortcut Indicator - Positioned above input, left aligned */}
          <div className="absolute -top-4 left-4 z-10 pointer-events-none">
            <div className={`transition-opacity duration-200 ${isInputActive ? "opacity-100" : "opacity-30"}`}>
              <KbdGroup>
                <Kbd className={isInputActive ? "" : "opacity-50"}>Shift</Kbd>
                <Kbd className={isInputActive ? "" : "opacity-50"}>P</Kbd>
              </KbdGroup>
            </div>
          </div>
          
          <PromptInputProvider>
            <PromptInputWithController />
          </PromptInputProvider>
        </div>
      </div>
    </div>
  );
}
