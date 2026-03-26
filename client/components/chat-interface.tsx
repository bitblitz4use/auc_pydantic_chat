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
import { CheckIcon, GlobeIcon, FileText, Pause, Play, Activity, Square } from "lucide-react";
import { SimpleChatTransport } from "@/lib/simple-chat-transport";
import { memo, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useActiveDocument } from "@/hooks/use-active-document";
import { useModelSelection, type ModelInfo } from "@/hooks/use-model-selection";
import { usePromptSelector } from "@/hooks/use-prompt-selector";
import { useSourceSelector } from "@/hooks/use-source-selector";
import { ResourceSelectorDialog } from "@/components/ui/resource-selector-dialog";
import { apiUrl } from "@/lib/config";
import {
  ContextAssistantJsxPreview,
  type ContextAssistSubmission,
  type QuestionPayload,
  ContextQuestionRuntimeProvider,
  type ContextAnswerSubmission,
  tryDecodeCtxQuestionPayloadFromJsx,
} from "@/components/context-question-jsx";

const CONTEXT_RUNTIME_STORAGE_KEY = "auc.context.runtime.v1";

type PersistedContextRuntime = {
  sessionId?: string;
  standardKeys?: string[];
  conversationId?: string;
};

type ContextInteractionMode = "active" | "paused" | "stopped";

function createClientConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const [contextSessionId, setContextSessionId] = useState<string | null>(null);
  const [contextStandardKeys, setContextStandardKeys] = useState<string[]>([]);
  const [contextConversationId, setContextConversationId] = useState<string | null>(null);
  const [contextInteractionMode, setContextInteractionMode] = useState<ContextInteractionMode>("active");
  const contextSendNonceRef = useRef(0);
  const contextAutoResumeKeyRef = useRef<string | null>(null);

  const transport = useMemo(() => {
    return new SimpleChatTransport({
      api: apiUrl.chat(),
    });
  }, []);
  
  const { messages, sendMessage, status, stop } = useChat({
    transport,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONTEXT_RUNTIME_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedContextRuntime;
      if (typeof parsed.sessionId === "string" && parsed.sessionId.trim()) {
        setContextSessionId(parsed.sessionId.trim());
      }
      if (Array.isArray(parsed.standardKeys)) {
        setContextStandardKeys(
          parsed.standardKeys
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
        );
      }
      if (typeof parsed.conversationId === "string" && parsed.conversationId.trim()) {
        setContextConversationId(parsed.conversationId.trim());
      }
    } catch {
      // Ignore malformed persisted state.
    }
  }, []);

  useEffect(() => {
    const payload: PersistedContextRuntime = {
      sessionId: contextSessionId ?? undefined,
      standardKeys: contextStandardKeys.length > 0 ? contextStandardKeys : undefined,
      conversationId: contextConversationId ?? undefined,
    };
    const hasData = Boolean(payload.sessionId || payload.conversationId || payload.standardKeys?.length);
    try {
      if (!hasData) {
        window.localStorage.removeItem(CONTEXT_RUNTIME_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(CONTEXT_RUNTIME_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [contextSessionId, contextStandardKeys, contextConversationId]);

  const ensureContextConversationId = useCallback((): string => {
    if (contextConversationId && contextConversationId.trim()) {
      return contextConversationId;
    }
    const created = createClientConversationId();
    setContextConversationId(created);
    return created;
  }, [contextConversationId]);

  const contextBodyBase = useMemo(
    () => ({
      model: modelSelection.selectedModel,
      webSearch,
      taskMode: "context" as const,
    }),
    [modelSelection.selectedModel, webSearch]
  );

  const withContextNonce = useCallback((text: string) => {
    contextSendNonceRef.current += 1;
    return `${text}\n\u200bctx-${contextSendNonceRef.current}`;
  }, []);

  useEffect(() => {
    if (taskMode !== "context") {
      contextAutoResumeKeyRef.current = null;
      return;
    }
    if (!contextSessionId) {
      return;
    }
    if (status === "submitted" || status === "streaming") {
      return;
    }
    if (messages.length > 0) {
      return;
    }

    const conversationId = ensureContextConversationId();
    const resumeKey = `${contextSessionId}::${conversationId}`;
    if (contextAutoResumeKeyRef.current === resumeKey) {
      return;
    }
    contextAutoResumeKeyRef.current = resumeKey;
    setLastSentTaskMode("context");

    sendMessage(
      { text: withContextNonce("Compliance context resume") },
      {
        body: {
          ...contextBodyBase,
          conversationId,
          contextSession: {
            session_id: contextSessionId,
            standard_keys: contextStandardKeys.length > 0 ? contextStandardKeys : undefined,
          },
        },
      }
    );
  }, [
    taskMode,
    contextSessionId,
    contextStandardKeys,
    contextBodyBase,
    ensureContextConversationId,
    messages.length,
    sendMessage,
    status,
    withContextNonce,
  ]);

  const formatContextAnswerValue = useCallback(
    (value: ContextAnswerSubmission["value"]): string => {
      if (typeof value === "boolean") {
        return value ? "Ja" : "Nein";
      }
      if (Array.isArray(value)) {
        return value.join(" · ");
      }
      if (typeof value === "object" && value !== null) {
        const filename = String((value as Record<string, unknown>).filename || "").trim();
        const status = String((value as Record<string, unknown>).ingest_status || "").trim();
        return filename ? `${filename} (${status || "queued"})` : `Upload (${status || "queued"})`;
      }
      return String(value);
    },
    []
  );

  const submitContextAnswer = useCallback(
    (submission: ContextAnswerSubmission) => {
      const conversationId = ensureContextConversationId();
      setContextSessionId(submission.sessionId);
      if (submission.standardKeys.length > 0) {
        setContextStandardKeys(submission.standardKeys);
      }
      setLastSentTaskMode("context");

      const text = withContextNonce(
        `${submission.questionKey}: ${formatContextAnswerValue(submission.value)}`
      );
      sendMessage(
        { text },
        {
          body: {
            ...contextBodyBase,
            conversationId,
            contextSession: {
              session_id: submission.sessionId,
              standard_keys:
                submission.standardKeys.length > 0
                  ? submission.standardKeys
                  : contextStandardKeys.length > 0
                    ? contextStandardKeys
                    : undefined,
              answer: {
                question_key: submission.questionKey,
                value: submission.value,
                manual_rationale: submission.manualRationale,
                manual_evidence_text: submission.manualEvidenceText,
              },
            },
          },
        }
      );
    },
    [
      contextBodyBase,
      contextStandardKeys,
      ensureContextConversationId,
      formatContextAnswerValue,
      sendMessage,
      withContextNonce,
    ]
  );

  const requestContextAssist = useCallback(
    async (
      submission: ContextAssistSubmission
    ): Promise<{ payload: QuestionPayload | null; note: string }> => {
      const conversationId = ensureContextConversationId();
      setContextSessionId(submission.sessionId);
      if (submission.standardKeys.length > 0) {
        setContextStandardKeys(submission.standardKeys);
      }
      try {
        const response = await fetch(apiUrl.chatContextAssist(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...contextBodyBase,
            conversationId,
            contextSession: {
              session_id: submission.sessionId,
              standard_keys:
                submission.standardKeys.length > 0
                  ? submission.standardKeys
                  : contextStandardKeys.length > 0
                    ? contextStandardKeys
                    : undefined,
              assist: {
                question_key: submission.questionKey,
                tool: submission.tool,
                value: submission.value,
              },
            },
          }),
        });
        const data = (await response.json()) as { kind?: string; payload?: string };
        if (!response.ok) {
          return {
            payload: null,
            note: data?.payload || "Assist-Aktion fehlgeschlagen. Bitte erneut versuchen.",
          };
        }
        if (!data?.payload) {
          return {
            payload: null,
            note: "Assist-Aktion lieferte keine Daten.",
          };
        }
        if (data.kind === "text") {
          return {
            payload: null,
            note: data.payload,
          };
        }
        if (data.kind !== "jsx") {
          return {
            payload: null,
            note: "Assist-Antwortformat ist ungültig.",
          };
        }
        return {
          payload: tryDecodeCtxQuestionPayloadFromJsx(data.payload),
          note: "",
        };
      } catch {
        return {
          payload: null,
          note: "Assist-Aktion konnte nicht ausgeführt werden (Netzwerkfehler).",
        };
      }
    },
    [contextBodyBase, contextStandardKeys, ensureContextConversationId]
  );

  const uploadContextDocument = useCallback(
    async (submission: {
      sessionId: string;
      file: File;
    }): Promise<{
      context_document_id: string;
      ingest_status: string;
      filename?: string;
      ingest_job_id?: string;
    } | null> => {
      try {
        const formData = new FormData();
        formData.append("file", submission.file);
        formData.append("session_id", submission.sessionId);
        const response = await fetch(apiUrl.contextDocumentUpload(), {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          return null;
        }
        const contextDocumentId = String(data.context_document_id || "").trim();
        if (!contextDocumentId) {
          return null;
        }
        return {
          context_document_id: contextDocumentId,
          ingest_status: String(data.status || data.ingest_status || "queued"),
          filename: String(data.filename || submission.file.name || ""),
          ingest_job_id: String(data.ingest_job_id || ""),
        };
      } catch {
        return null;
      }
    },
    []
  );

  const getContextDocumentStatus = useCallback(
    async (
      contextDocumentId: string
    ): Promise<{
      context_document_id: string;
      ingest_status: string;
      filename?: string;
      ingest_job_id?: string;
    } | null> => {
      try {
        const response = await fetch(apiUrl.contextDocumentStatus(contextDocumentId), {
          method: "GET",
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          return null;
        }
        return {
          context_document_id: String(data.context_document_id || contextDocumentId),
          ingest_status: String(data.ingest_status || "unknown"),
          filename: String(data.filename || ""),
          ingest_job_id: String(data.ingest_job_id || ""),
        };
      } catch {
        return null;
      }
    },
    []
  );

  const runContextChallenge = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(apiUrl.contextChallengeRun(sessionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelSelection.selectedModel,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [modelSelection.selectedModel]);

  const runQuestionChallenge = useCallback(
    async (submission: {
      sessionId: string;
      questionKey: string;
    }): Promise<{
      status: string;
      summary: string;
      document_title: string;
      ru_results: Array<{
        ru_key: string;
        challenge_state: string;
        auto_state: string;
        result_state?: string;
        confidence: number;
        rationale: string;
        citations: string[];
        chunks: Array<{
          chunk_key: string;
          document_title: string;
          page_no: string;
          heading_path: string;
          source_ref: string;
          score: number;
          method: string;
        }>;
      }>;
    } | null> => {
      try {
        const response = await fetch(apiUrl.contextQuestionChallengeRun(submission.sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_key: submission.questionKey,
            model_id: modelSelection.selectedModel,
          }),
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          return null;
        }
        const rows = Array.isArray(data.ru_results) ? data.ru_results : [];
        return {
          status: String(data.status || "completed"),
          summary: String(data.summary || ""),
          document_title: String(data.document_title || ""),
          ru_results: rows.map((item) => {
            const row = item as Record<string, unknown>;
            const chunks = Array.isArray(row.chunks) ? row.chunks : [];
            return {
              ru_key: String(row.ru_key || ""),
              challenge_state: String(row.challenge_state || "insufficient_evidence"),
              auto_state: String(row.auto_state || "unclear"),
              result_state: String(row.result_state || row.auto_state || "unclear"),
              confidence: Number(row.confidence || 0),
              rationale: String(row.rationale || ""),
              citations: Array.isArray(row.citations) ? row.citations.map((c) => String(c)) : [],
              chunks: chunks.map((chunk) => {
                const c = chunk as Record<string, unknown>;
                return {
                  chunk_key: String(c.chunk_key || ""),
                  document_title: String(c.document_title || ""),
                  page_no: String(c.page_no || ""),
                  heading_path: String(c.heading_path || ""),
                  source_ref: String(c.source_ref || ""),
                  score: Number(c.score || 0),
                  method: String(c.method || ""),
                };
              }),
            };
          }),
        };
      } catch {
        return null;
      }
    },
    [modelSelection.selectedModel]
  );

  const continueContextSession = useCallback(
    (sessionId: string) => {
      const conversationId = ensureContextConversationId();
      setContextSessionId(sessionId);
      setLastSentTaskMode("context");
      sendMessage(
        { text: withContextNonce("Compliance context resume") },
        {
          body: {
            ...contextBodyBase,
            conversationId,
            contextSession: {
              session_id: sessionId,
              standard_keys: contextStandardKeys.length > 0 ? contextStandardKeys : undefined,
            },
          },
        }
      );
    },
    [
      contextBodyBase,
      contextStandardKeys,
      ensureContextConversationId,
      sendMessage,
      withContextNonce,
    ]
  );

  const getContextChallengeStatus = useCallback(
    async (
      sessionId: string
    ): Promise<{
      challenge_job_id: string;
      status: string;
      requirements_total: number;
      processed: number;
      failed: number;
      duration_ms: number;
      baseline_confirmed_run: boolean;
    } | null> => {
      try {
        const response = await fetch(apiUrl.contextChallengeStatus(sessionId), {
          method: "GET",
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          return null;
        }
        return {
          challenge_job_id: String(data.challenge_job_id || ""),
          status: String(data.status || "idle"),
          requirements_total: Number(data.requirements_total || 0),
          processed: Number(data.processed || 0),
          failed: Number(data.failed || 0),
          duration_ms: Number(data.duration_ms || 0),
          baseline_confirmed_run: Boolean(data.baseline_confirmed_run),
        };
      } catch {
        return null;
      }
    },
    []
  );

  const submitContextControl = useCallback(
    (
      action: "pause" | "resume" | "stop" | "status",
      options?: { reason?: string; confirm?: boolean }
    ) => {
      const conversationId = ensureContextConversationId();
      setLastSentTaskMode("context");
      if (action === "pause") setContextInteractionMode("paused");
      if (action === "resume") setContextInteractionMode("active");
      if (action === "stop") setContextInteractionMode("stopped");
      const label =
        action === "pause"
          ? "Pause questionnaire"
          : action === "resume"
            ? "Resume questionnaire"
            : action === "stop"
              ? "Stop questionnaire"
              : "Questionnaire status";
      sendMessage(
        { text: withContextNonce(label) },
        {
          body: {
            ...contextBodyBase,
            conversationId,
            contextSession: {
              session_id: contextSessionId ?? undefined,
              standard_keys: contextStandardKeys.length > 0 ? contextStandardKeys : undefined,
              control: {
                action,
                reason: options?.reason,
                confirm: options?.confirm,
              },
            },
          },
        }
      );
    },
    [
      contextBodyBase,
      contextSessionId,
      contextStandardKeys,
      ensureContextConversationId,
      sendMessage,
      withContextNonce,
    ]
  );

  const contextRuntimeValue = useMemo(
    () => ({
      submitAnswer: submitContextAnswer,
      requestAssist: requestContextAssist,
      uploadContextDocument,
      getContextDocumentStatus,
      runContextChallenge,
      runQuestionChallenge,
      getContextChallengeStatus,
      continueContextSession,
      submitting: status === "submitted" || status === "streaming",
    }),
    [
      status,
      submitContextAnswer,
      requestContextAssist,
      uploadContextDocument,
      getContextDocumentStatus,
      runContextChallenge,
      runQuestionChallenge,
      getContextChallengeStatus,
      continueContextSession,
    ]
  );

  // Component that uses the controller to clear text immediately
  const PromptInputWithController = () => {
    const { textInput } = usePromptInputController();

    const handleSubmit = useCallback(
      async (message: PromptInputMessage) => {
        // Context mode: server streams JSX (see server chat route); must use sendMessage so messages populate
        if (taskMode === "context") {
          const conversationId = ensureContextConversationId();
          textInput.clear();
          setLastSentTaskMode(taskMode);
          const userTyped = message.text?.trim() ?? "";
          const text = withContextNonce(userTyped || "Compliance context start");

          sendMessage(
            {
              text,
              files: message.files,
            },
            {
              body: {
                ...contextBodyBase,
                conversationId,
                contextSession: {
                  session_id: contextSessionId ?? undefined,
                  standard_keys: contextStandardKeys.length
                    ? contextStandardKeys
                    : undefined,
                  free_text: userTyped || undefined,
                },
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
          contextBodyBase,
          ensureContextConversationId,
          contextSessionId,
          contextStandardKeys,
          submitContextControl,
          withContextNonce,
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
              {taskMode === "context" && (
                <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">
                  Questionnaire mode: {contextInteractionMode}
                </div>
              )}
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

  const getMessageTextParts = (message: any): string[] => {
    if (!message) return [];

    if (Array.isArray(message.parts)) {
      return message.parts
        .map((p: any) => (p?.type === "text" && typeof p.text === "string" ? p.text : ""))
        .filter((part: string) => part.length > 0);
    }

    if (Array.isArray(message.content)) {
      const parts = message.content
        .map((p: any) => {
          if (typeof p === "string") return p;
          if (p?.type === "text" && typeof p.text === "string") return p.text;
          if (p?.type === "text-delta" && typeof p.delta === "string") return p.delta;
          return "";
        })
        .filter((part: string) => part.length > 0);
      if (parts.length > 0) return parts;
    }

    if (typeof message.content === "string" && message.content.length > 0) {
      return [message.content];
    }

    return [];
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
    const withoutNonce = raw.replace(/\n\u200bctx-\d+$/u, "");
    return withoutNonce.trim();
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

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") {
      return;
    }
    const rawParts = getMessageTextParts(last);
    const jsxPart = rawParts.find((part) => part.trim().startsWith("<CtxQuestionCard"));
    if (!jsxPart) {
      return;
    }
    const payload = tryDecodeCtxQuestionPayloadFromJsx(jsxPart.trim());
    if (!payload) {
      return;
    }
    if (payload.session_id) {
      setContextSessionId(payload.session_id);
    }
    if (Array.isArray(payload.standard_keys) && payload.standard_keys.length > 0) {
      setContextStandardKeys(payload.standard_keys);
    }
  }, [messages]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = getMessageText(last);
    const match = text.match(/Fragebogen-Status:\s*(active|paused|stopped)/i);
    if (!match) return;
    const mode = match[1].toLowerCase();
    if (mode === "active" || mode === "paused" || mode === "stopped") {
      setContextInteractionMode(mode);
    }
  }, [messages]);

  return (
    <ContextQuestionRuntimeProvider value={contextRuntimeValue}>
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
                            const textParts = getMessageTextParts(message);
                            if (textParts.length === 0) {
                              return <MessageResponse>{getMessageText(message)}</MessageResponse>;
                            }
                            return (
                              <div className="space-y-3">
                                {textParts.map((part, idx) => {
                                  const rawPart = part.trim();
                                  const isJsxCard =
                                    rawPart.startsWith("<CtxQuestionCard") ||
                                    rawPart.startsWith("<CtxChallengeStatusCard");
                                  if (isJsxCard) {
                                    return (
                                      <div
                                        key={`${message.id}-ctx-part-${idx}`}
                                        className="size-full min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                      >
                                        <ContextAssistantJsxPreview
                                          jsxText={rawPart || "<div />"}
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
                                    <MessageResponse key={`${message.id}-ctx-part-${idx}`}>
                                      {part}
                                    </MessageResponse>
                                  );
                                })}
                              </div>
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
          {taskMode === "context" && (
            <div className="absolute -top-7 right-4 z-10">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 py-1 shadow-sm">
                <PromptInputButton
                  onClick={() => submitContextControl("pause", { reason: "ui_pause" })}
                  variant="ghost"
                  className="size-8 rounded-md p-0"
                  title="Pause questionnaire"
                  aria-label="Pause questionnaire"
                >
                  <Pause className="size-4" />
                </PromptInputButton>
                <PromptInputButton
                  onClick={() => submitContextControl("resume", { reason: "ui_resume" })}
                  variant="ghost"
                  className="size-8 rounded-md p-0"
                  title="Resume questionnaire"
                  aria-label="Resume questionnaire"
                >
                  <Play className="size-4" />
                </PromptInputButton>
                <PromptInputButton
                  onClick={() => submitContextControl("status", { reason: "ui_status" })}
                  variant="ghost"
                  className="size-8 rounded-md p-0"
                  title="Questionnaire status"
                  aria-label="Questionnaire status"
                >
                  <Activity className="size-4" />
                </PromptInputButton>
                <PromptInputButton
                  onClick={() => submitContextControl("stop", { reason: "ui_stop", confirm: true })}
                  variant="ghost"
                  className="size-8 rounded-md p-0"
                  title="Stop questionnaire"
                  aria-label="Stop questionnaire"
                >
                  <Square className="size-4" />
                </PromptInputButton>
              </div>
            </div>
          )}
          
          <PromptInputProvider>
            <PromptInputWithController />
          </PromptInputProvider>
        </div>
      </div>
    </div>
    </ContextQuestionRuntimeProvider>
  );
}
