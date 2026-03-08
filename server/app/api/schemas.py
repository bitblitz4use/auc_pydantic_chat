"""API request and response schemas"""
from pydantic import BaseModel
from typing import List


class ModelInfo(BaseModel):
    """Model information for frontend"""
    id: str
    name: str
    chef: str  # Provider display name
    chefSlug: str  # Provider slug for logo
    providers: List[str]


class ProvidersResponse(BaseModel):
    """Response format for providers endpoint"""
    models: List[ModelInfo]


class RenameRequest(BaseModel):
    """Request format for rename endpoint"""
    new_path: str


class TagsRequest(BaseModel):
    """Request format for tags endpoint"""
    tags: List[str]


class FolderRequest(BaseModel):
    """Request format for folder creation endpoint"""
    folderPath: str