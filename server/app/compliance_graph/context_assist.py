"""Assist helpers for context-question suggestions (rewrite/web lookup)."""

from __future__ import annotations

import logging
import re
from typing import Literal

import httpx
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from app.agents.providers import create_model
from app.config import config

logger = logging.getLogger(__name__)


class AssistSuggestionResult(BaseModel):
    """Structured suggestion for one context question."""

    suggested_text: str = Field(default="")
    note: str = Field(default="")


ASSIST_SYSTEM_PROMPT = """
Du bist ein Assistenz-Modul für Kontextfragen in einem Compliance-System.

Ziele:
- Verbessere Nutzereingaben sprachlich und inhaltlich klar.
- Bei Web-Kontext: leite einen präzisen Tätigkeitsbereich aus bereitgestellten Website-Auszügen ab.
- Keine Rechtsberatung, keine regulatorischen Schlussfolgerungen.
- Antworte immer auf Deutsch.
- Ausgabe nur im strukturierten Schema.
""".strip()


class ContextAssistService:
    """Small helper service for assist suggestions."""

    def __init__(self) -> None:
        self.agent = Agent(
            create_model(config.default_provider, config.default_model),
            output_type=AssistSuggestionResult,
            system_prompt=ASSIST_SYSTEM_PROMPT,
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
            "Aufgabe: Formuliere die folgende Nutzereingabe präziser, professionell und kompakt, "
            "ohne neue Fakten zu erfinden.\n"
            f"Nutzereingabe:\n{text}"
        )
        try:
            result = await self.agent.run(prompt)
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
            f"Bestehender Entwurf des Nutzers:\n{user_value.strip() or '(leer)'}\n\n"
            f"Website URL: {url}\n"
            "Auszug von der Website (gekürzt):\n"
            f"{page_text}\n\n"
            "Aufgabe: Formuliere einen knappen, sachlichen Tätigkeitsbereich für das Unternehmen."
        )
        try:
            result = await self.agent.run(prompt)
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
