"""Providers API schemas."""
from typing import List

from pydantic import BaseModel


class ModelInfo(BaseModel):
    """Model information for frontend."""

    id: str
    name: str
    chef: str  # Provider display name
    chefSlug: str  # Provider slug for logo
    providers: List[str]


class ProvidersResponse(BaseModel):
    """Response format for providers endpoint."""

    models: List[ModelInfo]

