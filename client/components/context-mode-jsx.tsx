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
  type ReactNode,
} from "react";

/** Structured answers for CONTEXT mode (server wizard + client toggles). */
export type ContextAnswers = {
  gender?: "male" | "female";
  region?: "DE" | "AUT";
};

export type ContextWizardValue = {
  draft: ContextAnswers;
  toggleMale: () => void;
  toggleFemale: () => void;
  toggleDE: () => void;
  toggleAUT: () => void;
  sendSelection: () => void;
};

const ContextWizardContext = createContext<ContextWizardValue | null>(null);

export function useContextWizard(): ContextWizardValue {
  const v = useContext(ContextWizardContext);
  if (!v) {
    throw new Error("useContextWizard must be used within ContextWizardProvider");
  }
  return v;
}

export function ContextWizardProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ContextWizardValue;
}) {
  return (
    <ContextWizardContext.Provider value={value}>
      {children}
    </ContextWizardContext.Provider>
  );
}

function CtxGenderMale({ interactive }: { interactive: boolean }) {
  const { draft, toggleMale } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        Male
      </span>
    );
  }
  const pressed = draft.gender === "male";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      className={cn(
        "inline-flex rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        pressed
          ? "bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={toggleMale}
    >
      Male
    </button>
  );
}

function CtxGenderFemale({ interactive }: { interactive: boolean }) {
  const { draft, toggleFemale } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        Female
      </span>
    );
  }
  const pressed = draft.gender === "female";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      className={cn(
        "inline-flex rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        pressed
          ? "bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={toggleFemale}
    >
      Female
    </button>
  );
}

function CtxRegionDE({ interactive }: { interactive: boolean }) {
  const { draft, toggleDE } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        DE
      </span>
    );
  }
  const pressed = draft.region === "DE";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      className={cn(
        "inline-flex rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        pressed
          ? "bg-secondary text-secondary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={toggleDE}
    >
      DE
    </button>
  );
}

function CtxRegionAUT({ interactive }: { interactive: boolean }) {
  const { draft, toggleAUT } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        AUT
      </span>
    );
  }
  const pressed = draft.region === "AUT";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      className={cn(
        "inline-flex rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        pressed
          ? "bg-secondary text-secondary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={toggleAUT}
    >
      AUT
    </button>
  );
}

function CtxSendSelection({ interactive }: { interactive: boolean }) {
  const { sendSelection } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        Send selection
      </span>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
      onClick={sendSelection}
    >
      Send selection
    </button>
  );
}

/** Custom tags for server JSX strings — pass into JSXPreview `components`. */
export function createContextJsxComponents(interactive: boolean) {
  return {
    CtxGenderFemale: memo(function CtxGenderFemaleWrap() {
      return <CtxGenderFemale interactive={interactive} />;
    }),
    CtxGenderMale: memo(function CtxGenderMaleWrap() {
      return <CtxGenderMale interactive={interactive} />;
    }),
    CtxRegionAUT: memo(function CtxRegionAUTWrap() {
      return <CtxRegionAUT interactive={interactive} />;
    }),
    CtxRegionDE: memo(function CtxRegionDEWrap() {
      return <CtxRegionDE interactive={interactive} />;
    }),
    CtxSendSelection: memo(function CtxSendSelectionWrap() {
      return <CtxSendSelection interactive={interactive} />;
    }),
  };
}

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
  const components = useMemo(
    () => createContextJsxComponents(interactive),
    [interactive]
  );
  return (
    <JSXPreview
      components={components}
      jsx={jsxText}
      isStreaming={isStreaming}
      onError={onError}
    >
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  );
});

ContextAssistantJsxPreview.displayName = "ContextAssistantJsxPreview";
