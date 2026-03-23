"""Schemas for compliance graph ingestion pipeline."""

from typing import Literal

from pydantic import BaseModel, Field

FIXED_HEADING_BLOCKLIST = [
    "inhaltsverzeichnis",
    "table of contents",
    "vorwort",
    "einleitung",
]


class IngestedEvidenceHint(BaseModel):
    """Draft evidence hint linked to one requirement."""

    evidence_key: str
    title: str
    hint: str
    example: str = ""
    language: str
    status: Literal["draft", "reviewed", "published"] = "draft"


class IngestedRequirement(BaseModel):
    """Atomic requirement extracted from one chunk."""

    ru_key: str
    statement: str
    title: str
    language: str
    evidence_hints: list[IngestedEvidenceHint] = Field(default_factory=list)


class IngestedChunk(BaseModel):
    """Chunk persisted into Neo4j and linked to extracted requirements."""

    standard_key: str
    chunk_key: str
    clause_id: str
    clause_path: str
    heading_text: str
    text_contextualized: str
    text_raw: str
    requirements: list[IngestedRequirement] = Field(default_factory=list)


class IngestedQuestionInfluence(BaseModel):
    """A single question-to-requirement influence edge."""

    ru_key: str
    mode: Literal[
        "exclude_if",
        "include_if",
        "prioritize_if",
        "unclear_if",
        "gaps_if",
        "satisfies_if",
    ]
    when_value: str


class IngestedDiagnosticQuestion(BaseModel):
    """Diagnostic question generated in master graph production."""

    question_key: str
    prompt: str
    answer_type: Literal["boolean", "single_choice", "multi_choice", "text"] = "boolean"
    allowed_values: list[str] = Field(default_factory=list)
    language: str
    status: Literal["draft", "reviewed", "published"] = "draft"
    influences: list[IngestedQuestionInfluence] = Field(default_factory=list)


class ComplianceIngestRequestMetadata(BaseModel):
    """Metadata for the ingested root normative document."""

    standard_key: str = Field(
        description="Stable key, e.g. ISO9001:2015:de or AT-BGBl-II:AStV:2026-03-23"
    )
    title: str
    language: str = "de"
    source_kind: Literal["standard", "statute", "regulation"] = "standard"
    version_label: str | None = None
    jurisdiction: str | None = None
    model_id: str | None = Field(
        default=None,
        description="Optional provider:model_name for extraction agent",
    )


class ComplianceIngestResponse(BaseModel):
    """Response payload for one-shot concept ingestion endpoint."""

    status: str = "success"
    standard_key: str
    source_filename: str
    chunks_total: int
    chunks_kept: int
    requirements_extracted: int
    clauses_written: int
    questions_generated: int = 0
    influences_generated: int = 0
    evidence_hints_generated: int = 0
    model_id: str
