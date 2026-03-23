"""Compliance graph ingestion endpoint (POC)."""

import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError

from app.compliance_graph.pipeline import ComplianceGraphIngestionPipeline
from app.compliance_graph.schema import ComplianceIngestRequestMetadata, ComplianceIngestResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/compliance-graph/ingest", response_model=ComplianceIngestResponse)
async def ingest_compliance_graph_document(
    request: Request,
    file: UploadFile = File(...),
    standard_key: str = Form(...),
    title: str = Form(...),
    language: str = Form("de"),
    source_kind: str = Form("standard"),
    version_label: str | None = Form(None),
    jurisdiction: str | None = Form(None),
    model_id: str | None = Form(None),
    heading_blocklist: str | None = Form(None),
):
    """
    End-to-end concept ingestion in one request:
    convert document, create chunks, extract requirements, persist into Neo4j.
    """
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(
            status_code=503,
            detail="Neo4j is not configured. Set NEO4J_URI and NEO4J_USER to enable this endpoint.",
        )

    filename = file.filename or "unknown"
    logger.info("Compliance ingest requested for '%s' (%s)", standard_key, filename)

    try:
        raw_blocklist = [item.strip() for item in (heading_blocklist or "").split(",") if item.strip()]
        metadata = ComplianceIngestRequestMetadata(
            standard_key=standard_key,
            title=title,
            language=language,
            source_kind=source_kind,  # validated by schema Literal
            version_label=version_label,
            jurisdiction=jurisdiction,
            model_id=model_id,
            heading_blocklist=raw_blocklist
            if raw_blocklist
            else ComplianceIngestRequestMetadata().heading_blocklist,
        )
        file_content = await file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        pipeline = ComplianceGraphIngestionPipeline(neo4j_driver=neo4j_driver)
        result = await pipeline.run(file_content=file_content, filename=filename, metadata=metadata)
        logger.info(
            "Compliance ingest complete for '%s': chunks=%s requirements=%s",
            standard_key,
            result.chunks_kept,
            result.requirements_extracted,
        )
        return result
    except HTTPException:
        raise
    except (ValueError, ValidationError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Compliance ingest failed for '%s': %s", standard_key, error)
        raise HTTPException(status_code=500, detail=f"Compliance ingestion failed: {error}") from error
