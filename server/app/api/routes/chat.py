"""Chat API routes"""
from fastapi import APIRouter
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
import httpx
import logging
import json

# Enable httpx logging for debugging HTTP requests to Ollama
# Set to INFO to see request/response summaries without too much detail
httpx_logger = logging.getLogger("httpx")
httpx_logger.setLevel(logging.INFO)

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
    # We need to read the body stream and then recreate it for VercelAIAdapter
    body_bytes = await request.body()
    body_data = {}
    
    if body_bytes:
        try:
            body_data = json.loads(body_bytes)
        except json.JSONDecodeError:
            logger.warning("⚠️ Could not parse request body as JSON")
    
    # Extract from body.body (Vercel AI SDK format) or body root
    body_root = body_data.get("body", {}) if isinstance(body_data.get("body"), dict) else body_data
    
    model_id = body_root.get("model") or body_data.get("model")
    task_mode_str = body_root.get("taskMode") or body_data.get("taskMode", "ask")
    active_document = body_root.get("activeDocument") or body_data.get("activeDocument")
    active_source = body_root.get("activeSource") or body_data.get("activeSource")
    
    logger.info(f"📋 Request parameters:")
    logger.info(f"   Model: {model_id}")
    logger.info(f"   Task Mode: {task_mode_str}")
    logger.info(f"   Active Document: {active_document}")
    logger.info(f"   Active Source: {active_source}")
    
    # Recreate the request body stream for VercelAIAdapter
    # This is necessary because request.body() consumes the stream
    async def receive():
        return {"type": "http.request", "body": body_bytes}
    
    request._receive = receive
    
    # Parse task mode
    try:
        task_mode = TaskMode(task_mode_str.lower())
    except ValueError:
        logger.warning(f"⚠️ Invalid task mode '{task_mode_str}', defaulting to 'ask'")
        task_mode = TaskMode.ASK
    
    # Parse model ID
    provider = config.default_provider
    model_name = config.default_model
    
    if model_id:
        try:
            provider, model_name = parse_model_id(model_id)
            logger.info(f"🎯 Using model: {provider}:{model_name}")
        except ValueError as e:
            logger.warning(f"⚠️ Invalid model ID '{model_id}': {e}. Using default model.")
        except Exception as e:
            logger.error(f"❌ Error parsing model ID '{model_id}': {e}. Using default model.")
    else:
        logger.info("ℹ️ No model specified, using default model")
    
    # Create appropriate agent based on task mode
    try:
        agent = create_agent_from_model_id(
            f"{provider}:{model_name}", 
            task_mode
        )
    except Exception as e:
        logger.error(f"❌ Error creating agent: {e}. Using default document agent.")
        agent = document_agent
    
    logger.info(f"🤖 Agent mode: {task_mode.value}")
    
    # Create HTTP client that will stay alive during the entire request
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT)
    
    # Set current_document if in write mode and document is provided
    current_doc = active_document if task_mode == TaskMode.WRITE else None
    # Set current_source if in summarize mode and source is provided
    current_src = active_source if task_mode == TaskMode.SUMMARIZE else None
    
    deps = DocumentContext(
        http_client=http_client,
        hocuspocus_url=HOCUSPOCUS_URL,
        model_name=f"{provider}:{model_name}",
        current_document=current_doc,
        current_source=current_src,
        task_mode=task_mode
    )
    
    if current_doc:
        logger.info(f"📄 Active document: {current_doc}")
    if current_src:
        logger.info(f"📚 Active source: {current_src}")
    
    logger.info(f"🌐 Created HTTP client for Hocuspocus: {deps.hocuspocus_url}")
    
    # Schedule cleanup after response completes
    background.add_task(http_client.aclose)
    
    logger.info("🚀 Dispatching to VercelAIAdapter")
    logger.info(f"   Provider: {provider}, Model: {model_name}")
    try:
        return await VercelAIAdapter.dispatch_request(
            request,
            agent=agent,
            deps=deps,
            sdk_version=5
        )
    except Exception as e:
        logger.error(f"❌ Error in VercelAIAdapter: {type(e).__name__}: {e}")
        logger.error(f"   Provider: {provider}, Model: {model_name}")
        
        # Try to extract more details from HTTP errors
        if hasattr(e, 'response'):
            try:
                if hasattr(e.response, 'read'):
                    error_detail = await e.response.read()
                    logger.error(f"   HTTP error response: {error_detail.decode('utf-8', errors='ignore')}")
                elif hasattr(e.response, 'text'):
                    error_detail = await e.response.text()
                    logger.error(f"   HTTP error response: {error_detail}")
                else:
                    logger.error(f"   HTTP error response: {str(e.response)}")
            except Exception as read_error:
                logger.error(f"   Could not read error response: {read_error}")
        
        # Log the full exception traceback for debugging
        import traceback
        logger.error(f"   Traceback:\n{traceback.format_exc()}")
        
        raise
