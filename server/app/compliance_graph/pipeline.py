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
from app.compliance_graph.extractor import ComplianceRequirementExtractor
from app.compliance_graph.schema import (
    ComplianceIngestRequestMetadata,
    ComplianceIngestResponse,
    FIXED_HEADING_BLOCKLIST,
    IngestedChunk,
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
                    )
                )

        await self._persist(metadata=metadata, chunks=chunks)

        requirement_count = sum(len(chunk.requirements) for chunk in chunks)
        clause_count = len({chunk.clause_id for chunk in chunks})
        return ComplianceIngestResponse(
            standard_key=metadata.standard_key,
            source_filename=filename,
            chunks_total=chunks_total,
            chunks_kept=len(chunks),
            requirements_extracted=requirement_count,
            clauses_written=clause_count,
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
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.execute_write(self._write_document, metadata)
            await session.execute_write(self._write_chunks, chunks)

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
                        ru.status = "draft"
                    MERGE (c)-[:CONTAINS_REQUIREMENT]->(ru)
                    MERGE (ch)-[:SOURCE_FOR]->(ru)
                    """,
                    clause_id=chunk.clause_id,
                    chunk_key=chunk.chunk_key,
                    ru_key=requirement.ru_key,
                    statement=requirement.statement,
                    title=requirement.title,
                )
