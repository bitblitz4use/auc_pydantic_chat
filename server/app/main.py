"""FastAPI application entry point"""
import logging
from contextlib import asynccontextmanager

# Configure logging before other app imports so their loggers attach correctly
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, providers, storage, sources, documents
from app.neo4j import close_neo4j_driver, ensure_neo4j_driver
from app.storage.client import ensure_bucket_exists

logger = logging.getLogger(__name__)


# Lifespan event handler for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_bucket_exists()
    except Exception as e:
        logger.error(f"❌ Failed to initialize MinIO bucket: {e}")

    await ensure_neo4j_driver(app)
    neo4j_driver = app.state.neo4j_driver
    try:
        yield
    finally:
        await close_neo4j_driver(neo4j_driver)


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
app.include_router(documents.router, prefix="/api")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}
