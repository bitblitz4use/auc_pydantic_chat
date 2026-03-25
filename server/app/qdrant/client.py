"""Qdrant async client lifecycle (see https://python-client.qdrant.tech/)."""
import inspect
import logging

from fastapi import FastAPI
from qdrant_client import AsyncQdrantClient

from app.config import config

logger = logging.getLogger(__name__)


async def ensure_qdrant_client(app: FastAPI) -> None:
    """
    If QDRANT_URL is set, create a single AsyncQdrantClient, verify connectivity,
    and attach it to app.state.qdrant_client. Otherwise set qdrant_client to None and log why.
    """
    app.state.qdrant_client = None

    url = config.qdrant_url.strip()
    collection_name = config.qdrant_collection_name.strip()
    if not url:
        logger.info("Qdrant not configured (set QDRANT_URL); vector DB disabled.")
        return

    client: AsyncQdrantClient | None = None
    try:
        client = AsyncQdrantClient(
            url=url,
            api_key=config.qdrant_api_key.strip() or None,
        )
        await client.get_collections()
        if collection_name and not await client.collection_exists(collection_name):
            logger.warning(
                "Qdrant connected, but collection '%s' does not exist.",
                collection_name,
            )
        app.state.qdrant_client = client
        logger.info("Qdrant connection established at %s", url)
    except Exception:
        logger.exception("Failed to connect to Qdrant")
        if client is not None:
            await close_qdrant_client(client)


async def close_qdrant_client(client: AsyncQdrantClient | None) -> None:
    """Close the client if present."""
    if client is None:
        return

    close_method = getattr(client, "close", None)
    if close_method is None:
        return

    maybe_awaitable = close_method()
    if inspect.isawaitable(maybe_awaitable):
        await maybe_awaitable
