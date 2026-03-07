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
    Supports:
    - X-Model-ID header: Model selection
    - X-Task-Mode header: "ask" or "write"
    - X-Active-Document header: Document name for write mode
    """
    logger.info("💬 Chat request received")
    
    # Extract headers
    model_id = request.headers.get("X-Model-ID")
    task_mode_str = request.headers.get("X-Task-Mode", "ask")
    active_document = request.headers.get("X-Active-Document")
    
    # Log all headers for debugging
    logger.info(f"📋 Headers received:")
    logger.info(f"   X-Model-ID: {model_id}")
    logger.info(f"   X-Task-Mode: {task_mode_str}")
    logger.info(f"   X-Active-Document: {active_document}")
    
    # Parse task mode
    try:
        task_mode = TaskMode(task_mode_str.lower())
    except ValueError:
        logger.warning(f"⚠️ Invalid task mode '{task_mode_str}', defaulting to 'ask'")
        task_mode = TaskMode.ASK
    
    # If not in header, try to read from body
    # We need to read the body stream and then recreate it for VercelAIAdapter
    if not model_id:
        try:
            # Read body to extract model
            body_bytes = await request.body()
            if body_bytes:
                try:
                    body = json.loads(body_bytes)
                    # Vercel AI SDK may send model in body.body
                    model_id = body.get("body", {}).get("model") or body.get("model")
                except json.JSONDecodeError:
                    # Body might not be JSON (could be streaming)
                    model_id = None
                
                # Recreate the request body stream for VercelAIAdapter
                # This is necessary because request.body() consumes the stream
                async def receive():
                    return {"type": "http.request", "body": body_bytes}
                
                # Replace the receive function to allow VercelAIAdapter to read the body
                request._receive = receive
        except Exception as e:
            logger.warning(f"⚠️ Could not parse request body for model selection: {e}")
            model_id = None
    
    # Determine which agent to use
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
    
    deps = DocumentContext(
        http_client=http_client,
        hocuspocus_url=HOCUSPOCUS_URL,
        model_name=f"{provider}:{model_name}",
        current_document=current_doc,
        task_mode=task_mode
    )
    
    if current_doc:
        logger.info(f"📄 Active document: {current_doc}")
    
    logger.info(f"🌐 Created HTTP client for Hocuspocus: {deps.hocuspocus_url}")
    
    # Schedule cleanup after response completes
    background.add_task(http_client.aclose)
    
    logger.info("🚀 Dispatching to VercelAIAdapter")
    return await VercelAIAdapter.dispatch_request(
        request,
        agent=agent,
        deps=deps,
        sdk_version=6
    )
