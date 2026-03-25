"""Typed contracts for compliance context-mode runtime."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


SUPPORTED_ANSWER_TYPES = {"boolean", "single_choice", "multi_choice", "text", "number", "file_upload"}


class ContextAnswerInput(BaseModel):
    """One structured answer submitted from the UI."""

    question_key: str = Field(min_length=1)
    value: Any
    manual_rationale: str | None = None
    manual_citations: list[dict[str, Any]] | None = None
    manual_evidence_text: str | None = None
    trigger_auto_challenge: bool | None = None

    model_config = ConfigDict(extra="ignore")


class ContextAssistInput(BaseModel):
    """Assist action request for one context question."""

    question_key: str = Field(min_length=1)
    tool: Literal["rewrite", "web_lookup"]
    value: Any = None

    model_config = ConfigDict(extra="ignore")


class ContextControlInput(BaseModel):
    """Deterministic questionnaire control actions."""

    action: Literal["pause", "resume", "stop", "status"]
    reason: str | None = None
    confirm: bool | None = None

    model_config = ConfigDict(extra="ignore")


class ContextSessionInput(BaseModel):
    """Session payload submitted on each context turn."""

    session_id: str | None = None
    standard_keys: list[str] | None = None
    answer: ContextAnswerInput | None = None
    assist: ContextAssistInput | None = None
    control: ContextControlInput | None = None
    free_text: str | None = None

    model_config = ConfigDict(extra="ignore")


class QuestionRenderModel(BaseModel):
    """Strict question payload used by JSX renderer."""

    question_key: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    answer_type: Literal["boolean", "single_choice", "multi_choice", "text", "number", "file_upload"]
    allowed_values: list[str] = Field(default_factory=list)
    options: list[dict[str, str]] = Field(default_factory=list)
    assist_tools: list[Literal["rewrite", "web_lookup"]] = Field(default_factory=list)
    prefill_value: Any = None
    assist_note: str = ""
    language: str = "de"


class QuestionConversationCue(BaseModel):
    """Optional conversational guidance rendered around a question card."""

    lead_text: str = ""
    followup_text: str = ""


class QuestionBriefingDocument(BaseModel):
    """Compact document citation info for one question."""

    standard_key: str = ""
    title: str = ""
    version_label: str = ""


class QuestionBriefingClause(BaseModel):
    """Clause reference shown to users."""

    clause_id: str = ""
    clause_path: str = ""
    heading_text: str = ""


class QuestionBriefingChunk(BaseModel):
    """Chunk reference and preview; page metadata is intentionally omitted for now."""

    chunk_key: str = ""
    preview: str = ""


class QuestionBriefingEvidence(BaseModel):
    """Evidence hint shown in question card support area."""

    title: str = ""
    hint: str = ""
    example: str = ""


class ContextChallengeChunkEvidence(BaseModel):
    """Document-grounded challenge evidence item for one requirement/question."""

    chunk_key: str = ""
    document_title: str = ""
    page_no: str = ""
    heading_path: str = ""
    source_ref: str = ""
    method: str = ""
    confidence: float = 0.0
    rationale: str = ""


class ContextChallengeBriefing(BaseModel):
    """Additive context-document challenge payload for the question card."""

    status: str = ""
    run_recommended: bool = False
    note: str = ""
    chunks: list[ContextChallengeChunkEvidence] = Field(default_factory=list)


class QuestionBriefingImpact(BaseModel):
    """Impact metadata for one question in active scope."""

    requirements_count: int = 0


class QuestionBriefing(BaseModel):
    """User-facing support payload for one question card."""

    document: QuestionBriefingDocument = Field(default_factory=QuestionBriefingDocument)
    clause: QuestionBriefingClause = Field(default_factory=QuestionBriefingClause)
    chunk: QuestionBriefingChunk = Field(default_factory=QuestionBriefingChunk)
    summary: str = ""
    evidence: list[QuestionBriefingEvidence] = Field(default_factory=list)
    context_challenge: ContextChallengeBriefing = Field(default_factory=ContextChallengeBriefing)
    impact: QuestionBriefingImpact = Field(default_factory=QuestionBriefingImpact)


class ProgressCounters(BaseModel):
    """Session progress values shown in UI payload and text fallback."""

    requirements_total: int = 0
    requirements_open: int = 0
    requirements_addressed: int = 0
    requirements_gap: int = 0
    requirements_not_applicable: int = 0
    requirements_unclear: int = 0
    unanswered_questions: int = 0


class QuestionCardPayload(BaseModel):
    """Encoded payload consumed by `<CtxQuestionCard />`."""

    session_id: str
    standard_keys: list[str] = Field(default_factory=list)
    question: QuestionRenderModel
    conversation: QuestionConversationCue | None = None
    question_briefing: QuestionBriefing | None = None
    progress: ProgressCounters


def parse_context_session_input(body_data: dict[str, Any]) -> ContextSessionInput:
    """Resolve context session payload from flat or nested SDK body."""
    nested = body_data.get("body")
    if isinstance(nested, dict):
        payload = nested.get("contextSession")
        if isinstance(payload, dict):
            return ContextSessionInput.model_validate(payload)

    payload = body_data.get("contextSession")
    if isinstance(payload, dict):
        return ContextSessionInput.model_validate(payload)

    return ContextSessionInput()


def resolve_conversation_id(body_data: dict[str, Any]) -> str | None:
    """Best-effort extraction of chat conversation id from SDK payload."""
    nested = body_data.get("body")
    candidates: list[Any] = []
    if isinstance(nested, dict):
        candidates.extend(
            [
                nested.get("chatId"),
                nested.get("chat_id"),
                nested.get("conversationId"),
                nested.get("conversation_id"),
                nested.get("id"),
            ]
        )
    candidates.extend(
        [
            body_data.get("chatId"),
            body_data.get("chat_id"),
            body_data.get("conversationId"),
            body_data.get("conversation_id"),
            body_data.get("id"),
        ]
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def resolve_latest_user_text(body_data: dict[str, Any]) -> str:
    """Extract latest user text from AI SDK message payload."""
    nested = body_data.get("body")
    messages = None
    if isinstance(nested, dict) and isinstance(nested.get("messages"), list):
        messages = nested.get("messages")
    elif isinstance(body_data.get("messages"), list):
        messages = body_data.get("messages")
    if not isinstance(messages, list):
        return ""

    for message in reversed(messages):
        if not isinstance(message, dict) or message.get("role") != "user":
            continue
        parts = message.get("parts")
        if isinstance(parts, list):
            text = "".join(
                str(part.get("text") or "")
                for part in parts
                if isinstance(part, dict) and part.get("type") == "text"
            ).strip()
            if text:
                return text
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""
