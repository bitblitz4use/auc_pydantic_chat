"use client";

import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from "@/components/ai-elements/jsx-preview";
import { cn } from "@/lib/utils";
import {
  createContext,
  memo,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type QuestionAnswerType = "boolean" | "single_choice" | "multi_choice" | "text";

export type ContextAnswerSubmission = {
  sessionId: string;
  standardKeys: string[];
  questionKey: string;
  value: boolean | string | string[];
};

type ContextQuestionRuntimeValue = {
  submitAnswer: (submission: ContextAnswerSubmission) => void;
  submitting: boolean;
};

type ProgressPayload = {
  requirements_total?: number;
  requirements_open?: number;
  requirements_addressed?: number;
  requirements_gap?: number;
  requirements_not_applicable?: number;
  requirements_unclear?: number;
  unanswered_questions?: number;
};

type QuestionPayload = {
  session_id: string;
  standard_keys: string[];
  question: {
    question_key: string;
    prompt: string;
    answer_type: QuestionAnswerType;
    allowed_values?: string[];
    language?: string;
  };
  question_briefing?: {
    document?: {
      standard_key?: string;
      title?: string;
      version_label?: string;
    };
    clause?: {
      clause_id?: string;
      clause_path?: string;
      heading_text?: string;
    };
    chunk?: {
      chunk_key?: string;
      preview?: string;
    };
    summary?: string;
    evidence?: Array<{
      title?: string;
      hint?: string;
      example?: string;
    }>;
    impact?: {
      requirements_count?: number;
    };
  };
  progress?: ProgressPayload;
};

const ContextQuestionRuntimeContext = createContext<ContextQuestionRuntimeValue | null>(null);
const CtxInteractiveContext = createContext(false);

function useCtxInteractive(): boolean {
  return useContext(CtxInteractiveContext);
}

function useContextQuestionRuntime(): ContextQuestionRuntimeValue {
  const value = useContext(ContextQuestionRuntimeContext);
  if (!value) {
    throw new Error("useContextQuestionRuntime must be used within provider");
  }
  return value;
}

export function ContextQuestionRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ContextQuestionRuntimeValue;
}) {
  return (
    <ContextQuestionRuntimeContext.Provider value={value}>
      {children}
    </ContextQuestionRuntimeContext.Provider>
  );
}

function decodePayload(payloadB64: string): QuestionPayload | null {
  try {
    const binary = atob(payloadB64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    const parsed = JSON.parse(json) as QuestionPayload;
    if (!parsed?.session_id || !parsed?.question?.question_key) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function ProgressPills({ progress }: { progress?: ProgressPayload }) {
  const items = [
    { key: "open", value: progress?.requirements_open ?? 0 },
    { key: "addressed", value: progress?.requirements_addressed ?? 0 },
    { key: "gap", value: progress?.requirements_gap ?? 0 },
    { key: "unclear", value: progress?.requirements_unclear ?? 0 },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {items.map((item) => (
        <span
          key={item.key}
          className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground"
        >
          {item.key}: {item.value}
        </span>
      ))}
    </div>
  );
}

function CitationPill({ label, value }: { label: string; value: string }) {
  if (!value.trim()) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}:</span>
      <span className="max-w-[22rem] truncate">{value}</span>
    </span>
  );
}

function CtxQuestionCard({ payloadB64 }: { payloadB64: string }) {
  const interactive = useCtxInteractive();
  const runtime = useContextQuestionRuntime();
  const payload = useMemo(() => decodePayload(payloadB64), [payloadB64]);
  const question = payload?.question;
  const briefing = payload?.question_briefing;
  const allowedValues = question?.allowed_values ?? [];

  const [booleanValue, setBooleanValue] = useState<boolean | null>(null);
  const [singleValue, setSingleValue] = useState<string>("");
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [textValue, setTextValue] = useState<string>("");

  if (!payload || !question) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        Fragekarte konnte nicht geladen werden.
      </div>
    );
  }

  const disabled = !interactive || runtime.submitting;

  const toggleMultiValue = (value: string) => {
    setMultiValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const canSubmit =
    (question.answer_type === "boolean" && booleanValue !== null) ||
    (question.answer_type === "single_choice" && Boolean(singleValue)) ||
    (question.answer_type === "multi_choice" && multiValues.length > 0) ||
    (question.answer_type === "text" && Boolean(textValue.trim()));

  const submit = () => {
    if (disabled) return;
    let value: boolean | string | string[];
    if (question.answer_type === "boolean") {
      if (booleanValue === null) return;
      value = booleanValue;
    } else if (question.answer_type === "single_choice") {
      if (!singleValue) return;
      value = singleValue;
    } else if (question.answer_type === "multi_choice") {
      if (multiValues.length === 0) return;
      value = multiValues;
    } else {
      const trimmed = textValue.trim();
      if (!trimmed) return;
      value = trimmed;
    }

    runtime.submitAnswer({
      sessionId: payload.session_id,
      standardKeys: payload.standard_keys ?? [],
      questionKey: question.question_key,
      value,
    });
  };

  return (
    <div className="max-w-2xl rounded-lg border bg-card p-5 shadow-sm">
      {(briefing?.document?.title ||
        briefing?.document?.standard_key ||
        briefing?.clause?.clause_path ||
        briefing?.clause?.heading_text) && (
        <div className="mb-3 flex flex-wrap gap-2">
          <CitationPill label="Standard" value={briefing?.document?.standard_key || ""} />
          <CitationPill
            label="Dokument"
            value={briefing?.document?.title || ""}
          />
          <CitationPill
            label="Clause"
            value={briefing?.clause?.clause_path || briefing?.clause?.heading_text || ""}
          />
        </div>
      )}

      <h3 className="text-sm font-semibold text-foreground">{question.prompt}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Typ: {question.answer_type}
        {question.language ? ` · Sprache: ${question.language}` : ""}
      </p>

      {briefing?.summary && (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Worum es geht
          </p>
          <p className="mt-1 text-sm text-foreground">{briefing.summary}</p>
        </div>
      )}

      {(briefing?.evidence?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mögliche Nachweise
          </p>
          <div className="mt-2 space-y-2">
            {briefing?.evidence?.slice(0, 3).map((item, index) => (
              <div key={`${item.title ?? "evidence"}-${index}`} className="text-sm">
                {item.title && <p className="font-medium text-foreground">{item.title}</p>}
                {item.hint && <p className="text-muted-foreground">{item.hint}</p>}
                {item.example && (
                  <p className="mt-0.5 text-xs text-muted-foreground/90">
                    Beispiel: {item.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {question.answer_type === "boolean" && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium",
                booleanValue === true ? "border-primary bg-primary/15" : "border-border bg-muted/40",
                disabled ? "opacity-60" : "hover:bg-muted/60"
              )}
              onClick={() => setBooleanValue(true)}
            >
              Ja
            </button>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium",
                booleanValue === false ? "border-primary bg-primary/15" : "border-border bg-muted/40",
                disabled ? "opacity-60" : "hover:bg-muted/60"
              )}
              onClick={() => setBooleanValue(false)}
            >
              Nein
            </button>
          </div>
        )}

        {question.answer_type === "single_choice" && (
          <select
            disabled={disabled}
            value={singleValue}
            onChange={(event) => setSingleValue(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Bitte auswahlen</option>
            {allowedValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        {question.answer_type === "multi_choice" && (
          <div className="flex flex-col gap-2">
            {allowedValues.map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={multiValues.includes(value)}
                  onChange={() => toggleMultiValue(value)}
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
        )}

        {question.answer_type === "text" && (
          <textarea
            disabled={disabled}
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Antwort eingeben"
          />
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          disabled={!canSubmit || disabled}
          className={cn(
            "inline-flex rounded-md border border-border px-3 py-1.5 text-xs font-medium",
            !canSubmit || disabled
              ? "cursor-not-allowed bg-muted/40 text-muted-foreground opacity-60"
              : "bg-background hover:bg-muted/60"
          )}
          onClick={submit}
        >
          Antwort senden
        </button>
      </div>

      <ProgressPills progress={payload.progress} />
    </div>
  );
}

const CONTEXT_JSX_COMPONENTS = {
  CtxQuestionCard,
} as const;

export const ContextAssistantJsxPreview = memo(function ContextAssistantJsxPreview({
  jsxText,
  isStreaming,
  interactive,
  onError,
}: {
  jsxText: string;
  isStreaming: boolean;
  interactive: boolean;
  onError?: (error: Error) => void;
}) {
  return (
    <JSXPreview
      components={CONTEXT_JSX_COMPONENTS}
      jsx={jsxText}
      isStreaming={isStreaming}
      onError={onError}
    >
      <CtxInteractiveContext.Provider value={interactive}>
        <JSXPreviewContent />
      </CtxInteractiveContext.Provider>
      <JSXPreviewError />
    </JSXPreview>
  );
});

ContextAssistantJsxPreview.displayName = "ContextAssistantJsxPreview";

export function tryDecodeCtxQuestionPayloadFromJsx(
  jsxText: string
): QuestionPayload | null {
  const match = jsxText.match(/payloadB64="([^"]+)"/);
  if (!match) {
    return null;
  }
  return decodePayload(match[1]);
}
