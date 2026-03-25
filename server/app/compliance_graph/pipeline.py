"""End-to-end POC pipeline: Docling -> chunks -> extraction -> Neo4j."""

import asyncio
import hashlib
import logging
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from docling.document_converter import DocumentConverter
from docling_core.transforms.chunker import HierarchicalChunker
from neo4j import AsyncDriver

from app.agents.providers import parse_model_id
from app.compliance_graph.extractor import (
    ComplianceEvidenceExtractor,
    ComplianceQuestionExtractor,
    ComplianceRequirementExtractor,
)
from app.compliance_graph.schema import (
    ComplianceIngestRequestMetadata,
    ComplianceIngestResponse,
    FIXED_HEADING_BLOCKLIST,
    IngestedClauseUnit,
    IngestedChunk,
    IngestedDiagnosticQuestion,
    IngestedRequirement,
)
from app.config import config

logger = logging.getLogger(__name__)

DOCLING_DROP_LABELS = {
    "picture",
    "chart",
    "table",
    "caption",
    "page_header",
    "page_footer",
}

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
        evidence_extractor = ComplianceEvidenceExtractor(provider=provider, model_name=model_name)

        conversion_result = await asyncio.to_thread(
            self._convert_document,
            file_content,
            filename,
        )
        if conversion_result.document is None:
            raise ValueError("Docling conversion returned no document.")
        removed_items = self._sanitize_docling_document(conversion_result.document)
        if removed_items > 0:
            logger.info("Docling pre-filter removed %s non-normative items.", removed_items)

        chunks_total, chunks = await asyncio.to_thread(
            self._build_chunks,
            conversion_result.document,
            metadata.standard_key,
        )
        clause_units = self._build_clause_units(chunks)
        for unit in clause_units:
            statements = await extractor.extract(
                chunk_text=unit.text_contextualized,
                clause_path=unit.clause_path,
                language=metadata.language,
            )
            for index, statement in enumerate(statements):
                ru_key = extractor.make_requirement_identity(unit.clause_id, statement, index)
                unit.requirements.append(
                    IngestedRequirement(
                        ru_key=ru_key,
                        statement=statement,
                        title=extractor.summarize_title(statement),
                        language=metadata.language,
                        source_chunk_keys=list(unit.source_chunk_keys),
                    )
                )

            requirement_payload = [
                {
                    "ru_key": requirement.ru_key,
                    "title": requirement.title,
                    "statement": requirement.statement,
                }
                for requirement in unit.requirements
            ]
            grouped_evidence = await evidence_extractor.extract(
                standard_key=metadata.standard_key,
                clause_path=unit.clause_path,
                requirements=requirement_payload,
                language=metadata.language,
            )
            for requirement in unit.requirements:
                requirement.evidence_hints.extend(grouped_evidence.get(requirement.ru_key, []))

        questions = await self._extract_questions(
            question_extractor=question_extractor,
            metadata=metadata,
            clause_units=clause_units,
        )

        await self._persist(
            metadata=metadata,
            chunks=chunks,
            clause_units=clause_units,
            questions=questions,
        )

        requirement_count = sum(len(unit.requirements) for unit in clause_units)
        evidence_count = sum(
            len(requirement.evidence_hints)
            for unit in clause_units
            for requirement in unit.requirements
        )
        clause_count = len(clause_units)
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
            evidence_hints_generated=evidence_count,
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
    def _build_clause_units(chunks: list[IngestedChunk]) -> list[IngestedClauseUnit]:
        grouped: dict[str, list[IngestedChunk]] = {}
        clause_order: list[str] = []
        for chunk in chunks:
            if chunk.clause_id not in grouped:
                grouped[chunk.clause_id] = []
                clause_order.append(chunk.clause_id)
            grouped[chunk.clause_id].append(chunk)

        units: list[IngestedClauseUnit] = []
        for clause_id in clause_order:
            clause_chunks = grouped[clause_id]
            if not clause_chunks:
                continue
            first = clause_chunks[0]
            combined_text = "\n\n".join(
                " ".join((item.text_contextualized or "").split())
                for item in clause_chunks
                if (item.text_contextualized or "").strip()
            )
            if not combined_text:
                continue
            units.append(
                IngestedClauseUnit(
                    standard_key=first.standard_key,
                    clause_id=first.clause_id,
                    clause_path=first.clause_path,
                    heading_text=first.heading_text,
                    text_contextualized=combined_text,
                    source_chunk_keys=[item.chunk_key for item in clause_chunks],
                )
            )
        return units

    @staticmethod
    def _sanitize_docling_document(docling_document) -> int:
        to_delete = []
        for item, _ in docling_document.iterate_items(with_groups=False, traverse_pictures=True):
            label_raw = getattr(item, "label", "")
            label = str(getattr(label_raw, "value", label_raw) or "").strip().lower()
            if label in DOCLING_DROP_LABELS:
                to_delete.append(item)
        if not to_delete:
            return 0
        docling_document.delete_items(node_items=to_delete)
        return len(to_delete)

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
        clause_units: list[IngestedClauseUnit],
        questions: list[IngestedDiagnosticQuestion],
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.execute_write(self._write_document, metadata)
            await session.execute_write(self._write_chunks, chunks)
            await session.execute_write(self._write_requirements, clause_units)
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

    @staticmethod
    async def _write_requirements(tx, clause_units: list[IngestedClauseUnit]) -> None:
        for unit in clause_units:
            for requirement in unit.requirements:
                await tx.run(
                    """
                    MATCH (c:Clause {clause_id: $clause_id})
                    MERGE (ru:RequirementUnit {ru_key: $ru_key})
                    SET ru.statement = $statement,
                        ru.title = $title,
                        ru.language = $language,
                        ru.status = "draft"
                    MERGE (c)-[:CONTAINS_REQUIREMENT]->(ru)
                    """,
                    clause_id=unit.clause_id,
                    ru_key=requirement.ru_key,
                    statement=requirement.statement,
                    title=requirement.title,
                    language=requirement.language,
                )
                for chunk_key in requirement.source_chunk_keys:
                    await tx.run(
                        """
                        MATCH (ch:NormativeChunk {chunk_key: $chunk_key})
                        MATCH (ru:RequirementUnit {ru_key: $ru_key})
                        MERGE (ch)-[:SOURCE_FOR]->(ru)
                        """,
                        chunk_key=chunk_key,
                        ru_key=requirement.ru_key,
                    )
                for evidence in requirement.evidence_hints:
                    await tx.run(
                        """
                        MATCH (ru:RequirementUnit {ru_key: $ru_key})
                        MERGE (ev:EvidenceType {evidence_key: $evidence_key})
                        SET ev.title = $title,
                            ev.hint = $hint,
                            ev.example = $example,
                            ev.language = $language,
                            ev.status = $status
                        MERGE (ru)-[:VERIFIED_BY]->(ev)
                        """,
                        ru_key=requirement.ru_key,
                        evidence_key=evidence.evidence_key,
                        title=evidence.title,
                        hint=evidence.hint,
                        example=evidence.example,
                        language=evidence.language,
                        status=evidence.status,
                    )

    async def _extract_questions(
        self,
        question_extractor: ComplianceQuestionExtractor,
        metadata: ComplianceIngestRequestMetadata,
        clause_units: list[IngestedClauseUnit],
    ) -> list[IngestedDiagnosticQuestion]:
        questions_by_clause_prompt: dict[
            tuple[str, str, str], IngestedDiagnosticQuestion
        ] = {}
        for unit in clause_units:
            requirement_payload = [
                {
                    "ru_key": requirement.ru_key,
                    "title": requirement.title,
                    "statement": requirement.statement,
                }
                for requirement in unit.requirements
            ]
            extracted = await question_extractor.extract(
                standard_key=metadata.standard_key,
                clause_path=unit.clause_path,
                requirements=requirement_payload,
                language=metadata.language,
            )
            for question in extracted:
                normalized_prompt = self._normalize_prompt(question.prompt)
                if not normalized_prompt:
                    continue
                dedupe_key = (unit.clause_id, normalized_prompt, question.answer_type)
                existing = questions_by_clause_prompt.get(dedupe_key)
                if existing is None:
                    question.question_key = self._canonical_question_key(
                        standard_key=metadata.standard_key,
                        clause_id=unit.clause_id,
                        normalized_prompt=normalized_prompt,
                        answer_type=question.answer_type,
                    )
                    question.prompt = " ".join(question.prompt.split())
                    questions_by_clause_prompt[dedupe_key] = question
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
        return list(questions_by_clause_prompt.values())

    @staticmethod
    def _normalize_prompt(prompt: str) -> str:
        normalized = re.sub(r"[^\w\s]", " ", prompt.casefold())
        return re.sub(r"\s+", " ", normalized).strip()

    @staticmethod
    def _canonical_question_key(
        standard_key: str,
        clause_id: str,
        normalized_prompt: str,
        answer_type: str,
    ) -> str:
        standard_token = re.sub(r"[^a-zA-Z0-9._-]+", ".", standard_key).strip(".").lower()
        digest = hashlib.sha1(
            f"{standard_key}|{clause_id}|{normalized_prompt}|{answer_type}".encode("utf-8")
        ).hexdigest()
        return f"{standard_token}.clause.{digest[:16]}"

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
                    MERGE (q)-[rel:INFLUENCES {mode: $mode, when_value: $when_value}]->(ru)
                    SET rel.status = "draft"
                    """,
                    question_key=question.question_key,
                    ru_key=influence.ru_key,
                    mode=influence.mode,
                    when_value=influence.when_value,
                )
