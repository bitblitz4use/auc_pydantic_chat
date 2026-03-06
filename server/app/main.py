from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Optional
import httpx
import logging
import sys
import json
from pathlib import Path

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.config import config, CORS_ORIGINS, HOCUSPOCUS_URL, HTTP_TIMEOUT
from app.models import DocumentContext
from app.agent import document_agent, create_agent_from_model_id
from app.providers import get_available_models, parse_model_id
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Pydantic AI Chat API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}


# Pydantic models for API responses
class ModelInfo(BaseModel):
    """Model information for frontend"""
    id: str
    name: str
    chef: str  # Provider display name
    chefSlug: str  # Provider slug for logo
    providers: List[str]


class ProvidersResponse(BaseModel):
    """Response format for providers endpoint"""
    models: List[ModelInfo]


@app.get("/api/providers", response_model=ProvidersResponse)
async def get_providers():
    """
    Discovery endpoint returning available models grouped by provider.
    Returns models in format expected by the frontend model selector.
    """
    logger.info("📋 Providers discovery request received")
    
    models = []
    
    # Map provider slugs to display names
    provider_names: Dict[str, str] = {
        "ollama": "Ollama",
        "openai": "OpenAI"
    }
    
    available_models = get_available_models()
    
    for provider_slug, model_list in available_models.items():
        provider_name = provider_names.get(provider_slug, provider_slug.title())
        
        for model_id in model_list:
            # Format model name for display (e.g., "gpt-oss:20b" -> "Gpt Oss 20b")
            model_display = model_id.replace(":", " ").replace("-", " ").title()
            
            # Create full model ID in format "provider:model_name"
            full_model_id = f"{provider_slug}:{model_id}"
            
            models.append(ModelInfo(
                id=full_model_id,
                name=model_display,
                chef=provider_name,
                chefSlug=provider_slug,
                providers=[provider_slug]
            ))
    
    logger.info(f"✅ Returning {len(models)} models from {len(available_models)} providers")
    return ProvidersResponse(models=models)


@app.post("/api/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint that handles Vercel AI Data Stream Protocol requests.
    Supports dynamic model selection via X-Model-ID header or request body.
    Model format: "provider:model_name" (e.g., "openai:gpt-4o")
    """
    logger.info("💬 Chat request received")
    
    # Try to get model from header first (preferred method)
    model_id = request.headers.get("X-Model-ID")
    
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
    agent = document_agent  # Default
    provider = config.default_provider
    model_name = config.default_model
    
    if model_id:
        try:
            provider, model_name = parse_model_id(model_id)
            logger.info(f"🎯 Using model: {provider}:{model_name}")
            agent = create_agent_from_model_id(model_id)
        except ValueError as e:
            logger.warning(f"⚠️ Invalid model ID '{model_id}': {e}. Using default model.")
        except Exception as e:
            logger.error(f"❌ Error creating agent for '{model_id}': {e}. Using default model.")
    else:
        logger.info("ℹ️ No model specified, using default model")
    
    # Create HTTP client that will stay alive during the entire request
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT)
    deps = DocumentContext(
        http_client=http_client,
        hocuspocus_url=HOCUSPOCUS_URL,
        model_name=f"{provider}:{model_name}"
    )
    
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
