"""Chat API routes"""
import asyncio
import json
import logging
import uuid

import httpx
from fastapi import APIRouter
from starlette.background import BackgroundTasks
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

from app.agents.common import DocumentContext, TaskMode
from app.agents.context.fixed_jsx import resolve_context_jsx
from app.agents.factory import document_agent, create_agent_from_model_id
from app.config import config, HOCUSPOCUS_URL, HTTP_TIMEOUT
from app.providers import parse_model_id
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

logger = logging.getLogger(__name__)

router = APIRouter()


def _nested_body(body_data: dict) -> dict | None:
    b = body_data.get("body")
    return b if isinstance(b, dict) else None


def parse_task_mode(body_data: dict) -> TaskMode:
    """Resolve task mode from flat or nested AI SDK payloads."""
    raw = None
    inner = _nested_body(body_data)
    if inner is not None:
        raw = inner.get("taskMode") or inner.get("task_mode")
    if raw is None:
        raw = body_data.get("taskMode") or body_data.get("task_mode")
    if raw is None:
        return TaskMode.ASK
    try:
        return TaskMode(str(raw).strip().lower())
    except ValueError:
        logger.warning("⚠️ Invalid task mode %r, defaulting to ask", raw)
        return TaskMode.ASK


def _resolve_model_id(body_data: dict) -> str | None:
    inner = _nested_body(body_data)
    if inner is not None and inner.get("model"):
        return inner.get("model")
    return body_data.get("model")


def _messages_list(body_data: dict) -> list | None:
    """UIMessage list is usually top-level; some clients nest under body."""
    m = body_data.get("messages")
    if isinstance(m, list):
        return m
    inner = _nested_body(body_data)
    if inner is not None:
        m = inner.get("messages")
        if isinstance(m, list):
            return m
    return None


@router.post("/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint with task mode and document context support.
    Parameters are sent in the request body:
    - model: Model selection
    - taskMode: "ask", "write", "summarize", or "context"
    - activeDocument: Document name for write mode (optional)
    - activeSource: Source ID for summarize mode (optional)
    - webSearch: Enable web search (optional)
    """
    logger.info("💬 Chat request received")
    
    # Read body to extract parameters
    body_bytes = await request.body()
    body_data = {}
    
    if body_bytes:
        try:
            body_data = json.loads(body_bytes)
        except json.JSONDecodeError:
            logger.warning("⚠️ Could not parse request body as JSON")
    
    inner = _nested_body(body_data)
    model_id = _resolve_model_id(body_data)
    task_mode = parse_task_mode(body_data)
    active_document = None
    active_source = None
    if inner is not None:
        active_document = inner.get("activeDocument")
        active_source = inner.get("activeSource")
    if active_document is None:
        active_document = body_data.get("activeDocument")
    if active_source is None:
        active_source = body_data.get("activeSource")

    logger.info("📋 Request - Model: %s, Mode: %s", model_id, task_mode.value)

    # Collapse history in CONTEXT mode; rewrite full JSON (never only the nested `body` dict)
    try:
        if task_mode == TaskMode.CONTEXT:
            incoming_messages = _messages_list(body_data)
            if isinstance(incoming_messages, list):
                last_user = None
                for m in reversed(incoming_messages):
                    if isinstance(m, dict) and m.get("role") == "user":
                        last_user = m
                        break
                updated = dict(body_data)
                updated["messages"] = [last_user] if last_user is not None else []
                body_bytes = json.dumps(updated).encode("utf-8")
    except Exception as e:
        logger.warning("⚠️ Could not collapse context messages: %s", e)

    # CONTEXT: fixed JSX sample (no LLM) — Vercel AI data stream v6
    if task_mode == TaskMode.CONTEXT:
        async def event_stream():
            def sse_line(obj: dict) -> bytes:
                return (f"data: {json.dumps(obj, ensure_ascii=False)}\n\n").encode("utf-8")

            text_id = str(uuid.uuid4())
            full_jsx = resolve_context_jsx(body_data)
            yield sse_line({"type": "start"})
            yield sse_line({"type": "start-step"})
            yield sse_line({"type": "text-start", "id": text_id})

            chunk_size = 48
            for i in range(0, len(full_jsx), chunk_size):
                delta = full_jsx[i : i + chunk_size]
                yield sse_line({"type": "text-delta", "delta": delta, "id": text_id})
                await asyncio.sleep(0.02)

            yield sse_line({"type": "text-end", "id": text_id})
            yield sse_line({"type": "finish-step"})
            yield sse_line({"type": "finish", "finishReason": "stop"})
            yield b"data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # Recreate request body stream with possibly updated body
    call_count = [0]
    async def receive():
        call_count[0] += 1
        return {"type": "http.request", "body": body_bytes if call_count[0] == 1 else b""}
    request._receive = receive

    # Parse model
    provider = config.default_provider
    model_name = config.default_model

    if model_id:
        try:
            provider, model_name = parse_model_id(model_id)
        except ValueError as e:
            logger.warning(f"⚠️ Invalid model ID '{model_id}': {e}")

    # Create agent
    try:
        agent = create_agent_from_model_id(f"{provider}:{model_name}", task_mode)
    except Exception as e:
        logger.error(f"❌ Error creating agent: {e}")
        agent = document_agent

    # Create HTTP client and context
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT)

    deps = DocumentContext(
        http_client=http_client,
        hocuspocus_url=HOCUSPOCUS_URL,
        model_name=f"{provider}:{model_name}",
        current_document=active_document if task_mode == TaskMode.WRITE else None,
        current_source=active_source if task_mode == TaskMode.SUMMARIZE else None,
        task_mode=task_mode,
    )

    background.add_task(http_client.aclose)

    try:
        return await VercelAIAdapter.dispatch_request(
            request, agent=agent, deps=deps, sdk_version=6
        )
    except Exception as e:
        logger.error(f"❌ Error in VercelAIAdapter: {type(e).__name__}: {e}")
        raise
