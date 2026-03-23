"""Pydantic AI requirement extraction for compliance chunks."""

import hashlib
import logging
import re

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from app.agents.providers import create_model

logger = logging.getLogger(__name__)


class RequirementExtractionResult(BaseModel):
    """Structured extraction result for one chunk."""

    requirements: list[str] = Field(
        default_factory=list,
        description="Atomic requirement statements found in the chunk.",
    )


EXTRACTION_SYSTEM_PROMPT = """
You extract compliance requirements from one normative text chunk.

Rules:
- Extract ALL explicit requirements in the chunk, no skipping.
- Keep each requirement atomic and complete.
- Preserve normative meaning; do not invent requirements.
- Keep output language exactly equal to the requested document language.
- If there are no requirements, return an empty list.
- Output must match the structured schema only.
""".strip()


class ComplianceRequirementExtractor:
    """Thin wrapper around a Pydantic AI Agent for chunk extraction."""

    def __init__(self, provider: str, model_name: str):
        self.model_id = f"{provider}:{model_name}"
        self.agent = Agent(
            create_model(provider, model_name),
            output_type=RequirementExtractionResult,
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
        )

    async def extract(self, chunk_text: str, clause_path: str, language: str) -> list[str]:
        """Extract all requirements from one chunk."""
        prompt = (
            f"Clause path: {clause_path}\n\n"
            f"Required output language: {language}\n"
            "Important: Return every requirement in the same language as the chunk "
            "and the required output language. Do not translate to another language.\n\n"
            "Extract all explicit requirements from this chunk:\n\n"
            f"{chunk_text}"
        )
        try:
            result = await self.agent.run(prompt)
            output = result.output
            if isinstance(output, RequirementExtractionResult):
                extracted = self._dedupe(output.requirements)
                if extracted and not self._looks_expected_language(extracted, language):
                    retry_prompt = (
                        f"{prompt}\n\n"
                        "You returned requirements in the wrong language. "
                        f"Rewrite all requirements strictly in '{language}'."
                    )
                    retry_result = await self.agent.run(retry_prompt)
                    retry_output = retry_result.output
                    if isinstance(retry_output, RequirementExtractionResult):
                        return self._dedupe(retry_output.requirements)
                return extracted
        except Exception as error:
            logger.warning("Requirement extraction agent failed: %s", error)

        # Minimal fallback to keep pipeline usable in POC mode.
        return self._fallback_extract(chunk_text)

    @staticmethod
    def make_requirement_identity(chunk_key: str, statement: str, index: int) -> str:
        """Create stable-ish key for requirement nodes."""
        digest = hashlib.sha1(f"{chunk_key}:{index}:{statement}".encode("utf-8")).hexdigest()
        return f"{chunk_key}::ru::{digest[:12]}"

    @staticmethod
    def summarize_title(statement: str) -> str:
        """Short title used for graph node display."""
        compact = " ".join(statement.split())
        return compact if len(compact) <= 120 else f"{compact[:117]}..."

    @staticmethod
    def _dedupe(requirements: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for raw in requirements:
            value = " ".join(raw.split())
            if not value:
                continue
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            ordered.append(value)
        return ordered

    def _fallback_extract(self, text: str) -> list[str]:
        """Heuristic fallback: keep lines/sentences with normative modals."""
        normalized = text.replace("\r", "\n")
        candidates = re.split(r"[\n\.]+", normalized)
        matched = []
        for candidate in candidates:
            fragment = " ".join(candidate.split())
            if not fragment:
                continue
            lower = fragment.casefold()
            if any(token in lower for token in (" muss ", " shall ", " should ", " hat ")):
                matched.append(fragment)
        return self._dedupe(matched)

    @staticmethod
    def _looks_expected_language(requirements: list[str], language: str) -> bool:
        """
        Lightweight guard to detect obvious language drift.
        Keeps POC simple while enforcing the declared request language.
        """
        sample = " ".join(requirements[:10]).casefold()
        lang = language.casefold().strip()
        if lang.startswith("de"):
            return " the " not in sample and " shall " not in sample and " should " not in sample
        if lang.startswith("en"):
            return " der " not in sample and " die " not in sample and " das " not in sample
        return True
