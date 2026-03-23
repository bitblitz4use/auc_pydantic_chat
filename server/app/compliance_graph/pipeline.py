"""End-to-end POC pipeline: Docling -> chunks -> extraction -> Neo4j."""

import asyncio
import logging
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from docling.document_converter import DocumentConverter
from docling_core.transforms.chunker import HierarchicalChunker
from neo4j import AsyncDriver

from app.agents.providers import parse_model_id
from app.compliance_graph.extractor import (
    ComplianceQuestionExtractor,
    ComplianceRequirementExtractor,
)
from app.compliance_graph.schema import (
    ComplianceIngestRequestMetadata,
    ComplianceIngestResponse,
    FIXED_HEADING_BLOCKLIST,
    IngestedChunk,
    IngestedDiagnosticQuestion,
    IngestedRequirement,
)
from app.config import config

logger = logging.getLogger(__name__)


class ComplianceGraphIngestionPipeline:
    """Concept-aligned ingestion pipeline for the master graph POC."""

    def __init__(self, neo4j_driver: AsyncDriver):
        self.neo4j_driver = neo4j_driver
        self.converter = DocumentConverter()
        self.chunker = HierarchicalChunker()

    async def run(
        self,
        file_content: bytes,
        filename: str,
        metadata: ComplianceIngestRequestMetadata,
    ) -> ComplianceIngestResponse:
        provider, model_name = self._resolve_model(metadata.model_id)
        extractor = ComplianceRequirementExtractor(provider=provider, model_name=model_name)
        question_extractor = ComplianceQuestionExtractor(provider=provider, model_name=model_name)

        conversion_result = await asyncio.to_thread(
            self._convert_document,
            file_content,
            filename,
        )
        if conversion_result.document is None:
            raise ValueError("Docling conversion returned no document.")

        chunks_total, chunks = await asyncio.to_thread(
            self._build_chunks,
            conversion_result.document,
            metadata.standard_key,
        )
        for chunk in chunks:
            statements = await extractor.extract(
                chunk_text=chunk.text_contextualized,
                clause_path=chunk.clause_path,
                language=metadata.language,
            )
            for index, statement in enumerate(statements):
                ru_key = extractor.make_requirement_identity(chunk.chunk_key, statement, index)
                chunk.requirements.append(
                    IngestedRequirement(
                        ru_key=ru_key,
                        statement=statement,
                        title=extractor.summarize_title(statement),
                        language=metadata.language,
                    )
                )

        questions = await self._extract_questions(
            question_extractor=question_extractor,
            metadata=metadata,
            chunks=chunks,
        )

        await self._persist(metadata=metadata, chunks=chunks, questions=questions)

        requirement_count = sum(len(chunk.requirements) for chunk in chunks)
        clause_count = len({chunk.clause_id for chunk in chunks})
        influence_count = sum(len(question.influences) for question in questions)
        return ComplianceIngestResponse(
            standard_key=metadata.standard_key,
            source_filename=filename,
            chunks_total=chunks_total,
            chunks_kept=len(chunks),
            requirements_extracted=requirement_count,
            clauses_written=clause_count,
            questions_generated=len(questions),
            influences_generated=influence_count,
            model_id=f"{provider}:{model_name}",
        )

    def _convert_document(self, file_content: bytes, filename: str):
        suffix = Path(filename).suffix or ".bin"
        tmp_path = None
        try:
            with NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                tmp_file.write(file_content)
                tmp_path = tmp_file.name
            return self.converter.convert(tmp_path)
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _build_chunks(
        self,
        docling_document,
        standard_key: str,
    ) -> tuple[int, list[IngestedChunk]]:
        raw_chunks = list(self.chunker.chunk(docling_document))
        blocklist = [item.casefold() for item in FIXED_HEADING_BLOCKLIST]
        built: list[IngestedChunk] = []

        for index, chunk in enumerate(raw_chunks):
            heading_chain = self._extract_headings(chunk)
            heading_text = heading_chain[-1] if heading_chain else "unstructured"
            if self._is_blocked(heading_chain, blocklist):
                continue

            clause_path = " / ".join(heading_chain) if heading_chain else f"chunk-{index}"
            clause_id = self._clause_id(standard_key, clause_path)
            chunk_key = f"{standard_key}::{clause_id}::{index}"

            contextualized = self.chunker.contextualize(chunk)
            built.append(
                IngestedChunk(
                    standard_key=standard_key,
                    chunk_key=chunk_key,
                    clause_id=clause_id,
                    clause_path=clause_path,
                    heading_text=heading_text,
                    text_contextualized=contextualized,
                    text_raw=chunk.text,
                )
            )

        return len(raw_chunks), built

    @staticmethod
    def _extract_headings(chunk) -> list[str]:
        meta = getattr(chunk, "meta", None)
        headings = getattr(meta, "headings", None) if meta else None
        if not headings:
            return []
        return [str(item).strip() for item in headings if str(item).strip()]

    @staticmethod
    def _is_blocked(heading_chain: list[str], blocklist: list[str]) -> bool:
        if not heading_chain:
            return False
        joined = " ".join(heading_chain).casefold()
        return any(blocked in joined for blocked in blocklist)

    @staticmethod
    def _clause_id(standard_key: str, clause_path: str) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9]+", "-", clause_path).strip("-").lower() or "clause"
        return f"{standard_key}/{normalized}"

    @staticmethod
    def _resolve_model(model_id: str | None) -> tuple[str, str]:
        if model_id:
            return parse_model_id(model_id)
        return (config.default_provider, config.default_model)

    async def _persist(
        self,
        metadata: ComplianceIngestRequestMetadata,
        chunks: list[IngestedChunk],
        questions: list[IngestedDiagnosticQuestion],
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.execute_write(self._write_document, metadata)
            await session.execute_write(self._write_chunks, chunks)
            await session.execute_write(self._write_questions, metadata.standard_key, questions)

    @staticmethod
    async def _write_document(tx, metadata: ComplianceIngestRequestMetadata) -> None:
        await tx.run(
            """
            MERGE (d:NormativeDocument {standard_key: $standard_key})
            SET d.title = $title,
                d.language = $language,
                d.source_kind = $source_kind,
                d.version_label = $version_label,
                d.jurisdiction = $jurisdiction
            """,
            standard_key=metadata.standard_key,
            title=metadata.title,
            language=metadata.language,
            source_kind=metadata.source_kind,
            version_label=metadata.version_label,
            jurisdiction=metadata.jurisdiction,
        )

    @staticmethod
    async def _write_chunks(tx, chunks: list[IngestedChunk]) -> None:
        for order, chunk in enumerate(chunks):
            await tx.run(
                """
                MATCH (d:NormativeDocument {standard_key: $standard_key})
                MERGE (c:Clause {clause_id: $clause_id})
                SET c.clause_path = $clause_path,
                    c.heading_text = $heading_text
                MERGE (d)-[:HAS_CHILD]->(c)
                MERGE (ch:NormativeChunk {chunk_key: $chunk_key})
                SET ch.text_contextualized = $text_contextualized,
                    ch.text_raw = $text_raw
                MERGE (c)-[rel:HAS_CHUNK]->(ch)
                SET rel.order = $order
                """,
                standard_key=chunk.standard_key,
                clause_id=chunk.clause_id,
                clause_path=chunk.clause_path,
                heading_text=chunk.heading_text,
                chunk_key=chunk.chunk_key,
                text_contextualized=chunk.text_contextualized,
                text_raw=chunk.text_raw,
                order=order,
            )
            for requirement in chunk.requirements:
                await tx.run(
                    """
                    MATCH (c:Clause {clause_id: $clause_id})
                    MATCH (ch:NormativeChunk {chunk_key: $chunk_key})
                    MERGE (ru:RequirementUnit {ru_key: $ru_key})
                    SET ru.statement = $statement,
                        ru.title = $title,
                        ru.language = $language,
                        ru.status = "draft"
                    MERGE (c)-[:CONTAINS_REQUIREMENT]->(ru)
                    MERGE (ch)-[:SOURCE_FOR]->(ru)
                    """,
                    clause_id=chunk.clause_id,
                    chunk_key=chunk.chunk_key,
                    ru_key=requirement.ru_key,
                    statement=requirement.statement,
                    title=requirement.title,
                    language=requirement.language,
                )

    async def _extract_questions(
        self,
        question_extractor: ComplianceQuestionExtractor,
        metadata: ComplianceIngestRequestMetadata,
        chunks: list[IngestedChunk],
    ) -> list[IngestedDiagnosticQuestion]:
        questions_by_key: dict[str, IngestedDiagnosticQuestion] = {}
        for chunk in chunks:
            requirement_payload = [
                {
                    "ru_key": requirement.ru_key,
                    "title": requirement.title,
                    "statement": requirement.statement,
                }
                for requirement in chunk.requirements
            ]
            extracted = await question_extractor.extract(
                standard_key=metadata.standard_key,
                clause_path=chunk.clause_path,
                requirements=requirement_payload,
                language=metadata.language,
            )
            for question in extracted:
                existing = questions_by_key.get(question.question_key)
                if existing is None:
                    questions_by_key[question.question_key] = question
                    continue
                seen_influences = {
                    (edge.ru_key, edge.mode, edge.when_value) for edge in existing.influences
                }
                for edge in question.influences:
                    edge_key = (edge.ru_key, edge.mode, edge.when_value)
                    if edge_key in seen_influences:
                        continue
                    existing.influences.append(edge)
                    seen_influences.add(edge_key)
        return list(questions_by_key.values())

    @staticmethod
    async def _write_questions(
        tx,
        standard_key: str,
        questions: list[IngestedDiagnosticQuestion],
    ) -> None:
        previous_question_key: str | None = None
        for order, question in enumerate(questions):
            await tx.run(
                """
                MERGE (q:DiagnosticQuestion {question_key: $question_key})
                SET q.prompt = $prompt,
                    q.answer_type = $answer_type,
                    q.allowed_values = $allowed_values,
                    q.language = $language,
                    q.status = $status,
                    q.standard_key = $standard_key
                """,
                question_key=question.question_key,
                prompt=question.prompt,
                answer_type=question.answer_type,
                allowed_values=question.allowed_values,
                language=question.language,
                status=question.status,
                standard_key=standard_key,
            )

            if previous_question_key:
                await tx.run(
                    """
                    MATCH (q1:DiagnosticQuestion {question_key: $prev_key})
                    MATCH (q2:DiagnosticQuestion {question_key: $next_key})
                    MERGE (q1)-[f:FOLLOWS]->(q2)
                    SET f.order = $order
                    """,
                    prev_key=previous_question_key,
                    next_key=question.question_key,
                    order=order,
                )
            previous_question_key = question.question_key

            for influence in question.influences:
                await tx.run(
                    """
                    MATCH (q:DiagnosticQuestion {question_key: $question_key})
                    MATCH (ru:RequirementUnit {ru_key: $ru_key})
                    MERGE (q)-[rel:INFLUENCES]->(ru)
                    SET rel.mode = $mode,
                        rel.when_value = $when_value,
                        rel.status = "draft"
                    """,
                    question_key=question.question_key,
                    ru_key=influence.ru_key,
                    mode=influence.mode,
                    when_value=influence.when_value,
                )
