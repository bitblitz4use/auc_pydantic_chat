"""Documents API schemas."""
from pydantic import BaseModel


class RenameRequest(BaseModel):
    """Request format for rename endpoint."""

    new_path: str


class FolderRequest(BaseModel):
    """Request format for folder creation endpoint."""

    folderPath: str

