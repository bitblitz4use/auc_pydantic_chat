"""Session-scoped context document ingest, retrieval, and challenge execution."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker import HierarchicalChunker
from neo4j import AsyncDriver
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qm

from app.agents.providers import create_model, parse_model_id
from app.config import config
from app.storage.client import get_minio_client

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_DIMENSIONS = 1536
CHALLENGE_STATES = {"compliant", "needs_improvement", "insufficient_evidence"}
DOC_WINDOW_SIZE = 24
MIN_TEXT_LENGTH_FOR_FAST_PASS = 500


@dataclass(slots=True)
class ExtractionOutcome:
    chunks: list[dict[str, Any]]
    warnings: list[str]
    pages_total: int
    pages_processed: int
    windows_total: int
    windows_processed: int


class ContextDocumentPageRefHelper:
    """Extract page numbers from chunk metadata across multiple Docling shapes."""

    PAGE_KEYS = {"page_no", "page", "page_number", "page_index", "page_idx"}

    @staticmethod
    def collect_page_numbers(meta: Any) -> list[int]:
        values: set[int] = set()
        visited: set[int] = set()

        def visit(node: Any, depth: int) -> None:
            if node is None or depth > 7:
                return
            node_id = id(node)
            if node_id in visited:
                return
            visited.add(node_id)

            if isinstance(node, (int, float)):
                if int(node) > 0:
                    values.add(int(node))
                return
            if isinstance(node, str):
                stripped = node.strip()
                if stripped.isdigit():
                    parsed = int(stripped)
                    if parsed > 0:
                        values.add(parsed)
                return
            if isinstance(node, dict):
                for key, value in node.items():
                    key_text = str(key).strip().lower()
                    if key_text in ContextDocumentPageRefHelper.PAGE_KEYS:
                        visit(value, depth + 1)
                        continue
                    if key_text in {"prov", "provenance", "doc_items", "items", "meta"}:
                        visit(value, depth + 1)
                return
            if isinstance(node, (list, tuple, set)):
                for item in node:
                    visit(item, depth + 1)
                return

            # Object fallback: inspect known provenance attrs first.
            for attr in ("page_no", "page", "page_number", "page_index", "page_idx", "prov", "provenance", "doc_items", "meta"):
                try:
                    value = getattr(node, attr, None)
                except Exception:
                    value = None
                if value is not None:
                    visit(value, depth + 1)

            # Pydantic objects often expose model_dump for nested data.
            model_dump = getattr(node, "model_dump", None)
            if callable(model_dump):
                try:
                    dumped = model_dump()
                except Exception:
                    dumped = None
                if dumped is not None:
                    visit(dumped, depth + 1)

        visit(meta, 0)
        return sorted(values)


@dataclass(slots=True)
class RetrievedChunk:
    context_chunk_id: str
    text_contextualized: str
    heading_path: str
    page_no: str
    source_ref: str
    document_title: str
    lexical_score: float
    dense_score: float
    fused_score: float
    method: str


class ChallengeEvaluation(BaseModel):
    """Structured challenge verdict for one requirement."""

    challenge_state: str = Field(default="insufficient_evidence")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    citations: list[str] = Field(default_factory=list)


class ContextDocumentService:
    """Coordinates ingest and challenge runs for session context documents."""

    def __init__(
        self,
        neo4j_driver: AsyncDriver,
        qdrant_client: AsyncQdrantClient | None,
        model_id: str | None = None,
    ) -> None:
        self.neo4j_driver = neo4j_driver
        self.qdrant_client = qdrant_client
        self.converter_fast = self._build_pdf_converter(do_ocr=False)
        self.converter_ocr = self._build_pdf_converter(do_ocr=True)
        self.chunker = HierarchicalChunker()
        self.embedding_provider = (config.embedding_provider or "openai").strip()
        self.embedding_model = (config.embedding_model or "text-embedding-3-small").strip()
        self.embedding_dimensions = max(1, int(config.embedding_dimensions or DEFAULT_EMBEDDING_DIMENSIONS))
        self._embedding_client = self._create_embedding_client()
        provider = config.default_provider
        model_name = config.default_model
        if model_id:
            try:
                provider, model_name = parse_model_id(model_id)
            except ValueError:
                pass
        self.challenge_agent = Agent(
            create_model(provider, model_name),
            output_type=ChallengeEvaluation,
            system_prompt=(
                "Du bewertest eine Compliance-Anforderung anhand bereitgestellter Kontextdokument-Chunks. "
                "Nutze nur gelieferte Evidenz. Antworte strikt im Schema. "
                "challenge_state muss einer von compliant|needs_improvement|insufficient_evidence sein."
            ),
        )

    def _build_pdf_converter(self, *, do_ocr: bool) -> DocumentConverter:
        pipeline_options = PdfPipelineOptions(
            do_ocr=do_ocr,
            force_backend_text=not do_ocr,
            do_table_structure=False,
            generate_page_images=False,
            generate_picture_images=False,
            generate_parsed_pages=False,
            document_timeout=180.0,
            ocr_batch_size=1 if do_ocr else 2,
            layout_batch_size=1 if do_ocr else 2,
            table_batch_size=1,
            queue_max_size=12 if do_ocr else 24,
            batch_polling_interval_seconds=0.3,
        )
        return DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )

    def _create_embedding_client(self) -> AsyncOpenAI | None:
        provider_raw = self.embedding_provider.strip()
        provider = provider_raw.lower()

        if provider in {"", "openai"}:
            if not config.openai_api_key.strip():
                logger.warning("Embedding provider=openai but OPENAI_API_KEY is not configured.")
                return None
            return AsyncOpenAI(api_key=config.openai_api_key.strip())

        if provider == "ollama":
            base_url = self._normalize_openai_compatible_base_url(config.ollama_base_url)
            api_key = config.embedding_api_key.strip() or "ollama"
            logger.info("Embedding provider=ollama via %s", base_url)
            return AsyncOpenAI(base_url=base_url, api_key=api_key)

        if provider_raw.startswith("http://") or provider_raw.startswith("https://"):
            base_url = self._normalize_openai_compatible_base_url(provider_raw)
            api_key = config.embedding_api_key.strip() or "ollama"
            logger.info("Embedding provider=url via %s", base_url)
            return AsyncOpenAI(base_url=base_url, api_key=api_key)

        logger.warning(
            "Unsupported embedding provider '%s'. Expected openai, ollama, or http(s) URL.",
            provider_raw,
        )
        return None

    @staticmethod
    def _normalize_openai_compatible_base_url(value: str) -> str:
        base = value.strip().rstrip("/")
        if base.endswith("/v1"):
            return base
        return f"{base}/v1"

    async def upload_document(
        self,
        *,
        session_id: str,
        file_content: bytes,
        filename: str,
        content_type: str,
    ) -> dict[str, Any]:
        context_document_id = str(uuid.uuid4())
        ingest_job_id = str(uuid.uuid4())
        safe_name = Path(filename or "context-document.bin").name
        object_key = f"context-documents/{session_id}/{context_document_id}/{safe_name}"

        await self._create_document_record(
            session_id=session_id,
            context_document_id=context_document_id,
            ingest_job_id=ingest_job_id,
            filename=safe_name,
            object_key=object_key,
            content_type=content_type or "application/octet-stream",
        )
        self._store_raw_file(object_key=object_key, file_content=file_content, content_type=content_type)
        asyncio.create_task(
            self._run_ingest_job(
                session_id=session_id,
                context_document_id=context_document_id,
                ingest_job_id=ingest_job_id,
                object_key=object_key,
                file_content=file_content,
                filename=safe_name,
            )
        )
        return {
            "context_document_id": context_document_id,
            "ingest_job_id": ingest_job_id,
            "status": "queued",
            "filename": safe_name,
        }

    async def get_document_status(self, context_document_id: str) -> dict[str, Any] | None:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (d:ContextDocument {context_document_id: $context_document_id})
                RETURN
                    d.context_document_id AS context_document_id,
                    d.session_id AS session_id,
                    d.filename AS filename,
                    coalesce(d.ingest_status, "unknown") AS ingest_status,
                    coalesce(d.ingest_error, "") AS ingest_error,
                    coalesce(d.ingest_phase, "") AS ingest_phase,
                    coalesce(d.pages_total, 0) AS pages_total,
                    coalesce(d.pages_processed, 0) AS pages_processed,
                    coalesce(d.windows_total, 0) AS windows_total,
                    coalesce(d.windows_processed, 0) AS windows_processed,
                    coalesce(d.chunk_count, 0) AS chunk_count,
                    coalesce(d.indexed_chunk_count, 0) AS indexed_chunk_count,
                    coalesce(d.ingest_job_id, "") AS ingest_job_id
                """,
                context_document_id=context_document_id,
            )
            row = await result.single()
        if not row:
            return None
        payload = dict(row)
        pages_total = int(payload.get("pages_total") or 0)
        pages_processed = int(payload.get("pages_processed") or 0)
        if pages_total > 0:
            payload["progress_pct"] = round(min(100.0, (pages_processed / pages_total) * 100.0), 2)
        else:
            payload["progress_pct"] = 0.0
        return payload

    async def run_full_challenge(
        self,
        *,
        session_id: str,
        model_id: str | None = None,
    ) -> dict[str, Any]:
        challenge_job_id = str(uuid.uuid4())
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MERGE (s:Session {session_id: $session_id})
                SET
                    s.challenge_job_id = $challenge_job_id,
                    s.challenge_status = "queued",
                    s.challenge_started_at = datetime(),
                    s.challenge_processed = 0,
                    s.challenge_failed = 0,
                    s.challenge_requirements_total = 0
                """,
                session_id=session_id,
                challenge_job_id=challenge_job_id,
            )
        asyncio.create_task(
            self._run_challenge_job(
                session_id=session_id,
                challenge_job_id=challenge_job_id,
                model_id=model_id,
            )
        )
        return {"session_id": session_id, "challenge_job_id": challenge_job_id, "status": "queued"}

    async def get_challenge_status(self, session_id: str) -> dict[str, Any]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                RETURN
                    coalesce(s.challenge_job_id, "") AS challenge_job_id,
                    coalesce(s.challenge_status, "idle") AS status,
                    coalesce(s.challenge_requirements_total, 0) AS requirements_total,
                    coalesce(s.challenge_processed, 0) AS processed,
                    coalesce(s.challenge_failed, 0) AS failed,
                    coalesce(s.challenge_duration_ms, 0) AS duration_ms,
                    coalesce(s.challenge_baseline_confirmed_run, false) AS baseline_confirmed_run
                """,
                session_id=session_id,
            )
            row = await result.single()
        return dict(row or {})

    async def get_context_evidence(self, session_id: str) -> list[dict[str, Any]]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[hs:HAS_CHALLENGE_STATE]->(ru:RequirementUnit)
                OPTIONAL MATCH (ch:ContextChunk)-[m:MATCHES_REQUIREMENT {session_id: $session_id}]->(ru)
                RETURN
                    ru.ru_key AS ru_key,
                    hs.challenge_state AS challenge_state,
                    hs.confidence AS confidence,
                    hs.rationale AS rationale,
                    collect({
                        context_chunk_id: ch.context_chunk_id,
                        score: m.score,
                        method: m.method
                    })[0..3] AS chunks
                ORDER BY ru.ru_key
                LIMIT 200
                """,
                session_id=session_id,
            )
            return await result.data()

    async def _create_document_record(
        self,
        *,
        session_id: str,
        context_document_id: str,
        ingest_job_id: str,
        filename: str,
        object_key: str,
        content_type: str,
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MERGE (s:Session {session_id: $session_id})
                MERGE (d:ContextDocument {context_document_id: $context_document_id})
                SET
                    d.session_id = $session_id,
                    d.filename = $filename,
                    d.object_key = $object_key,
                    d.content_type = $content_type,
                    d.ingest_job_id = $ingest_job_id,
                    d.ingest_status = "queued",
                    d.ingest_phase = "queued",
                    d.pages_total = 0,
                    d.pages_processed = 0,
                    d.windows_total = 0,
                    d.windows_processed = 0,
                    d.chunk_count = 0,
                    d.indexed_chunk_count = 0,
                    d.created_at = coalesce(d.created_at, datetime()),
                    d.updated_at = datetime()
                MERGE (s)-[:HAS_CONTEXT_DOCUMENT]->(d)
                """,
                session_id=session_id,
                context_document_id=context_document_id,
                filename=filename,
                object_key=object_key,
                content_type=content_type,
                ingest_job_id=ingest_job_id,
            )

    def _store_raw_file(self, *, object_key: str, file_content: bytes, content_type: str) -> None:
        client = get_minio_client()
        client.put_object(
            config.minio_bucket,
            object_key,
            BytesIO(file_content),
            length=len(file_content),
            content_type=content_type or "application/octet-stream",
        )

    async def _run_ingest_job(
        self,
        *,
        session_id: str,
        context_document_id: str,
        ingest_job_id: str,
        object_key: str,
        file_content: bytes,
        filename: str,
    ) -> None:
        try:
            await self._set_document_status(context_document_id, "running", "")
            await self._update_ingest_progress(
                context_document_id=context_document_id,
                phase="extracting",
                pages_total=0,
                pages_processed=0,
                windows_total=0,
                windows_processed=0,
            )
            extraction = await asyncio.to_thread(self._extract_context_chunks, file_content, filename)
            chunks = extraction.chunks
            await self._update_ingest_progress(
                context_document_id=context_document_id,
                phase="indexing",
                pages_total=extraction.pages_total,
                pages_processed=extraction.pages_processed,
                windows_total=extraction.windows_total,
                windows_processed=extraction.windows_processed,
            )
            await self._write_context_chunks(
                session_id=session_id,
                context_document_id=context_document_id,
                chunks=chunks,
            )
            indexed_count = await self._index_context_chunks(
                session_id=session_id,
                context_document_id=context_document_id,
                chunks=chunks,
            )
            async with self.neo4j_driver.session() as session:
                await session.run(
                    """
                    MATCH (d:ContextDocument {context_document_id: $context_document_id})
                    SET
                        d.ingest_status = $ingest_status,
                        d.ingest_error = $ingest_error,
                        d.ingest_phase = "completed",
                        d.pages_total = $pages_total,
                        d.pages_processed = $pages_processed,
                        d.windows_total = $windows_total,
                        d.windows_processed = $windows_processed,
                        d.chunk_count = $chunk_count,
                        d.indexed_chunk_count = $indexed_chunk_count,
                        d.updated_at = datetime()
                    WITH d
                    MATCH (s:Session {session_id: $session_id})
                    SET
                        s.context_challenge_ready = true,
                        s.context_challenge_baseline_confirmed_run = coalesce(
                            s.context_challenge_baseline_confirmed_run,
                            false
                        ),
                        s.context_ingest_last_job_id = $ingest_job_id,
                        s.context_ingest_last_object_key = $object_key,
                        s.context_updated_at = datetime()
                    """,
                    context_document_id=context_document_id,
                    session_id=session_id,
                    ingest_status="completed_with_warnings" if extraction.warnings else "completed",
                    ingest_error=" | ".join(extraction.warnings),
                    pages_total=extraction.pages_total,
                    pages_processed=extraction.pages_processed,
                    windows_total=extraction.windows_total,
                    windows_processed=extraction.windows_processed,
                    chunk_count=len(chunks),
                    indexed_chunk_count=indexed_count,
                    ingest_job_id=ingest_job_id,
                    object_key=object_key,
                )
        except Exception as error:
            logger.exception("Context document ingest failed: %s", error)
            await self._set_document_status(context_document_id, "failed", str(error))

    async def _set_document_status(self, context_document_id: str, status: str, error_text: str) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (d:ContextDocument {context_document_id: $context_document_id})
                SET
                    d.ingest_status = $status,
                    d.ingest_error = $error_text,
                    d.updated_at = datetime()
                """,
                context_document_id=context_document_id,
                status=status,
                error_text=error_text,
            )

    async def _update_ingest_progress(
        self,
        *,
        context_document_id: str,
        phase: str,
        pages_total: int,
        pages_processed: int,
        windows_total: int,
        windows_processed: int,
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (d:ContextDocument {context_document_id: $context_document_id})
                SET
                    d.ingest_phase = $phase,
                    d.pages_total = $pages_total,
                    d.pages_processed = $pages_processed,
                    d.windows_total = $windows_total,
                    d.windows_processed = $windows_processed,
                    d.updated_at = datetime()
                """,
                context_document_id=context_document_id,
                phase=phase,
                pages_total=max(0, pages_total),
                pages_processed=max(0, pages_processed),
                windows_total=max(0, windows_total),
                windows_processed=max(0, windows_processed),
            )

    def _extract_context_chunks(self, file_content: bytes, filename: str) -> ExtractionOutcome:
        suffix = Path(filename).suffix or ".bin"
        tmp_path = None
        warnings: list[str] = []
        try:
            with NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                tmp_file.write(file_content)
                tmp_path = tmp_file.name
            fast_chunks, fast_progress = self._extract_chunks_windowed(
                file_path=tmp_path,
                filename=filename,
                converter=self.converter_fast,
            )
            total_text = sum(len(str(item.get("text_contextualized", ""))) for item in fast_chunks)
            if fast_chunks and total_text >= MIN_TEXT_LENGTH_FOR_FAST_PASS:
                return ExtractionOutcome(
                    chunks=fast_chunks,
                    warnings=warnings,
                    pages_total=fast_progress["pages_total"],
                    pages_processed=fast_progress["pages_processed"],
                    windows_total=fast_progress["windows_total"],
                    windows_processed=fast_progress["windows_processed"],
                )

            if not fast_chunks:
                warnings.append("Fast pass without OCR returned no chunks.")
            else:
                warnings.append("Fast pass produced sparse text; OCR fallback enabled.")

            ocr_chunks, ocr_progress = self._extract_chunks_windowed(
                file_path=tmp_path,
                filename=filename,
                converter=self.converter_ocr,
            )
            if ocr_chunks:
                return ExtractionOutcome(
                    chunks=ocr_chunks,
                    warnings=warnings,
                    pages_total=ocr_progress["pages_total"],
                    pages_processed=ocr_progress["pages_processed"],
                    windows_total=ocr_progress["windows_total"],
                    windows_processed=ocr_progress["windows_processed"],
                )

            if fast_chunks:
                warnings.append("OCR fallback failed; returning fast-pass chunks only.")
                return ExtractionOutcome(
                    chunks=fast_chunks,
                    warnings=warnings,
                    pages_total=fast_progress["pages_total"],
                    pages_processed=fast_progress["pages_processed"],
                    windows_total=fast_progress["windows_total"],
                    windows_processed=fast_progress["windows_processed"],
                )

            warnings.append("No chunks extracted after fast pass and OCR fallback.")
            return ExtractionOutcome(
                chunks=[],
                warnings=warnings,
                pages_total=max(fast_progress["pages_total"], ocr_progress["pages_total"] if "ocr_progress" in locals() else 0),
                pages_processed=max(fast_progress["pages_processed"], ocr_progress["pages_processed"] if "ocr_progress" in locals() else 0),
                windows_total=max(fast_progress["windows_total"], ocr_progress["windows_total"] if "ocr_progress" in locals() else 0),
                windows_processed=max(
                    fast_progress["windows_processed"],
                    ocr_progress["windows_processed"] if "ocr_progress" in locals() else 0,
                ),
            )
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _extract_chunks_windowed(
        self,
        *,
        file_path: str,
        filename: str,
        converter: DocumentConverter,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        chunks: list[dict[str, Any]] = []
        order_counter = 0
        window_start = 1
        windows_processed = 0
        pages_processed = 0
        max_page_seen = 0

        while True:
            window_end = window_start + DOC_WINDOW_SIZE - 1
            try:
                result = converter.convert(
                    file_path,
                    page_range=(window_start, window_end),
                    raises_on_error=False,
                )
            except Exception as error:
                logger.warning(
                    "Docling conversion failed for %s pages=%s-%s: %s",
                    filename,
                    window_start,
                    window_end,
                    error,
                )
                break

            doc = result.document
            if doc is None:
                break

            raw_chunks = list(self.chunker.chunk(doc))
            if not raw_chunks:
                break
            windows_processed += 1
            page_values: list[int] = []

            for chunk in raw_chunks:
                text_raw = str(getattr(chunk, "text", "") or "").strip()
                text_contextualized = str(self.chunker.contextualize(chunk) or "").strip()
                if not text_contextualized:
                    continue
                headings = self._extract_headings(chunk)
                heading_path = " / ".join(headings)
                page_no = self._extract_page_ref(chunk)
                page_start = self._parse_page_start(page_no)
                if page_start is not None and page_start > 0:
                    page_values.append(page_start)
                source_ref = f"{filename}#p{page_no}" if page_no else f"{filename}#chunk-{order_counter + 1}"
                meta_json = json.dumps(
                    {
                        "headings": headings,
                        "page_no": page_no,
                        "window_start": window_start,
                        "window_end": window_end,
                    },
                    ensure_ascii=False,
                )
                chunks.append(
                    {
                        "context_chunk_id": str(uuid.uuid4()),
                        "order": order_counter,
                        "text_raw": text_raw,
                        "text_contextualized": text_contextualized,
                        "heading_path": heading_path,
                        "page_no": page_no,
                        "source_ref": source_ref,
                        "meta_json": meta_json,
                    }
                )
                order_counter += 1
            if page_values:
                max_page_seen = max(max_page_seen, max(page_values))
                pages_processed = max(pages_processed, max(page_values))

            if len(raw_chunks) < 2:
                # Heuristic EOF for windowed conversion.
                break
            window_start = window_end + 1

        if max_page_seen <= 0:
            # Fallback estimation if page metadata is sparse.
            max_page_seen = max(0, window_start - 1)
            pages_processed = max(pages_processed, max_page_seen)
        windows_total = (max_page_seen + DOC_WINDOW_SIZE - 1) // DOC_WINDOW_SIZE if max_page_seen > 0 else windows_processed
        progress = {
            "pages_total": max_page_seen,
            "pages_processed": min(pages_processed, max_page_seen) if max_page_seen > 0 else pages_processed,
            "windows_total": windows_total,
            "windows_processed": windows_processed,
        }
        return chunks, progress

    @staticmethod
    def _extract_headings(chunk: Any) -> list[str]:
        meta = getattr(chunk, "meta", None)
        headings = getattr(meta, "headings", None) if meta else None
        if not headings:
            return []
        cleaned = [str(item).strip() for item in headings if str(item).strip()]
        return cleaned[:6]

    @staticmethod
    def _extract_page_ref(chunk: Any) -> str:
        meta = getattr(chunk, "meta", None)
        if meta is None:
            return ""
        page_no = getattr(meta, "page_no", None)
        if page_no is not None:
            return str(page_no)
        page = getattr(meta, "page", None)
        if page is not None:
            return str(page)

        # Docling chunk metadata frequently stores page provenance in nested structures
        # (e.g. meta.doc_items[*].prov[*].page_no), not only as top-level fields.
        page_numbers = ContextDocumentPageRefHelper.collect_page_numbers(meta)
        if not page_numbers:
            return ""
        if len(page_numbers) == 1:
            return str(page_numbers[0])
        return f"{page_numbers[0]}-{page_numbers[-1]}"

    @staticmethod
    def _parse_page_start(page_ref: str) -> int | None:
        value = (page_ref or "").strip()
        if not value:
            return None
        match = re.search(r"\d+", value)
        if not match:
            return None
        try:
            return int(match.group(0))
        except ValueError:
            return None

    async def _write_context_chunks(
        self,
        *,
        session_id: str,
        context_document_id: str,
        chunks: list[dict[str, Any]],
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (d:ContextDocument {context_document_id: $context_document_id})
                OPTIONAL MATCH (d)-[rel:HAS_CONTEXT_CHUNK]->(old:ContextChunk)
                DELETE rel
                DETACH DELETE old
                """,
                context_document_id=context_document_id,
            )
            await session.run(
                """
                MATCH (d:ContextDocument {context_document_id: $context_document_id})
                UNWIND $rows AS row
                MERGE (ch:ContextChunk {context_chunk_id: row.context_chunk_id})
                SET
                    ch.session_id = $session_id,
                    ch.context_document_id = $context_document_id,
                    ch.text_raw = row.text_raw,
                    ch.text_contextualized = row.text_contextualized,
                    ch.heading_path = row.heading_path,
                    ch.page_no = row.page_no,
                    ch.source_ref = row.source_ref,
                    ch.meta_json = row.meta_json,
                    ch.updated_at = datetime()
                MERGE (d)-[rel:HAS_CONTEXT_CHUNK]->(ch)
                SET rel.order = row.order
                """,
                context_document_id=context_document_id,
                session_id=session_id,
                rows=chunks,
            )

    async def _index_context_chunks(
        self,
        *,
        session_id: str,
        context_document_id: str,
        chunks: list[dict[str, Any]],
    ) -> int:
        if not chunks or self.qdrant_client is None:
            return 0
        if self._embedding_client is None:
            return 0

        texts = [str(chunk.get("text_contextualized", "")) for chunk in chunks]
        vectors = await self._embed_texts(texts)
        if not vectors:
            return 0

        collection_name = self._collection_name()
        await self._ensure_collection(collection_name, self.embedding_dimensions)

        points: list[qm.PointStruct] = []
        for chunk, vector in zip(chunks, vectors):
            cid = str(chunk["context_chunk_id"])
            points.append(
                qm.PointStruct(
                    id=cid,
                    vector=vector,
                    payload={
                        "session_id": session_id,
                        "context_document_id": context_document_id,
                        "context_chunk_id": cid,
                        "heading_path": str(chunk.get("heading_path", "")),
                        "page_no": str(chunk.get("page_no", "")),
                        "source_ref": str(chunk.get("source_ref", "")),
                        "text_contextualized": str(chunk.get("text_contextualized", "")),
                    },
                )
            )
        await self.qdrant_client.upsert(collection_name=collection_name, points=points, wait=True)
        return len(points)

    async def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        cleaned = [text.strip() for text in texts if text.strip()]
        if not cleaned or self._embedding_client is None:
            return []
        response = None
        try:
            response = await self._embedding_client.embeddings.create(
                model=self.embedding_model,
                input=cleaned,
                dimensions=self.embedding_dimensions,
            )
        except Exception:
            # Some OpenAI-compatible embedding providers do not support the `dimensions` parameter.
            response = await self._embedding_client.embeddings.create(
                model=self.embedding_model,
                input=cleaned,
            )
        vectors = [list(item.embedding) for item in response.data]
        return [self._normalize_vector_dimension(vector) for vector in vectors]

    def _normalize_vector_dimension(self, vector: list[float]) -> list[float]:
        if len(vector) == self.embedding_dimensions:
            return vector
        if len(vector) > self.embedding_dimensions:
            return vector[: self.embedding_dimensions]
        return [*vector, *([0.0] * (self.embedding_dimensions - len(vector)))]

    def _collection_name(self) -> str:
        configured = config.qdrant_collection_name.strip()
        if configured:
            return configured
        return "context_document_chunks"

    async def _ensure_collection(self, collection_name: str, vector_size: int) -> None:
        if self.qdrant_client is None:
            return
        if await self.qdrant_client.collection_exists(collection_name):
            return
        await self.qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
        )

    async def _run_challenge_job(
        self,
        *,
        session_id: str,
        challenge_job_id: str,
        model_id: str | None,
    ) -> None:
        started_at = time.time()
        processed = 0
        failed = 0
        try:
            requirements = await self._load_scoped_requirements(session_id)
            total = len(requirements)
            await self._set_challenge_job_status(
                session_id=session_id,
                status="running",
                challenge_job_id=challenge_job_id,
                requirements_total=total,
                processed=0,
                failed=0,
                duration_ms=0,
            )
            for requirement in requirements:
                try:
                    query = self._build_requirement_query(requirement)
                    chunks = await self._retrieve_hybrid_chunks(session_id=session_id, query=query, top_k=6)
                    evaluation = await self._evaluate_requirement(requirement=requirement, chunks=chunks)
                    await self._write_requirement_challenge(
                        session_id=session_id,
                        requirement=requirement,
                        chunks=chunks,
                        evaluation=evaluation,
                    )
                    processed += 1
                except Exception as error:
                    failed += 1
                    logger.warning(
                        "Challenge item failed for session=%s ru_key=%s: %s",
                        session_id,
                        requirement.get("ru_key"),
                        error,
                    )
                await self._set_challenge_job_status(
                    session_id=session_id,
                    status="running",
                    challenge_job_id=challenge_job_id,
                    requirements_total=total,
                    processed=processed,
                    failed=failed,
                    duration_ms=int((time.time() - started_at) * 1000),
                )

            await self._recompute_effective_state(session_id=session_id)
            await self._set_challenge_job_status(
                session_id=session_id,
                status="completed",
                challenge_job_id=challenge_job_id,
                requirements_total=total,
                processed=processed,
                failed=failed,
                duration_ms=int((time.time() - started_at) * 1000),
                baseline_confirmed_run=True,
            )
        except Exception as error:
            logger.exception("Challenge job failed for session=%s: %s", session_id, error)
            await self._set_challenge_job_status(
                session_id=session_id,
                status="failed",
                challenge_job_id=challenge_job_id,
                requirements_total=processed + failed,
                processed=processed,
                failed=failed,
                duration_ms=int((time.time() - started_at) * 1000),
            )

    async def _set_challenge_job_status(
        self,
        *,
        session_id: str,
        status: str,
        challenge_job_id: str,
        requirements_total: int,
        processed: int,
        failed: int,
        duration_ms: int,
        baseline_confirmed_run: bool | None = None,
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET
                    s.challenge_job_id = $challenge_job_id,
                    s.challenge_status = $status,
                    s.challenge_requirements_total = $requirements_total,
                    s.challenge_processed = $processed,
                    s.challenge_failed = $failed,
                    s.challenge_duration_ms = $duration_ms,
                    s.challenge_updated_at = datetime(),
                    s.context_challenge_baseline_confirmed_run = coalesce(
                        $baseline_confirmed_run,
                        s.context_challenge_baseline_confirmed_run
                    )
                """,
                session_id=session_id,
                challenge_job_id=challenge_job_id,
                status=status,
                requirements_total=requirements_total,
                processed=processed,
                failed=failed,
                duration_ms=duration_ms,
                baseline_confirmed_run=baseline_confirmed_run,
            )

    async def _load_scoped_requirements(self, session_id: str) -> list[dict[str, str]]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                RETURN DISTINCT
                    ru.ru_key AS ru_key,
                    coalesce(ru.title, "") AS title,
                    coalesce(ru.statement, "") AS statement
                ORDER BY ru.ru_key
                """,
                session_id=session_id,
            )
            rows = await result.data()
        return [dict(row) for row in rows if row.get("ru_key")]

    @staticmethod
    def _build_requirement_query(requirement: dict[str, str]) -> str:
        title = str(requirement.get("title", "")).strip()
        statement = str(requirement.get("statement", "")).strip()
        if title and statement:
            return f"{title}\n{statement}"
        return statement or title

    async def _retrieve_hybrid_chunks(
        self,
        *,
        session_id: str,
        query: str,
        top_k: int,
    ) -> list[RetrievedChunk]:
        lexical_candidates = await self._lexical_candidates(session_id=session_id, query=query, limit=80)
        dense_scores = await self._dense_scores(session_id=session_id, query=query, top_k=80)

        if not lexical_candidates and not dense_scores:
            return []

        merged: dict[str, RetrievedChunk] = {}
        max_lex = max((candidate.lexical_score for candidate in lexical_candidates), default=1.0) or 1.0
        max_dense = max(dense_scores.values(), default=1.0) or 1.0

        for candidate in lexical_candidates:
            dense = dense_scores.get(candidate.context_chunk_id, 0.0)
            lexical_norm = candidate.lexical_score / max_lex
            dense_norm = dense / max_dense if max_dense > 0 else 0.0
            fused = (0.65 * lexical_norm) + (0.35 * dense_norm)
            merged[candidate.context_chunk_id] = RetrievedChunk(
                context_chunk_id=candidate.context_chunk_id,
                text_contextualized=candidate.text_contextualized,
                heading_path=candidate.heading_path,
                page_no=candidate.page_no,
                source_ref=candidate.source_ref,
                document_title=candidate.document_title,
                lexical_score=candidate.lexical_score,
                dense_score=dense,
                fused_score=fused,
                method="hybrid_lexical_dense",
            )

        if not merged and dense_scores:
            dense_only_rows = await self._load_chunks_by_ids(session_id, list(dense_scores.keys()))
            for row in dense_only_rows:
                cid = row["context_chunk_id"]
                dense = dense_scores.get(cid, 0.0)
                merged[cid] = RetrievedChunk(
                    context_chunk_id=cid,
                    text_contextualized=row["text_contextualized"],
                    heading_path=row["heading_path"],
                    page_no=row["page_no"],
                    source_ref=row["source_ref"],
                    document_title=row["document_title"],
                    lexical_score=0.0,
                    dense_score=dense,
                    fused_score=dense / max_dense if max_dense > 0 else 0.0,
                    method="dense_only",
                )

        ranked = sorted(
            merged.values(),
            key=lambda item: (-item.fused_score, item.context_chunk_id),
        )
        return ranked[:top_k]

    async def _lexical_candidates(self, *, session_id: str, query: str, limit: int) -> list[RetrievedChunk]:
        tokens = self._tokenize(query)
        if not tokens:
            return []
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:HAS_CONTEXT_DOCUMENT]->(d:ContextDocument)-[:HAS_CONTEXT_CHUNK]->(ch:ContextChunk)
                WHERE coalesce(d.ingest_status, "") = "completed"
                RETURN
                    ch.context_chunk_id AS context_chunk_id,
                    coalesce(ch.text_contextualized, "") AS text_contextualized,
                    coalesce(ch.heading_path, "") AS heading_path,
                    coalesce(ch.page_no, "") AS page_no,
                    coalesce(ch.source_ref, "") AS source_ref,
                    coalesce(d.filename, "") AS document_title
                """,
                session_id=session_id,
            )
            rows = await result.data()

        candidates: list[RetrievedChunk] = []
        for row in rows:
            text = str(row.get("text_contextualized", ""))
            text_tokens = self._tokenize(text)
            if not text_tokens:
                continue
            overlap = len(tokens.intersection(text_tokens))
            if overlap <= 0:
                continue
            coverage = overlap / max(1, len(tokens))
            candidates.append(
                RetrievedChunk(
                    context_chunk_id=str(row.get("context_chunk_id", "")),
                    text_contextualized=text,
                    heading_path=str(row.get("heading_path", "")),
                    page_no=str(row.get("page_no", "")),
                    source_ref=str(row.get("source_ref", "")),
                    document_title=str(row.get("document_title", "")),
                    lexical_score=coverage,
                    dense_score=0.0,
                    fused_score=coverage,
                    method="lexical_overlap",
                )
            )
        candidates.sort(key=lambda item: (-item.lexical_score, item.context_chunk_id))
        return candidates[:limit]

    async def _dense_scores(self, *, session_id: str, query: str, top_k: int) -> dict[str, float]:
        if self.qdrant_client is None or self._embedding_client is None:
            return {}
        query = query.strip()
        if not query:
            return {}
        vectors = await self._embed_texts([query])
        if not vectors:
            return {}
        vector = vectors[0]
        try:
            response = await self.qdrant_client.query_points(
                collection_name=self._collection_name(),
                query=vector,
                limit=top_k,
                with_payload=True,
                query_filter=qm.Filter(
                    must=[
                        qm.FieldCondition(
                            key="session_id",
                            match=qm.MatchValue(value=session_id),
                        )
                    ]
                ),
            )
        except Exception:
            return {}

        points = getattr(response, "points", []) or []
        scores: dict[str, float] = {}
        for point in points:
            payload = getattr(point, "payload", {}) or {}
            chunk_id = str(payload.get("context_chunk_id") or getattr(point, "id", ""))
            if not chunk_id:
                continue
            scores[chunk_id] = float(getattr(point, "score", 0.0) or 0.0)
        return scores

    async def _load_chunks_by_ids(self, session_id: str, chunk_ids: list[str]) -> list[dict[str, str]]:
        if not chunk_ids:
            return []
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:HAS_CONTEXT_DOCUMENT]->(d:ContextDocument)-[:HAS_CONTEXT_CHUNK]->(ch:ContextChunk)
                WHERE ch.context_chunk_id IN $chunk_ids
                RETURN
                    ch.context_chunk_id AS context_chunk_id,
                    coalesce(ch.text_contextualized, "") AS text_contextualized,
                    coalesce(ch.heading_path, "") AS heading_path,
                    coalesce(ch.page_no, "") AS page_no,
                    coalesce(ch.source_ref, "") AS source_ref,
                    coalesce(d.filename, "") AS document_title
                """,
                session_id=session_id,
                chunk_ids=chunk_ids,
            )
            rows = await result.data()
        return [dict(row) for row in rows]

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return {
            token
            for token in re.split(r"[^a-zA-Z0-9]+", text.casefold())
            if len(token) > 2
        }

    async def _evaluate_requirement(
        self,
        *,
        requirement: dict[str, str],
        chunks: list[RetrievedChunk],
    ) -> ChallengeEvaluation:
        if not chunks:
            return ChallengeEvaluation(
                challenge_state="insufficient_evidence",
                confidence=0.2,
                rationale="Keine relevanten Dokumentstellen gefunden.",
                citations=[],
            )

        excerpt_rows = []
        for chunk in chunks[:6]:
            excerpt_rows.append(
                {
                    "context_chunk_id": chunk.context_chunk_id,
                    "heading_path": chunk.heading_path,
                    "page_no": chunk.page_no,
                    "source_ref": chunk.source_ref,
                    "text_excerpt": chunk.text_contextualized[:1000],
                }
            )
        prompt = json.dumps(
            {
                "requirement": requirement,
                "evidence_chunks": excerpt_rows,
            },
            ensure_ascii=False,
        )
        try:
            result = await self.challenge_agent.run(prompt)
            output = result.output
            if (
                isinstance(output, ChallengeEvaluation)
                and output.challenge_state in CHALLENGE_STATES
            ):
                if not output.citations:
                    output.citations = [chunk.context_chunk_id for chunk in chunks[:2]]
                return output
        except Exception as error:
            logger.warning("Challenge evaluator fallback triggered: %s", error)

        top = chunks[0]
        fallback_state = "compliant" if top.lexical_score > 0.34 else "insufficient_evidence"
        return ChallengeEvaluation(
            challenge_state=fallback_state,
            confidence=0.45 if fallback_state == "compliant" else 0.3,
            rationale="Heuristische Bewertung mangels strukturierter LLM-Ausgabe.",
            citations=[top.context_chunk_id],
        )

    async def _write_requirement_challenge(
        self,
        *,
        session_id: str,
        requirement: dict[str, str],
        chunks: list[RetrievedChunk],
        evaluation: ChallengeEvaluation,
    ) -> None:
        ru_key = str(requirement.get("ru_key", ""))
        if not ru_key:
            return
        auto_state = self._map_challenge_state(evaluation.challenge_state)
        state_id = f"{session_id}::{ru_key}"
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                MATCH (ru:RequirementUnit {ru_key: $ru_key})
                MERGE (rs:SessionRequirementState {state_id: $state_id})
                SET
                    rs.session_id = $session_id,
                    rs.ru_key = $ru_key,
                    rs.auto_challenge_state = $auto_state,
                    rs.challenge_state = $challenge_state,
                    rs.challenge_confidence = $confidence,
                    rs.challenge_rationale = $rationale,
                    rs.challenge_citations_json = $citations_json,
                    rs.updated_at = datetime()
                MERGE (s)-[:HAS_REQUIREMENT_STATE]->(rs)
                MERGE (rs)-[:FOR_REQUIREMENT]->(ru)
                MERGE (s)-[hs:HAS_CHALLENGE_STATE]->(ru)
                SET
                    hs.challenge_state = $challenge_state,
                    hs.auto_state = $auto_state,
                    hs.confidence = $confidence,
                    hs.rationale = $rationale,
                    hs.updated_at = datetime()
                """,
                session_id=session_id,
                ru_key=ru_key,
                state_id=state_id,
                auto_state=auto_state,
                challenge_state=evaluation.challenge_state,
                confidence=float(evaluation.confidence),
                rationale=evaluation.rationale,
                citations_json=json.dumps(evaluation.citations, ensure_ascii=False),
            )
            for chunk in chunks[:6]:
                await session.run(
                    """
                    MATCH (ru:RequirementUnit {ru_key: $ru_key})
                    MATCH (ch:ContextChunk {context_chunk_id: $context_chunk_id})
                    MERGE (ch)-[rel:MATCHES_REQUIREMENT {session_id: $session_id}]->(ru)
                    SET
                        rel.method = $method,
                        rel.score = $score,
                        rel.updated_at = datetime()
                    """,
                    ru_key=ru_key,
                    context_chunk_id=chunk.context_chunk_id,
                    session_id=session_id,
                    method=chunk.method,
                    score=float(chunk.fused_score),
                )

    @staticmethod
    def _map_challenge_state(challenge_state: str) -> str:
        if challenge_state == "compliant":
            return "addressed"
        if challenge_state == "needs_improvement":
            return "gap"
        return "unclear"

    async def _recompute_effective_state(self, *, session_id: str) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                MERGE (rs:SessionRequirementState {state_id: $session_id + "::" + ru.ru_key})
                SET rs.session_id = $session_id, rs.ru_key = ru.ru_key
                MERGE (s)-[:HAS_REQUIREMENT_STATE]->(rs)
                MERGE (rs)-[:FOR_REQUIREMENT]->(ru)
                """,
                session_id=session_id,
            )
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:HAS_REQUIREMENT_STATE]->(rs:SessionRequirementState)
                WITH s, rs,
                     coalesce(rs.manual_state, "open") AS manual_state,
                     coalesce(rs.auto_challenge_state, "open") AS auto_state
                WITH s, rs,
                    CASE
                        WHEN manual_state = "not_applicable" THEN "not_applicable"
                        WHEN manual_state IN ["gap", "unclear", "addressed"] THEN manual_state
                        WHEN auto_state IN ["gap", "unclear", "addressed"] THEN auto_state
                        ELSE "open"
                    END AS effective_state
                SET rs.effective_state = effective_state, rs.updated_at = datetime()
                """,
                session_id=session_id,
            )
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[rel:HAS_STATE]->(:RequirementUnit)
                DELETE rel
                """,
                session_id=session_id,
            )
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:HAS_REQUIREMENT_STATE]->(rs:SessionRequirementState)-[:FOR_REQUIREMENT]->(ru:RequirementUnit)
                MERGE (s)-[rel:HAS_STATE]->(ru)
                SET
                    rel.state = coalesce(rs.effective_state, "open"),
                    rel.source = CASE
                        WHEN coalesce(rs.manual_state, "open") IN ["not_applicable", "gap", "unclear", "addressed"] THEN "manual_state"
                        WHEN coalesce(rs.auto_challenge_state, "open") IN ["gap", "unclear", "addressed"] THEN "auto_challenge_state"
                        ELSE "open"
                    END,
                    rel.updated_at = datetime()
                """,
                session_id=session_id,
            )
