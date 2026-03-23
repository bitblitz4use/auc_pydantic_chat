"""Neo4j async driver lifecycle (see https://neo4j.com/docs/python-manual/current/connect/)."""
import logging

from fastapi import FastAPI
from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import config

logger = logging.getLogger(__name__)


async def ensure_neo4j_driver(app: FastAPI) -> None:
    """
    If NEO4J_URI and NEO4J_USER are set, create a single AsyncDriver, verify connectivity,
    and attach it to app.state.neo4j_driver. Otherwise set neo4j_driver to None and log why.
    """
    app.state.neo4j_driver = None

    uri = config.neo4j_uri.strip()
    user = config.neo4j_user.strip()
    if not uri or not user:
        logger.info(
            "Neo4j not configured (set NEO4J_URI and NEO4J_USER); graph DB disabled."
        )
        return

    driver: AsyncDriver | None = None
    try:
        driver = AsyncGraphDatabase.driver(
            uri,
            auth=(user, config.neo4j_password),
        )
        await driver.verify_connectivity()
        app.state.neo4j_driver = driver
        logger.info("Neo4j connection established at %s", uri)
    except Exception:
        logger.exception("Failed to connect to Neo4j")
        if driver is not None:
            await driver.close()


async def close_neo4j_driver(driver: AsyncDriver | None) -> None:
    """Close the driver if present (always close drivers on shutdown)."""
    if driver is not None:
        await driver.close()
