from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
import httpx
import logging
import sys
from pathlib import Path

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.config import CORS_ORIGINS, HOCUSPOCUS_URL, HTTP_TIMEOUT
from app.models import DocumentContext
from app.agent import document_agent
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


@app.post("/api/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint that handles Vercel AI Data Stream Protocol requests.
    Maintains a shared HTTP client for all document operations within a conversation.
    """
    logger.info("💬 Chat request received")
    
    # Create HTTP client that will stay alive during the entire request
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT)
    deps = DocumentContext(http_client=http_client, hocuspocus_url=HOCUSPOCUS_URL)
    
    logger.info(f"🌐 Created HTTP client for Hocuspocus: {deps.hocuspocus_url}")
    
    # Schedule cleanup after response completes
    background.add_task(http_client.aclose)
    
    logger.info("🚀 Dispatching to VercelAIAdapter")
    return await VercelAIAdapter.dispatch_request(
        request,
        agent=document_agent,
        deps=deps,
        sdk_version=6
    )
