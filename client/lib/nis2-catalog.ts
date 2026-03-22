/**
 * NIS-2 Katalog: labels, step validation (aligned with server nis2_logic), user bubble text.
 */

export type Nis2ContextAnswers = {
  submittedStep?: number;
  sector?: string;
  employees?: number | null;
  revenueMio?: number | null;
  balanceMio?: number | null;
  wesentlicheDienste?: boolean;
  kritischeInfrastruktur?: boolean;
  digitaleDienste?: string[];
  lieferantNis2?: boolean;
  beeinflusstSicherheit?: boolean;
  dienstleistungenEu?: boolean;
  sonderfaelle?: string[];
};

export const NIS2_SECTORS: { id: string; label: string }[] = [
  { id: "energie", label: "Energie" },
  { id: "verkehr", label: "Verkehr / Transport" },
  { id: "banken", label: "Banken / Finanzwesen" },
  { id: "gesundheit", label: "Gesundheitswesen" },
  { id: "digital", label: "Digitale Infrastruktur / IT-Dienstleistungen" },
  { id: "oeffentlich", label: "Öffentliche Verwaltung" },
  { id: "herstellung", label: "Herstellung / Produktion" },
  { id: "lebensmittel", label: "Lebensmittel / Chemie / Abfallwirtschaft" },
  { id: "sonstige", label: "Sonstige" },
];

export const NIS2_DIGITALE: { id: string; label: string }[] = [
  { id: "cloud", label: "Cloud-Dienste (SaaS / IaaS / PaaS)" },
  { id: "hosting", label: "Rechenzentrum / Hosting" },
  { id: "marktplatz", label: "Online-Marktplatz" },
  { id: "suche", label: "Suchmaschine" },
  { id: "netzwerk", label: "Netzwerk- / Kommunikationsdienste" },
  { id: "keine", label: "Keine der genannten" },
];

export const NIS2_SONDER: { id: string; label: string }[] = [
  { id: "oeffentlich", label: "Öffentliche Einrichtung" },
  { id: "behoerde", label: "Von Behörden als kritisch eingestuft" },
  { id: "multieu", label: "Tätigkeit in mehreren EU-Ländern" },
  { id: "keine", label: "Keine der genannten" },
];

function labelById(list: { id: string; label: string }[], id: string | undefined): string {
  if (!id) return "—";
  return list.find((x) => x.id === id)?.label ?? id;
}

function boolDe(v: boolean | undefined): string {
  if (v === true) return "Ja";
  if (v === false) return "Nein";
  return "—";
}

/** Mirrors server `validate_step` in nis2_logic.py */
export function validateNis2Step(draft: Nis2ContextAnswers, step: number): boolean {
  switch (step) {
    case 1:
      return Boolean(draft.sector);
    case 2: {
      const em = draft.employees;
      const rev = draft.revenueMio;
      const bal = draft.balanceMio;
      return (
        em !== null &&
        em !== undefined &&
        em >= 0 &&
        rev !== null &&
        rev !== undefined &&
        rev >= 0 &&
        bal !== null &&
        bal !== undefined &&
        bal >= 0
      );
    }
    case 3:
      return (
        (draft.wesentlicheDienste === true || draft.wesentlicheDienste === false) &&
        (draft.kritischeInfrastruktur === true || draft.kritischeInfrastruktur === false)
      );
    case 4: {
      const d = draft.digitaleDienste;
      return Array.isArray(d) && d.length > 0;
    }
    case 5:
      return (
        (draft.lieferantNis2 === true || draft.lieferantNis2 === false) &&
        (draft.beeinflusstSicherheit === true || draft.beeinflusstSicherheit === false)
      );
    case 6:
      return draft.dienstleistungenEu === true || draft.dienstleistungenEu === false;
    case 7: {
      const s = draft.sonderfaelle;
      return Array.isArray(s) && s.length > 0;
    }
    default:
      return false;
  }
}

/** Compact value-only summary for the user bubble (no step headers or field labels). */
export function buildNis2UserMessageText(a: Nis2ContextAnswers, submittedStep: number): string {
  switch (submittedStep) {
    case 1:
      return labelById(NIS2_SECTORS, a.sector);
    case 2:
      return [a.employees ?? "—", a.revenueMio ?? "—", a.balanceMio ?? "—"].join(" · ");
    case 3:
      return [boolDe(a.wesentlicheDienste), boolDe(a.kritischeInfrastruktur)].join(" · ");
    case 4: {
      const ids = a.digitaleDienste ?? [];
      return ids.map((id) => labelById(NIS2_DIGITALE, id)).join(" · ") || "—";
    }
    case 5:
      return [boolDe(a.lieferantNis2), boolDe(a.beeinflusstSicherheit)].join(" · ");
    case 6:
      return boolDe(a.dienstleistungenEu);
    case 7: {
      const ids = a.sonderfaelle ?? [];
      return ids.map((id) => labelById(NIS2_SONDER, id)).join(" · ") || "—";
    }
    default:
      return "";
  }
}

/** Append invisible nonce line for dedupe-safe sends. */
export function appendNis2NonceLine(readable: string, nonce: number): string {
  return `${readable}\n\u200b${nonce}`;
}

/**
 * Strip trailing nonce line from stored user message for display.
 * Legacy: only `\u200b\d+` → short label.
 */
export function formatNis2UserBubbleDisplay(raw: string): string {
  const t = raw.trimEnd();
  const withReadable = t.match(/^([\s\S]*)\n\u200b\d+$/);
  if (withReadable) {
    return withReadable[1].trim();
  }
  if (/^\u200b\d+$/.test(t.trim())) {
    return "NIS-2 Katalog";
  }
  return raw;
}
