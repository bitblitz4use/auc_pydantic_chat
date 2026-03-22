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
import { SimpleChatTransport } from "@/lib/simple-chat-transport";
import { memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useActiveDocument } from "@/hooks/use-active-document";
import { useModelSelection, type ModelInfo } from "@/hooks/use-model-selection";
import { usePromptSelector } from "@/hooks/use-prompt-selector";
import { useSourceSelector } from "@/hooks/use-source-selector";
import { ResourceSelectorDialog } from "@/components/ui/resource-selector-dialog";
import { apiUrl } from "@/lib/config";
import type { StorageObject } from "@/lib/storage";
import type { Source } from "@/lib/storage";
import {
  ContextAssistantJsxPreview,
  ContextWizardProvider,
  type ContextAnswers,
} from "@/components/context-mode-jsx";
import {
  appendNis2NonceLine,
  buildNis2UserMessageText,
  formatNis2UserBubbleDisplay,
  validateNis2Step,
} from "@/lib/nis2-catalog";

export type { ContextAnswers };

function isNis2WizardComplete(draft: ContextAnswers): boolean {
  return [1, 2, 3, 4, 5, 6, 7].every((s) => validateNis2Step(draft, s));
}

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
        {m.providers.map((provider: string) => (
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
  // Use custom hooks
  const modelSelection = useModelSelection();
  const promptSelector = usePromptSelector();
  
  const [webSearch, setWebSearch] = useState<boolean>(false);
  
  // Task mode and active document/source
  const [taskMode, setTaskMode] = useState<TaskMode>("ask");
  const [lastSentTaskMode, setLastSentTaskMode] = useState<TaskMode>("ask");
  const [assistantModeById, setAssistantModeById] = useState<Record<string, TaskMode>>({});
  const activeDocument = useActiveDocument();
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  
  const sourceSelector = useSourceSelector(taskMode, activeSource);
  
  const [isInputActive, setIsInputActive] = useState(false);
  const [contextDraft, setContextDraft] = useState<ContextAnswers>({});
  const [contextActiveStep, setContextActiveStep] = useState(1);
  const contextDraftRef = useRef<ContextAnswers>(contextDraft);
  contextDraftRef.current = contextDraft;
  const contextActiveStepRef = useRef(contextActiveStep);
  contextActiveStepRef.current = contextActiveStep;
  const contextSendNonceRef = useRef(0);

  const transport = useMemo(() => {
    return new SimpleChatTransport({
      api: apiUrl.chat(),
    });
  }, []);
  
  const { messages, sendMessage, status, stop } = useChat({
    transport,
  });

  useEffect(() => {
    if (taskMode !== "context") {
      setContextDraft({});
      setContextActiveStep(1);
    }
  }, [taskMode]);

  const contextBodyBase = useMemo(
    () => ({
      model: modelSelection.selectedModel,
      webSearch,
      taskMode: "context" as const,
    }),
    [modelSelection.selectedModel, webSearch]
  );

  const setSector = useCallback((id: string) => {
    setContextDraft((prev) => ({ ...prev, sector: id }));
  }, []);

  const setEmployees = useCallback((v: number | null) => {
    setContextDraft((prev) => ({ ...prev, employees: v }));
  }, []);

  const setRevenueMio = useCallback((v: number | null) => {
    setContextDraft((prev) => ({ ...prev, revenueMio: v }));
  }, []);

  const setBalanceMio = useCallback((v: number | null) => {
    setContextDraft((prev) => ({ ...prev, balanceMio: v }));
  }, []);

  const setBoolField = useCallback(
    (
      field:
        | "wesentlicheDienste"
        | "kritischeInfrastruktur"
        | "lieferantNis2"
        | "beeinflusstSicherheit"
        | "dienstleistungenEu",
      value: boolean
    ) => {
      setContextDraft((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const toggleDigitale = useCallback((key: string) => {
    setContextDraft((prev) => {
      const cur = new Set(prev.digitaleDienste ?? []);
      if (key === "keine") {
        return { ...prev, digitaleDienste: ["keine"] };
      }
      cur.delete("keine");
      if (cur.has(key)) {
        cur.delete(key);
      } else {
        cur.add(key);
      }
      return { ...prev, digitaleDienste: Array.from(cur) };
    });
  }, []);

  const toggleSonder = useCallback((key: string) => {
    setContextDraft((prev) => {
      const cur = new Set(prev.sonderfaelle ?? []);
      if (key === "keine") {
        return { ...prev, sonderfaelle: ["keine"] };
      }
      cur.delete("keine");
      if (cur.has(key)) {
        cur.delete(key);
      } else {
        cur.add(key);
      }
      return { ...prev, sonderfaelle: Array.from(cur) };
    });
  }, []);

  /** Readable German text + invisible nonce so useChat always issues a new request (avoids dedupe). */
  const sendContextToServer = useCallback(
    (answers: ContextAnswers, submittedStep: number) => {
      contextSendNonceRef.current += 1;
      const nonce = contextSendNonceRef.current;
      const readable = buildNis2UserMessageText(answers, submittedStep);
      const text = appendNis2NonceLine(readable, nonce);
      sendMessage(
        { text },
        { body: { ...contextBodyBase, contextAnswers: answers } }
      );
    },
    [sendMessage, contextBodyBase]
  );

  const sendSelection = useCallback(() => {
    const step = contextActiveStepRef.current;
    const draft = contextDraftRef.current;
    if (step >= 1 && step <= 7) {
      if (!validateNis2Step(draft, step)) return;
    } else if (step === 8) {
      if (!isNis2WizardComplete(draft)) return;
    } else {
      return;
    }
    const submittedStep = Math.min(step, 7);
    setLastSentTaskMode("context");
    sendContextToServer({ ...draft, submittedStep }, submittedStep);
    setContextActiveStep((s) => Math.min(s + 1, 8));
  }, [sendContextToServer, setLastSentTaskMode]);

  const canSubmitStep = useMemo(() => {
    if (contextActiveStep >= 8) {
      return isNis2WizardComplete(contextDraft);
    }
    return validateNis2Step(contextDraft, contextActiveStep);
  }, [contextDraft, contextActiveStep]);

  const contextWizardValue = useMemo(
    () => ({
      activeStep: contextActiveStep,
      canSubmitStep,
      draft: contextDraft,
      sendSelection,
      setBalanceMio,
      setBoolField,
      setEmployees,
      setRevenueMio,
      setSector,
      toggleDigitale,
      toggleSonder,
    }),
    [
      canSubmitStep,
      contextActiveStep,
      contextDraft,
      sendSelection,
      setBalanceMio,
      setBoolField,
      setEmployees,
      setRevenueMio,
      setSector,
      toggleDigitale,
      toggleSonder,
    ]
  );

  // Component that uses the controller to clear text immediately
  const PromptInputWithController = () => {
    const { textInput } = usePromptInputController();

    const handleSubmit = useCallback(
      async (message: PromptInputMessage) => {
        // Context mode: server streams JSX (see server chat route); must use sendMessage so messages populate
        if (taskMode === "context") {
          const isInitialBootstrap = messages.length === 0;
          const step = contextActiveStepRef.current;
          const base = { ...contextDraftRef.current };
          const submittedStepForBody = step >= 8 ? 7 : step;
          const answers: ContextAnswers = isInitialBootstrap
            ? base
            : { ...base, submittedStep: submittedStepForBody };

          if (!isInitialBootstrap) {
            if (step >= 1 && step <= 7) {
              if (!validateNis2Step(answers, step)) return;
            } else if (step >= 8) {
              if (!isNis2WizardComplete(base)) return;
            } else {
              return;
            }
          }

          textInput.clear();
          setLastSentTaskMode(taskMode);
          contextSendNonceRef.current += 1;
          const nonce = contextSendNonceRef.current;
          const userTyped = message.text?.trim() ?? "";

          let text: string;
          if (isInitialBootstrap) {
            text = userTyped
              ? `${userTyped}\n\n${appendNis2NonceLine("NIS-2 · Start", nonce)}`
              : appendNis2NonceLine("NIS-2 · Start", nonce);
          } else if (step >= 8) {
            if (!userTyped) return;
            text = appendNis2NonceLine(userTyped, nonce);
          } else {
            const readable = buildNis2UserMessageText(answers, step);
            text = userTyped
              ? `${userTyped}\n\n${readable}\n\u200b${nonce}`
              : appendNis2NonceLine(readable, nonce);
          }

          sendMessage(
            {
              text,
              files: message.files,
            },
            {
              body: {
                model: modelSelection.selectedModel,
                webSearch,
                taskMode: "context",
                contextAnswers: answers,
              },
            }
          );
          return;
        }

        const hasText = Boolean(message.text);
        const hasAttachments = Boolean(message.files?.length);

        if (!(hasText || hasAttachments)) {
          return;
        }

        textInput.clear();

        // Record the task mode used for this send, so renderer uses the same mode for the streaming response
        setLastSentTaskMode(taskMode);

          sendMessage(
            {
              text: message.text,
              files: message.files,
            },
            {
              body: {
                model: modelSelection.selectedModel,
                webSearch,
                taskMode,
                activeDocument: taskMode === "write" ? activeDocument : undefined,
                activeSource: taskMode === "summarize" ? activeSource : undefined,
              },
            }
          );
        },
        [
          sendMessage,
          textInput,
          modelSelection.selectedModel,
          webSearch,
          taskMode,
          activeDocument,
          activeSource,
          messages,
        ]
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

    // Handle prompt insertion
    const handlePromptInsert = useCallback(
      (content: string) => {
        const currentText = textInput.value;
        const newText = currentText ? `${currentText}\n\n${content}` : content;
        textInput.setInput(newText);
        
        // Focus textarea and set cursor to end after dialog closes
        setTimeout(() => {
          const textarea = document.querySelector(
            'textarea[name="message"]'
          ) as HTMLTextAreaElement | null;
          if (textarea) {
            textarea.focus();
            const length = newText.length;
            textarea.setSelectionRange(length, length);
          }
        }, 100);
      },
      [textInput]
    );

    // Handle source selection
    const handleSourceSelect = useCallback(
      (sourceId: string, sourceName: string) => {
        setActiveSource(sourceId);
        setActiveSourceName(sourceName);
      },
      []
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
            promptSelector.setOpen(true);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [promptSelector]);

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
              {/* Source Citation (when in summarize mode) */}
              {taskMode === "summarize" && activeSourceName && (
                <div className="px-3 pt-2">
                  <DocumentCitation
                    documentName={activeSourceName}
                    onClear={() => {
                      setActiveSource(null);
                      setActiveSourceName(null);
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
                activeSource={activeSource}
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
                onOpenChange={modelSelection.setSelectorOpen}
                open={modelSelection.selectorOpen}
              >
                <ModelSelectorTrigger asChild>
                  <PromptInputButton>
                    {modelSelection.selectedModelData?.chefSlug && (
                      <ModelSelectorLogo provider={modelSelection.selectedModelData.chefSlug} />
                    )}
                    {modelSelection.selectedModelData?.name && (
                      <ModelSelectorName>
                        {modelSelection.selectedModelData.name}
                      </ModelSelectorName>
                    )}
                  </PromptInputButton>
                </ModelSelectorTrigger>
                <ModelSelectorContent>
                  <ModelSelectorInput placeholder="Search models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    {modelSelection.loading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading models...
                      </div>
                    ) : (
                      // Group models by provider (chef)
                      Array.from(new Set(modelSelection.models.map((m) => m.chef))).map((chef) => (
                        <ModelSelectorGroup heading={chef} key={chef}>
                          {modelSelection.models
                            .filter((m) => m.chef === chef)
                            .map((m) => (
                              <ModelItem
                                key={m.id}
                                m={m}
                                onSelect={modelSelection.handleModelSelect}
                                selectedModel={modelSelection.selectedModel}
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
        <ResourceSelectorDialog
          open={promptSelector.open}
          onOpenChange={promptSelector.setOpen}
          title="Select Prompt"
          description="Choose a prompt to insert into your message"
          items={promptSelector.prompts}
          loading={promptSelector.loading}
          onSelect={(prompt) => promptSelector.handlePromptSelect(prompt.name, handlePromptInsert)}
          renderItem={(prompt) => ({
            key: prompt.name,
            label: prompt.name.replace("prompts/", ""),
            icon: <FileText className="size-4" />,
          })}
          searchPlaceholder="Search prompts..."
          emptyText="No prompts found."
          loadingText="Loading prompts..."
          groupHeading="Prompts"
        />

        {/* Source Selector Dialog */}
        <ResourceSelectorDialog
          open={sourceSelector.open}
          onOpenChange={sourceSelector.setOpen}
          title="Select Source"
          description="Choose a source document to summarize"
          items={sourceSelector.sources}
          loading={sourceSelector.loading}
          onSelect={(source) => sourceSelector.handleSourceSelect(source, handleSourceSelect)}
          renderItem={(source) => ({
            key: source.source_id,
            label: source.original_filename || source.source_id,
            icon: <FileText className="size-4" />,
          })}
          searchPlaceholder="Search sources..."
          emptyText="No sources found."
          loadingText="Loading sources..."
          groupHeading="Sources"
        />
      </>
    );
  };

  // Extract assistant/user text — AI SDK v6 UIMessage uses `parts` with { type: 'text', text }
  const getMessageText = (message: any) => {
    if (!message) return "";

    if (Array.isArray(message.parts)) {
      const text = message.parts
        .map((p: any) => {
          if (p?.type === "text" && typeof p.text === "string") return p.text;
          return "";
        })
        .join("");
      if (text) return text;
    }

    if (typeof message.content === "string") return message.content;

    if (Array.isArray(message.content)) {
      const text = message.content
        .map((p: any) => {
          if (typeof p === "string") return p;
          if (p?.type === "text" && typeof p.text === "string") return p.text;
          if (p?.type === "text-delta" && typeof p.delta === "string") return p.delta;
          return "";
        })
        .join("");
      if (text) return text;
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

  // Decide if a given assistant message should be treated as context for rendering,
  // based on the task mode at the time it was sent (to avoid UI-state drift).
  const isContextForMessage = (message: any) =>
    (assistantModeById[message.id] ?? (isLoading && message.id === lastMessage?.id ? lastSentTaskMode : taskMode)) === "context";

  const formatUserBubbleText = (message: any) => {
    const raw = getMessageText(message);
    return formatNis2UserBubbleDisplay(raw);
  };

  const isInteractiveContextMessage = (message: any) =>
    isContextForMessage(message) &&
    message.id === lastMessage?.id &&
    !isLoading;

  const handleContextJsxError = useCallback((error: Error) => {
    console.error("JSX Parse Error:", error);
  }, []);

  // Persist the mode used for the latest assistant message so it keeps rendering consistently after streaming
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.id && !assistantModeById[last.id]) {
      setAssistantModeById((prev) => ({
        ...prev,
        [last.id]: lastSentTaskMode,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, lastSentTaskMode]);

  return (
    <ContextWizardProvider value={contextWizardValue}>
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
                          <p>{formatUserBubbleText(message)}</p>
                        ) : isContextForMessage(message) ? (
                          (() => {
                            const raw = getMessageText(message).trim();
                            const isJsxCard = raw.startsWith("<");
                            if (isJsxCard) {
                              return (
                                <div className="size-full min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                  <ContextAssistantJsxPreview
                                    jsxText={raw || "<div />"}
                                    interactive={isInteractiveContextMessage(message)}
                                    isStreaming={
                                      (status === "submitted" || status === "streaming") &&
                                      message.id === lastMessage?.id
                                    }
                                    onError={handleContextJsxError}
                                  />
                                </div>
                              );
                            }
                            return (
                              <MessageResponse>{getMessageText(message)}</MessageResponse>
                            );
                          })()
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
    </ContextWizardProvider>
  );
}
