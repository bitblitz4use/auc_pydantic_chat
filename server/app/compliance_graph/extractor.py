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

    async def extract(self, chunk_text: str, clause_path: str) -> list[str]:
        """Extract all requirements from one chunk."""
        prompt = (
            f"Clause path: {clause_path}\n\n"
            "Extract all explicit requirements from this chunk:\n\n"
            f"{chunk_text}"
        )
        try:
            result = await self.agent.run(prompt)
            output = result.output
            if isinstance(output, RequirementExtractionResult):
                return self._dedupe(output.requirements)
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
