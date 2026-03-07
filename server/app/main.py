"""FastAPI application entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import config
from app.storage.client import ensure_bucket_exists
from app.api.routes import chat, providers, storage, sources

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Lifespan event handler for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure bucket exists
    try:
        ensure_bucket_exists()
    except Exception as e:
        logger.error(f"❌ Failed to initialize MinIO bucket: {e}")
    yield
    # Shutdown: Add cleanup code here if needed in the future


app = FastAPI(title="Pydantic AI Chat API", lifespan=lifespan)

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(chat.router, prefix="/api")
app.include_router(providers.router, prefix="/api")
app.include_router(storage.router, prefix="/api")
app.include_router(sources.router, prefix="/api")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}
