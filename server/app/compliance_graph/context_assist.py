"""Assist helpers for context-question suggestions (rewrite/web lookup)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from app.agents.providers import create_model, parse_model_id
from app.config import config

logger = logging.getLogger(__name__)


class AssistSuggestionResult(BaseModel):
    """Structured suggestion for one context question."""

    suggested_text: str = Field(default="")
    note: str = Field(default="")


class BriefingPersonalizationResult(BaseModel):
    """Structured output for question briefing personalization."""

    summary: str = Field(default="")
    evidence_hints: list[str] = Field(default_factory=list)
    note: str = Field(default="")


REWRITE_SYSTEM_PROMPT = """
Du bist Schreibassistent:in für Compliance-Kontextfragen.
Du verbesserst Nutzereingaben so, dass sie audit-tauglich, klar und professionell sind.

Kernregeln:
- Bedeutung bewahren, keine neuen Fakten erfinden.
- Keine Rechtsberatung.
- Keine bloße Wiederholung des Inputs.
- Wenn Input nur Stichwörter sind: forme daraus vollständige, saubere Sätze.
- Wenn Input bereits ein Satz ist: verdichte und präzisiere ohne Inhaltsverlust.
- Wenn Input zu vage ist: liefere die beste belastbare Formulierung und benenne die Grenze kurz in `note`.

Qualitätskriterien:
- konkret statt generisch
- aktiv statt passiv
- kurz, aber informationsdicht
- keine Redundanz

- Antworte immer auf Deutsch.
- Ausgabe nur im strukturierten Schema.
""".strip()

WEB_LOOKUP_SYSTEM_PROMPT = """
Du bist ein Recherche-Assistent für Compliance-Kontextfragen und formulierst den Tätigkeitsbereich eines Unternehmens.

Ziel:
Aus Website-Auszügen und optionalem Nutzentwurf einen belastbaren, knappen Tätigkeitsbereich erstellen.

Regeln:
- Nutze nur Informationen aus Nutzentwurf + Website-Auszug.
- Keine Halluzinationen, keine regulatorischen Bewertungen, keine Rechtsberatung.
- Entferne Marketing-/Werbesprache und Füllwörter.
- Nenne möglichst: Hauptleistungen/Produkte, Kundensegmente/Branche, operative Art (z. B. Produktion, Service, Plattform).
- Wenn Informationen fehlen oder widersprüchlich sind: vorsichtig formulieren und im Feld `note` benennen.
- Vermeide 1:1-Kopien aus der Website; fasse semantisch zusammen.

Stil:
- 1-3 Sätze, sachlich, präzise, professionell.
- Keine Rechtsberatung.
- Antworte immer auf Deutsch.
- Ausgabe nur im strukturierten Schema.
""".strip()

PERSONALIZE_BRIEFING_SYSTEM_PROMPT = """
Du bist Senior Compliance-Auditor:in und Business-Consultant.
Deine Aufgabe ist nicht Umformulieren um des Umformulierens willen, sondern echter Mehrwert.

Arbeitsprinzipien:
- Liefere nur kontextgebundene, praktische Hinweise.
- Vermeide Wiederholung des Originaltexts.
- Keine erfundenen Fakten, keine Rechtsberatung.
- Schreibe klar, konkret, umsetzungsorientiert (kein Marketing-Sprech).
- Wenn der Kontext keinen sinnvollen Zusatz erlaubt, bleibe nah am Original und erkläre kurz warum im Feld `note`.

Qualitätsmaßstab:
- Jeder Satz muss für die Organisation handlungsrelevant sein.
- Beziehe Aussagen explizit auf Profilfakten (z. B. Größe, Tätigkeitsbereich, Produktion ja/nein, Branche).
- Nenne bevorzugte Nachweisarten so, dass ein Audit-Team morgen damit arbeiten kann.

Sprache: Deutsch.
Ausgabe strikt im strukturierten Schema.
""".strip()


class ContextAssistService:
    """Small helper service for assist suggestions."""

    def __init__(self, model_id: str | None = None) -> None:
        provider = config.default_provider
        model_name = config.default_model
        if isinstance(model_id, str) and model_id.strip():
            try:
                provider, model_name = parse_model_id(model_id.strip())
            except ValueError as error:
                logger.warning(
                    "Invalid context assist model_id '%s', fallback to default model: %s",
                    model_id,
                    error,
                )

        self.model_id = f"{provider}:{model_name}"
        model = create_model(provider, model_name)
        self.rewrite_agent = Agent(
            model,
            output_type=AssistSuggestionResult,
            system_prompt=REWRITE_SYSTEM_PROMPT,
        )
        self.web_lookup_agent = Agent(
            model,
            output_type=AssistSuggestionResult,
            system_prompt=WEB_LOOKUP_SYSTEM_PROMPT,
        )
        self.personalize_briefing_agent = Agent(
            model,
            output_type=BriefingPersonalizationResult,
            system_prompt=PERSONALIZE_BRIEFING_SYSTEM_PROMPT,
        )

    async def suggest(
        self,
        tool: Literal["rewrite", "web_lookup"],
        question_prompt: str,
        user_value: str,
        website_url: str = "",
    ) -> AssistSuggestionResult:
        if tool == "rewrite":
            return await self._rewrite(question_prompt=question_prompt, user_value=user_value)
        return await self._web_lookup(
            question_prompt=question_prompt,
            user_value=user_value,
            website_url=website_url,
        )

    async def _rewrite(self, question_prompt: str, user_value: str) -> AssistSuggestionResult:
        text = user_value.strip()
        if not text:
            return AssistSuggestionResult(
                suggested_text="",
                note="Keine Eingabe vorhanden. Bitte zuerst einen Entwurf eingeben.",
            )

        prompt = (
            f"Kontextfrage: {question_prompt}\n"
            "Nutzereingabe:\n"
            f"{text}\n\n"
            "Aufgabe:\n"
            "1) Erkenne den Eingabetyp (Stichwörter, Fragment, vollständiger Satz).\n"
            "2) Schreibe eine verbesserte Version in professionellem, präzisem Stil.\n"
            "3) Falls Stichwörter: in vollständige, natürliche Sätze überführen.\n"
            "4) Keine neuen Fakten hinzufügen.\n"
            "5) Im Feld `note` kurz benennen, was verbessert wurde (z. B. "
            "'Stichwörter zu vollständigem Satz')."
        )
        try:
            result = await self.rewrite_agent.run(prompt)
            output = result.output
            if isinstance(output, AssistSuggestionResult) and output.suggested_text.strip():
                return output
        except Exception as error:
            logger.warning("Context assist rewrite failed: %s", error)

        return AssistSuggestionResult(
            suggested_text=text,
            note="Automatische Verbesserung nicht verfügbar. Originaltext übernommen.",
        )

    async def _web_lookup(
        self,
        question_prompt: str,
        user_value: str,
        website_url: str,
    ) -> AssistSuggestionResult:
        url = self._normalize_url(website_url)
        if not url:
            return AssistSuggestionResult(
                suggested_text=user_value.strip(),
                note="Kein Website-Link im Kontextprofil gefunden. Bitte Website zuerst angeben.",
            )

        page_text = await self._fetch_website_text(url)
        if not page_text:
            return AssistSuggestionResult(
                suggested_text=user_value.strip(),
                note="Website-Inhalt konnte nicht geladen werden. Bitte Eingabe manuell ergänzen.",
            )

        prompt = (
            f"Kontextfrage: {question_prompt}\n"
            f"Nutzerentwurf (falls vorhanden):\n{user_value.strip() or '(leer)'}\n\n"
            f"Website URL: {url}\n"
            "Website-Auszug (gekürzt):\n"
            f"{page_text}\n\n"
            "Aufgabe:\n"
            "- Erstelle einen präzisen Tätigkeitsbereich in 1-3 Sätzen.\n"
            "- Priorisiere konkrete Leistungs-/Brancheninformationen.\n"
            "- Bei Unsicherheit: vorsichtig formulieren und Datenlücke im Feld `note` nennen."
        )
        try:
            result = await self.web_lookup_agent.run(prompt)
            output = result.output
            if isinstance(output, AssistSuggestionResult) and output.suggested_text.strip():
                return output
        except Exception as error:
            logger.warning("Context assist web_lookup failed: %s", error)

        fallback = user_value.strip() if user_value.strip() else page_text[:280].strip()
        return AssistSuggestionResult(
            suggested_text=fallback,
            note="Web-Assist fallback: Vorschlag aus verfügbarem Website-Text erstellt.",
        )

    async def personalize_briefing(
        self,
        *,
        question_prompt: str,
        summary: str,
        evidence_items: list[dict[str, str]],
        context_profile: dict[str, Any],
    ) -> BriefingPersonalizationResult | None:
        summary_text = summary.strip()
        if not summary_text and not evidence_items:
            return None

        payload = {
            "context_profile": context_profile,
            "question_prompt": question_prompt,
            "summary": summary_text,
            "evidence": evidence_items,
        }
        prompt = (
            "Kontextprofil und Ausgangstext:\n"
            f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
            "Aufgabe:\n"
            "1) Personalisiere die Zusammenfassung für den konkreten Organisationskontext.\n"
            "2) Überarbeite Evidence-Hinweise so, dass sie praktisch und auditierbar sind.\n"
            "3) Ergänze nur wertstiftende Konkretisierung (keine erfundenen Fakten).\n"
            "4) Vermeide Wiederholung und Floskeln.\n"
            "5) `evidence_hints` muss dieselbe Reihenfolge wie die Eingabe-Evidence beibehalten."
        )
        try:
            result = await self.personalize_briefing_agent.run(prompt)
            output = result.output
            if isinstance(output, BriefingPersonalizationResult):
                return output
        except Exception as error:
            logger.warning("Context assist briefing personalization failed: %s", error)
        return None

    @staticmethod
    async def _fetch_website_text(url: str) -> str:
        try:
            timeout = httpx.Timeout(10.0, read=12.0)
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                html = response.text
        except Exception as error:
            logger.warning("Website fetch failed for %s: %s", url, error)
            return ""

        plain = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
        plain = re.sub(r"<style[\s\S]*?</style>", " ", plain, flags=re.IGNORECASE)
        plain = re.sub(r"<[^>]+>", " ", plain)
        plain = re.sub(r"\s+", " ", plain).strip()
        return plain[:4000]

    @staticmethod
    def _normalize_url(raw: str) -> str:
        value = (raw or "").strip()
        if not value:
            return ""
        if value.startswith("http://") or value.startswith("https://"):
            return value
        return f"https://{value}"
