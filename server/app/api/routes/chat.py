"""Chat API routes"""
from fastapi import APIRouter
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
import httpx
import logging
import json

from app.config import config, HOCUSPOCUS_URL, HTTP_TIMEOUT
from app.agent.schema import DocumentContext, TaskMode
from app.agent.agent import document_agent, create_agent_from_model_id
from app.providers import parse_model_id
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint with task mode and document context support.
    Parameters are sent in the request body:
    - model: Model selection
    - taskMode: "ask", "write", or "summarize"
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
    
    # Extract parameters
    body_root = body_data.get("body", {}) if isinstance(body_data.get("body"), dict) else body_data
    
    model_id = body_root.get("model") or body_data.get("model")
    task_mode_str = body_root.get("taskMode") or body_data.get("taskMode", "ask")
    active_document = body_root.get("activeDocument") or body_data.get("activeDocument")
    active_source = body_root.get("activeSource") or body_data.get("activeSource")
    
    logger.info(f"📋 Request - Model: {model_id}, Mode: {task_mode_str}")
    
    # Recreate request body stream
    call_count = [0]
    async def receive():
        call_count[0] += 1
        return {"type": "http.request", "body": body_bytes if call_count[0] == 1 else b""}
    
    request._receive = receive
    
    # Parse task mode
    try:
        task_mode = TaskMode(task_mode_str.lower())
    except ValueError:
        logger.warning(f"⚠️ Invalid task mode '{task_mode_str}', defaulting to 'ask'")
        task_mode = TaskMode.ASK
    
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
        task_mode=task_mode
    )
    
    background.add_task(http_client.aclose)
    
    try:
        return await VercelAIAdapter.dispatch_request(
            request, agent=agent, deps=deps, sdk_version=5
        )
    except Exception as e:
        logger.error(f"❌ Error in VercelAIAdapter: {type(e).__name__}: {e}")
        raise
