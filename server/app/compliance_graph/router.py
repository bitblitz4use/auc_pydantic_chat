"""Compliance graph ingestion endpoint (POC)."""

import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, ValidationError

from app.compliance_graph.context_document_service import ContextDocumentService
from app.compliance_graph.pipeline import ComplianceGraphIngestionPipeline
from app.compliance_graph.schema import (
    ComplianceIngestRequestMetadata,
    ComplianceIngestResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class ContextChallengePreviewRequest(BaseModel):
    question_key: str
    draft_answer_value: bool | str | list[str] | int | float | None = None
    manual_evidence_text: str = ""
    model_id: str | None = None


class ContextChallengeRunRequest(BaseModel):
    model_id: str | None = None


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
):
    """
    End-to-end concept ingestion in one request:
    convert document, create chunks, extract requirements/questions, persist into Neo4j.
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
        metadata = ComplianceIngestRequestMetadata(
            standard_key=standard_key,
            title=title,
            language=language,
            source_kind=source_kind,  # validated by schema Literal
            version_label=version_label,
            jurisdiction=jurisdiction,
            model_id=model_id,
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


@router.post("/compliance-graph/context-documents/upload")
async def upload_context_document(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    """Upload one context document for a session and start async ingest."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)

    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    service = ContextDocumentService(neo4j_driver=neo4j_driver, qdrant_client=qdrant_client)
    try:
        result = await service.upload_document(
            session_id=session_id.strip(),
            file_content=file_content,
            filename=file.filename or "context-document.bin",
            content_type=file.content_type or "application/octet-stream",
        )
        return {"status": "accepted", **result}
    except Exception as error:
        logger.exception("Context document upload failed: %s", error)
        raise HTTPException(status_code=500, detail=f"Context document upload failed: {error}") from error


@router.get("/compliance-graph/context-documents/{context_document_id}/status")
async def get_context_document_status(
    request: Request,
    context_document_id: str,
):
    """Get async ingest status for one context document."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)
    service = ContextDocumentService(neo4j_driver=neo4j_driver, qdrant_client=qdrant_client)
    result = await service.get_document_status(context_document_id=context_document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Context document not found.")
    return result


@router.post("/compliance-graph/sessions/{session_id}/context-challenge/run")
async def run_context_challenge(
    request: Request,
    session_id: str,
    body: ContextChallengeRunRequest | None = None,
):
    """Start explicit baseline full challenge run for a session."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)
    service = ContextDocumentService(
        neo4j_driver=neo4j_driver,
        qdrant_client=qdrant_client,
        model_id=(body.model_id if body else None),
    )
    try:
        result = await service.run_full_challenge(
            session_id=session_id.strip(),
            model_id=(body.model_id if body else None),
        )
        return {"status": "accepted", **result}
    except Exception as error:
        logger.exception("Context challenge run failed: %s", error)
        raise HTTPException(status_code=500, detail=f"Context challenge run failed: {error}") from error


@router.post("/compliance-graph/sessions/{session_id}/context-challenge/preview")
async def preview_context_challenge(
    request: Request,
    session_id: str,
    body: ContextChallengePreviewRequest,
):
    """Run synchronous question-scoped preview challenge for immediate card feedback."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)
    service = ContextDocumentService(
        neo4j_driver=neo4j_driver,
        qdrant_client=qdrant_client,
        model_id=body.model_id,
    )
    try:
        return await service.preview_question_challenge(
            session_id=session_id.strip(),
            question_key=body.question_key.strip(),
            draft_answer_value=body.draft_answer_value,
            manual_evidence_text=body.manual_evidence_text,
        )
    except Exception as error:
        logger.exception("Context challenge preview failed: %s", error)
        raise HTTPException(status_code=500, detail=f"Context challenge preview failed: {error}") from error


@router.get("/compliance-graph/sessions/{session_id}/context-challenge/status")
async def get_context_challenge_status(
    request: Request,
    session_id: str,
):
    """Get challenge job lifecycle status for a session."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)
    service = ContextDocumentService(neo4j_driver=neo4j_driver, qdrant_client=qdrant_client)
    return await service.get_challenge_status(session_id=session_id.strip())


@router.get("/compliance-graph/sessions/{session_id}/context-evidence")
async def get_context_evidence(
    request: Request,
    session_id: str,
):
    """Debug endpoint for challenge evidence traceability."""
    neo4j_driver = getattr(request.app.state, "neo4j_driver", None)
    if neo4j_driver is None:
        raise HTTPException(status_code=503, detail="Neo4j is not configured.")
    qdrant_client = getattr(request.app.state, "qdrant_client", None)
    service = ContextDocumentService(neo4j_driver=neo4j_driver, qdrant_client=qdrant_client)
    rows = await service.get_context_evidence(session_id=session_id.strip())
    return {"session_id": session_id, "count": len(rows), "rows": rows}
