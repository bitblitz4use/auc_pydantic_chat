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

from app.chat.router import router as chat_router
from app.compliance_graph.router import router as compliance_graph_router
from app.documents.router import router as documents_router
from app.providers.router import router as providers_router
from app.sources.router import router as sources_router
from app.storage.router import router as storage_router
from app.neo4j import close_neo4j_driver, ensure_neo4j_driver
from app.qdrant import close_qdrant_client, ensure_qdrant_client
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
    await ensure_qdrant_client(app)
    neo4j_driver = app.state.neo4j_driver
    qdrant_client = app.state.qdrant_client
    try:
        yield
    finally:
        await close_qdrant_client(qdrant_client)
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
app.include_router(chat_router, prefix="/api")
app.include_router(providers_router, prefix="/api")
app.include_router(storage_router, prefix="/api")
app.include_router(sources_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(compliance_graph_router, prefix="/api")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}
