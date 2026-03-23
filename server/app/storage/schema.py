"""Storage API schemas."""
from typing import List

from pydantic import BaseModel


class RenameRequest(BaseModel):
    """Request format for rename endpoint."""

    new_path: str


class TagsRequest(BaseModel):
    """Request format for tags endpoint."""

    tags: List[str]

