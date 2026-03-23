"""Schemas for compliance graph ingestion pipeline."""

from typing import Literal

from pydantic import BaseModel, Field


class IngestedRequirement(BaseModel):
    """Atomic requirement extracted from one chunk."""

    ru_key: str
    statement: str
    title: str


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
    heading_blocklist: list[str] = Field(
        default_factory=lambda: [
            "inhaltsverzeichnis",
            "table of contents",
            "vorwort",
            "einleitung",
        ]
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
    model_id: str
