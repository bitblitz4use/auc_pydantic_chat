"""Pydantic AI requirement extraction for compliance chunks."""

import hashlib
import logging
import re

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from app.agents.providers import create_model
from app.compliance_graph.schema import (
    IngestedDiagnosticQuestion,
    IngestedEvidenceHint,
    IngestedQuestionInfluence,
)

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

QUESTION_SYSTEM_PROMPT = """
You generate diagnostic compliance questions for extracted requirement units.

Rules:
- Use the required document language exactly.
- Questions must be answerable and useful for applicability or prioritization.
- Create concise prompts; avoid legal reinterpretation.
- Return influences with valid mode and when_value.
- Valid influence modes: `exclude_if`, `include_if`, `prioritize_if`, `unclear_if`, `gaps_if`, `satisfies_if`.
- For direct implementation/fulfillment checks, prefer paired closure logic:
  `satisfies_if` for positive answers and `gaps_if` for negative answers.
- Prefer boolean questions when possible, but use `single_choice`, `multi_choice`, or `text` when fitting.
- For `boolean`, allowed_values must be `["true", "false"]`.
- For `single_choice` and `multi_choice`, provide non-empty allowed_values.
- Output must match the structured schema only.
""".strip()

EVIDENCE_SYSTEM_PROMPT = """
You propose practical evidence hints for requirement units.

Rules:
- Use the required document language exactly.
- Produce concrete, auditable evidence hints (documents, records, artifacts).
- Keep each evidence hint practical and concise.
- Include one short optional example where useful.
- Do not invent legal obligations; stay aligned to the requirement statement.
- Return output in the required structured schema only.
""".strip()


class QuestionCandidate(BaseModel):
    """Model output for a single generated diagnostic question."""

    question_key: str
    prompt: str
    answer_type: str = "boolean"
    allowed_values: list[str] = Field(default_factory=list)
    ru_key: str
    mode: str = "prioritize_if"
    when_value: str = "true"


class QuestionExtractionResult(BaseModel):
    """Structured extraction result for diagnostic questions."""

    questions: list[QuestionCandidate] = Field(default_factory=list)


class EvidenceCandidate(BaseModel):
    """Model output for a single evidence hint proposal."""

    ru_key: str
    title: str
    hint: str
    example: str = ""


class EvidenceExtractionResult(BaseModel):
    """Structured extraction result for requirement evidence hints."""

    evidence: list[EvidenceCandidate] = Field(default_factory=list)


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


class ComplianceQuestionExtractor:
    """Generate DiagnosticQuestion + INFLUENCES candidates from requirements."""

    def __init__(self, provider: str, model_name: str):
        self.model_id = f"{provider}:{model_name}"
        self.agent = Agent(
            create_model(provider, model_name),
            output_type=QuestionExtractionResult,
            system_prompt=QUESTION_SYSTEM_PROMPT,
        )

    async def extract(
        self,
        standard_key: str,
        clause_path: str,
        requirements: list[dict[str, str]],
        language: str,
    ) -> list[IngestedDiagnosticQuestion]:
        if not requirements:
            return []

        prompt = (
            f"Standard key: {standard_key}\n"
            f"Clause path: {clause_path}\n"
            f"Required output language: {language}\n"
            "Generate one useful diagnostic question per requirement when possible.\n"
            "Return question_key values that are stable and URL-safe.\n"
            f"Requirements JSON: {requirements}"
        )
        try:
            result = await self.agent.run(prompt)
            output = result.output
            if isinstance(output, QuestionExtractionResult):
                questions = self._normalize(output.questions, language)
                if questions and not self._looks_expected_language(questions, language):
                    retry_prompt = (
                        f"{prompt}\n\n"
                        "You returned questions in the wrong language. "
                        f"Rewrite all prompts strictly in '{language}'."
                    )
                    retry = await self.agent.run(retry_prompt)
                    retry_output = retry.output
                    if isinstance(retry_output, QuestionExtractionResult):
                        return self._normalize(retry_output.questions, language)
                return questions
        except Exception as error:
            logger.warning("Question extraction agent failed: %s", error)

        return self._fallback(standard_key, clause_path, requirements, language)

    def _normalize(
        self,
        candidates: list[QuestionCandidate],
        language: str,
    ) -> list[IngestedDiagnosticQuestion]:
        grouped: dict[str, IngestedDiagnosticQuestion] = {}
        for item in candidates:
            q_key = self._normalize_question_key(item.question_key)
            if not q_key or not item.prompt.strip() or not item.ru_key.strip():
                continue
            mode = self._normalize_mode(item.mode)
            answer_type = self._normalize_answer_type(item.answer_type)
            allowed_values = self._normalize_allowed_values(
                item.allowed_values,
                answer_type=answer_type,
                language=language,
            )
            when_value = self._normalize_when_value(
                item.when_value,
                mode=mode,
                answer_type=answer_type,
                allowed_values=allowed_values,
            )

            if q_key not in grouped:
                grouped[q_key] = IngestedDiagnosticQuestion(
                    question_key=q_key,
                    prompt=" ".join(item.prompt.split()),
                    answer_type=answer_type,
                    allowed_values=allowed_values,
                    language=language,
                    status="draft",
                    influences=[],
                )
            grouped[q_key].influences.append(
                IngestedQuestionInfluence(
                    ru_key=item.ru_key,
                    mode=mode,
                    when_value=when_value,
                )
            )
        questions = list(grouped.values())
        self._enforce_boolean_closure_pairs(questions)
        return questions

    def _fallback(
        self,
        standard_key: str,
        clause_path: str,
        requirements: list[dict[str, str]],
        language: str,
    ) -> list[IngestedDiagnosticQuestion]:
        questions: list[IngestedDiagnosticQuestion] = []
        prefix = "Ist folgender Punkt umgesetzt" if language.casefold().startswith("de") else "Is the following item implemented"
        for idx, requirement in enumerate(requirements):
            statement = " ".join(requirement["statement"].split())
            prompt = f"{prefix}: {statement}?"
            q_key = self._normalize_question_key(
                f"{standard_key}.{clause_path}.ru{idx}.implementation_check"
            )
            questions.append(
                IngestedDiagnosticQuestion(
                    question_key=q_key,
                    prompt=prompt,
                    answer_type="boolean",
                    allowed_values=["true", "false"],
                    language=language,
                    status="draft",
                    influences=[
                        IngestedQuestionInfluence(
                            ru_key=requirement["ru_key"],
                            mode="satisfies_if",
                            when_value="true",
                        ),
                        IngestedQuestionInfluence(
                            ru_key=requirement["ru_key"],
                            mode="gaps_if",
                            when_value="false",
                        ),
                    ],
                )
            )
        return questions

    @staticmethod
    def _normalize_question_key(value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9._-]+", ".", value.strip()).strip(".")
        return cleaned.lower()

    @staticmethod
    def _normalize_mode(value: str) -> str:
        mode = value.strip().lower()
        allowed = {
            "exclude_if",
            "include_if",
            "prioritize_if",
            "unclear_if",
            "gaps_if",
            "satisfies_if",
        }
        return mode if mode in allowed else "prioritize_if"

    @staticmethod
    def _normalize_answer_type(value: str) -> str:
        answer_type = value.strip().lower()
        allowed = {"boolean", "single_choice", "multi_choice", "text"}
        return answer_type if answer_type in allowed else "boolean"

    @staticmethod
    def _normalize_allowed_values(
        values: list[str],
        answer_type: str,
        language: str,
    ) -> list[str]:
        if answer_type == "text":
            return []
        if answer_type == "boolean":
            return ["true", "false"]

        cleaned = []
        seen: set[str] = set()
        for value in values:
            normalized = " ".join(value.split())
            if not normalized:
                continue
            key = normalized.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(normalized)

        if cleaned:
            return cleaned

        if language.casefold().startswith("de"):
            return ["ja", "nein"]
        return ["yes", "no"]

    @staticmethod
    def _normalize_when_value(
        value: str,
        mode: str,
        answer_type: str,
        allowed_values: list[str],
    ) -> str:
        normalized = value.strip().lower()
        if answer_type == "boolean" and normalized not in {"true", "false"}:
            # Closure defaults must be deterministic to avoid silent drift.
            if mode == "gaps_if":
                return "false"
            if mode == "satisfies_if":
                return "true"
            return "true"
        if answer_type in {"single_choice", "multi_choice"} and allowed_values:
            allowed_normalized = {item.casefold() for item in allowed_values}
            if normalized not in allowed_normalized:
                return allowed_values[0]
        return normalized or "true"

    @staticmethod
    def _enforce_boolean_closure_pairs(questions: list[IngestedDiagnosticQuestion]) -> None:
        """
        Ensure boolean closure rules are paired per question+requirement.
        This keeps runtime state transitions deterministic:
        true -> addressed and false -> gap (or inverse variants if authored that way).
        """
        closure_counterparts = {
            ("satisfies_if", "true"): ("gaps_if", "false"),
            ("satisfies_if", "false"): ("gaps_if", "true"),
            ("gaps_if", "true"): ("satisfies_if", "false"),
            ("gaps_if", "false"): ("satisfies_if", "true"),
        }

        for question in questions:
            if question.answer_type != "boolean":
                continue

            by_ru: dict[str, set[tuple[str, str]]] = {}
            for influence in question.influences:
                by_ru.setdefault(influence.ru_key, set()).add(
                    (influence.mode, influence.when_value)
                )

            for ru_key, existing in by_ru.items():
                additions: list[IngestedQuestionInfluence] = []
                for key, counterpart in closure_counterparts.items():
                    if key in existing and counterpart not in existing:
                        additions.append(
                            IngestedQuestionInfluence(
                                ru_key=ru_key,
                                mode=counterpart[0],
                                when_value=counterpart[1],
                            )
                        )
                if additions:
                    question.influences.extend(additions)

    @staticmethod
    def _looks_expected_language(
        questions: list[IngestedDiagnosticQuestion],
        language: str,
    ) -> bool:
        sample = " ".join(q.prompt for q in questions[:10]).casefold()
        lang = language.casefold().strip()
        if lang.startswith("de"):
            return " the " not in sample and " shall " not in sample and " should " not in sample
        if lang.startswith("en"):
            return " der " not in sample and " die " not in sample and " das " not in sample
        return True


class ComplianceEvidenceExtractor:
    """Generate EvidenceType hint candidates from extracted requirements."""

    def __init__(self, provider: str, model_name: str):
        self.model_id = f"{provider}:{model_name}"
        self.agent = Agent(
            create_model(provider, model_name),
            output_type=EvidenceExtractionResult,
            system_prompt=EVIDENCE_SYSTEM_PROMPT,
        )

    async def extract(
        self,
        standard_key: str,
        clause_path: str,
        requirements: list[dict[str, str]],
        language: str,
    ) -> dict[str, list[IngestedEvidenceHint]]:
        if not requirements:
            return {}

        prompt = (
            f"Standard key: {standard_key}\n"
            f"Clause path: {clause_path}\n"
            f"Required output language: {language}\n"
            "Return 1 to 3 practical evidence hints per requirement where possible.\n"
            f"Requirements JSON: {requirements}"
        )
        try:
            result = await self.agent.run(prompt)
            output = result.output
            if isinstance(output, EvidenceExtractionResult):
                grouped = self._normalize(output.evidence, language)
                if grouped and not self._looks_expected_language(grouped, language):
                    retry_prompt = (
                        f"{prompt}\n\n"
                        "You returned evidence hints in the wrong language. "
                        f"Rewrite all hints strictly in '{language}'."
                    )
                    retry = await self.agent.run(retry_prompt)
                    retry_output = retry.output
                    if isinstance(retry_output, EvidenceExtractionResult):
                        return self._normalize(retry_output.evidence, language)
                return grouped
        except Exception as error:
            logger.warning("Evidence extraction agent failed: %s", error)

        return self._fallback(requirements, language)

    def _normalize(
        self,
        candidates: list[EvidenceCandidate],
        language: str,
    ) -> dict[str, list[IngestedEvidenceHint]]:
        grouped: dict[str, list[IngestedEvidenceHint]] = {}
        seen_per_ru: dict[str, set[tuple[str, str, str]]] = {}
        for item in candidates:
            ru_key = item.ru_key.strip()
            title = " ".join(item.title.split())
            hint = " ".join(item.hint.split())
            example = " ".join(item.example.split())
            if not ru_key or not title or not hint:
                continue

            seen = seen_per_ru.setdefault(ru_key, set())
            dedupe_key = (title.casefold(), hint.casefold(), example.casefold())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            evidence = IngestedEvidenceHint(
                evidence_key=self.make_evidence_identity(ru_key, title, hint, example),
                title=title,
                hint=hint,
                example=example,
                language=language,
                status="draft",
            )
            grouped.setdefault(ru_key, []).append(evidence)

        for ru_key, values in grouped.items():
            grouped[ru_key] = values[:3]
        return grouped

    @staticmethod
    def make_evidence_identity(ru_key: str, title: str, hint: str, example: str) -> str:
        digest = hashlib.sha1(f"{ru_key}:{title}:{hint}:{example}".encode("utf-8")).hexdigest()
        return f"{ru_key}::ev::{digest[:12]}"

    @staticmethod
    def _fallback(
        requirements: list[dict[str, str]],
        language: str,
    ) -> dict[str, list[IngestedEvidenceHint]]:
        grouped: dict[str, list[IngestedEvidenceHint]] = {}
        for requirement in requirements:
            ru_key = requirement.get("ru_key", "").strip()
            if not ru_key:
                continue
            if language.casefold().startswith("de"):
                title = "Nachweisdokument"
                hint = "Dokumentierter Nachweis zur Umsetzung der Anforderung"
                example = "Freigegebene Verfahrensanweisung, Protokoll oder Rollenmatrix"
            else:
                title = "Evidence record"
                hint = "Documented evidence that the requirement is implemented"
                example = "Approved procedure, meeting record, or responsibility matrix"
            grouped[ru_key] = [
                IngestedEvidenceHint(
                    evidence_key=ComplianceEvidenceExtractor.make_evidence_identity(
                        ru_key,
                        title,
                        hint,
                        example,
                    ),
                    title=title,
                    hint=hint,
                    example=example,
                    language=language,
                    status="draft",
                )
            ]
        return grouped

    @staticmethod
    def _looks_expected_language(
        grouped: dict[str, list[IngestedEvidenceHint]],
        language: str,
    ) -> bool:
        sample = " ".join(
            f"{item.title} {item.hint} {item.example}"
            for items in grouped.values()
            for item in items
        ).casefold()
        lang = language.casefold().strip()
        if lang.startswith("de"):
            return " the " not in sample and " shall " not in sample and " should " not in sample
        if lang.startswith("en"):
            return " der " not in sample and " die " not in sample and " das " not in sample
        return True
