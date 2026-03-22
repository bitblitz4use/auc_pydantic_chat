"""Agents v2 package with split modules per agent role."""

from .factory import (
    create_agent,
    create_agent_from_model_id,
    document_agent,
)

__all__ = [
    "create_agent",
    "create_agent_from_model_id",
    "document_agent",
]

