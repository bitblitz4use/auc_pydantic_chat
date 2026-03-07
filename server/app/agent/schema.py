"""Pydantic schemas for agent operations"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from enum import Enum
import httpx


class TaskMode(str, Enum):
    """Task mode selector"""
    ASK = "ask"          # General conversation
    WRITE = "write"      # Document-focused interaction


class DocumentContext(BaseModel):
    """Context for document editing operations"""
    http_client: httpx.AsyncClient
    hocuspocus_url: str = "http://localhost:3001"
    current_document: Optional[str] = None
    model_name: str = "gpt-oss:20b"
    task_mode: TaskMode = TaskMode.ASK
    
    model_config = ConfigDict(arbitrary_types_allowed=True)  # For httpx.AsyncClient
