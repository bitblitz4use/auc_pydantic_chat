"use client";

import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from "@/components/ai-elements/jsx-preview";
import {
  NIS2_DIGITALE,
  NIS2_SECTORS,
  NIS2_SONDER,
  type Nis2ContextAnswers,
} from "@/lib/nis2-catalog";
import { cn } from "@/lib/utils";
import {
  createContext,
  memo,
  useContext,
  type ReactNode,
} from "react";

/** Per-preview flag so JsxParser can use stable `components` (same reference every render). */
const Nis2InteractiveContext = createContext(false);

function useNis2Interactive(): boolean {
  return useContext(Nis2InteractiveContext);
}

/** NIS-2 Fragekatalog — aligned with server `nis2_logic` / `nis2_fixed_jsx`. */
export type ContextAnswers = Nis2ContextAnswers;

export type ContextWizardValue = {
  activeStep: number;
  canSubmitStep: boolean;
  draft: ContextAnswers;
  sendSelection: () => void;
  setSector: (id: string) => void;
  setEmployees: (v: number | null) => void;
  setRevenueMio: (v: number | null) => void;
  setBalanceMio: (v: number | null) => void;
  setBoolField: (
    field:
      | "wesentlicheDienste"
      | "kritischeInfrastruktur"
      | "lieferantNis2"
      | "beeinflusstSicherheit"
      | "dienstleistungenEu",
    value: boolean
  ) => void;
  toggleDigitale: (key: string) => void;
  toggleSonder: (key: string) => void;
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
    <ContextWizardContext.Provider value={value}>{children}</ContextWizardContext.Provider>
  );
}

function CtxSectorGrid() {
  const interactive = useNis2Interactive();
  const { draft, setSector } = useContextWizard();
  if (!interactive) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        Sektor (nur Ansicht)
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {NIS2_SECTORS.map((s) => {
        const pressed = draft.sector === s.id;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={pressed}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
              pressed
                ? "border-primary bg-primary/15 ring-2 ring-ring"
                : "border-border bg-muted/40 hover:bg-muted/70"
            )}
            onClick={() => setSector(s.id)}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function CtxNumInputs() {
  const interactive = useNis2Interactive();
  const { draft, setEmployees, setRevenueMio, setBalanceMio } = useContextWizard();
  if (!interactive) {
    return <div className="mt-3 text-xs text-muted-foreground">Größenangaben (nur Ansicht)</div>;
  }
  return (
    <div className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">Anzahl Mitarbeiter</span>
        <input
          type="number"
          min={0}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={draft.employees ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setEmployees(v === "" ? null : Math.max(0, Math.floor(Number(v))));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">Jahresumsatz (Mio. €)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={draft.revenueMio ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setRevenueMio(v === "" ? null : Math.max(0, Number(v)));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">Jahresbilanzsumme (Mio. €)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={draft.balanceMio ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setBalanceMio(v === "" ? null : Math.max(0, Number(v)));
          }}
        />
      </label>
    </div>
  );
}

function JaNeinRow({
  label,
  value,
  onJa,
  onNein,
}: {
  label: string;
  value: boolean | undefined;
  onJa: () => void;
  onNein: () => void;
}) {
  const interactive = useNis2Interactive();
  if (!interactive) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {label}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            value === true ? "bg-primary text-primary-foreground ring-2 ring-ring" : "bg-muted"
          )}
          onClick={onJa}
        >
          Ja
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            value === false ? "bg-primary text-primary-foreground ring-2 ring-ring" : "bg-muted"
          )}
          onClick={onNein}
        >
          Nein
        </button>
      </div>
    </div>
  );
}

function CtxKritikalitaetToggles() {
  const { draft, setBoolField } = useContextWizard();
  return (
    <div className="mt-3 flex flex-col gap-4">
      <JaNeinRow
        label="Erbringen Sie wesentliche oder kritische Dienstleistungen?"
        value={draft.wesentlicheDienste}
        onJa={() => setBoolField("wesentlicheDienste", true)}
        onNein={() => setBoolField("wesentlicheDienste", false)}
      />
      <JaNeinRow
        label="Sind Sie Teil einer kritischen Infrastruktur?"
        value={draft.kritischeInfrastruktur}
        onJa={() => setBoolField("kritischeInfrastruktur", true)}
        onNein={() => setBoolField("kritischeInfrastruktur", false)}
      />
    </div>
  );
}

function CtxDigitaleGrid() {
  const interactive = useNis2Interactive();
  const { draft, toggleDigitale } = useContextWizard();
  const set = new Set(draft.digitaleDienste ?? []);
  if (!interactive) {
    return <div className="mt-3 text-xs text-muted-foreground">Digitale Dienste (nur Ansicht)</div>;
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {NIS2_DIGITALE.map((d) => {
        const pressed = set.has(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={pressed}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-xs transition-colors",
              pressed
                ? "border-secondary bg-secondary/20 ring-2 ring-ring"
                : "border-border bg-muted/40 hover:bg-muted/70"
            )}
            onClick={() => toggleDigitale(d.id)}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

function CtxLieferketteToggles() {
  const { draft, setBoolField } = useContextWizard();
  return (
    <div className="mt-3 flex flex-col gap-4">
      <JaNeinRow
        label="Sind Sie Lieferant für ein Unternehmen, das unter NIS2 fällt?"
        value={draft.lieferantNis2}
        onJa={() => setBoolField("lieferantNis2", true)}
        onNein={() => setBoolField("lieferantNis2", false)}
      />
      <JaNeinRow
        label="Beeinflussen Ihre Dienstleistungen die Sicherheit anderer Organisationen?"
        value={draft.beeinflusstSicherheit}
        onJa={() => setBoolField("beeinflusstSicherheit", true)}
        onNein={() => setBoolField("beeinflusstSicherheit", false)}
      />
    </div>
  );
}

function CtxEuToggle() {
  const { draft, setBoolField } = useContextWizard();
  return (
    <div className="mt-3">
      <JaNeinRow
        label="Bieten Sie Dienstleistungen innerhalb der EU an?"
        value={draft.dienstleistungenEu}
        onJa={() => setBoolField("dienstleistungenEu", true)}
        onNein={() => setBoolField("dienstleistungenEu", false)}
      />
    </div>
  );
}

function CtxSonderfaelleGrid() {
  const interactive = useNis2Interactive();
  const { draft, toggleSonder } = useContextWizard();
  const set = new Set(draft.sonderfaelle ?? []);
  if (!interactive) {
    return <div className="mt-3 text-xs text-muted-foreground">Sonderfälle (nur Ansicht)</div>;
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      {NIS2_SONDER.map((d) => {
        const pressed = set.has(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={pressed}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-xs transition-colors",
              pressed
                ? "border-secondary bg-secondary/20 ring-2 ring-ring"
                : "border-border bg-muted/40 hover:bg-muted/70"
            )}
            onClick={() => toggleSonder(d.id)}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

function CtxSendSelection() {
  const interactive = useNis2Interactive();
  const { canSubmitStep, sendSelection } = useContextWizard();
  if (!interactive) {
    return (
      <span className="inline-flex rounded-md border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        Auswahl senden
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={!canSubmitStep}
      className={cn(
        "inline-flex rounded-md border border-border px-3 py-1.5 text-xs font-medium",
        canSubmitStep
          ? "bg-background hover:bg-muted/50"
          : "cursor-not-allowed bg-muted/50 text-muted-foreground opacity-60"
      )}
      onClick={sendSelection}
    >
      Auswahl senden
    </button>
  );
}

/**
 * Stable reference — required so react-jsx-parser does not remount custom components
 * on every parent re-render (which caused controlled inputs to lose focus after one char).
 */
const NIS2_JSX_COMPONENTS = {
  CtxDigitaleGrid,
  CtxEuToggle,
  CtxKritikalitaetToggles,
  CtxLieferketteToggles,
  CtxNumInputs,
  CtxSectorGrid,
  CtxSendSelection,
  CtxSonderfaelleGrid,
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
      components={NIS2_JSX_COMPONENTS}
      jsx={jsxText}
      isStreaming={isStreaming}
      onError={onError}
    >
      <Nis2InteractiveContext.Provider value={interactive}>
        <JSXPreviewContent />
      </Nis2InteractiveContext.Provider>
      <JSXPreviewError />
    </JSXPreview>
  );
});

ContextAssistantJsxPreview.displayName = "ContextAssistantJsxPreview";
