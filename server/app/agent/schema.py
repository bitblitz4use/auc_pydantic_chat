"""Pydantic schemas for agent operations"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal
from enum import Enum
import httpx


class TaskMode(str, Enum):
    """Task mode selector"""
    ASK = "ask"          # General conversation
    WRITE = "write"      # Document-focused interaction
    SUMMARIZE = "summarize"  # Source summarization


class DocumentContext(BaseModel):
    """Context for document editing operations"""
    http_client: httpx.AsyncClient
    hocuspocus_url: str = "http://localhost:3001"
    current_document: Optional[str] = None
    current_source: Optional[str] = None  # Source ID for summarize mode
    model_name: str = "gpt-oss:20b"
    task_mode: TaskMode = TaskMode.ASK
    
    model_config = ConfigDict(arbitrary_types_allowed=True)  # For httpx.AsyncClient


class DocumentEdit(BaseModel):
    """A single edit operation on the document"""
    type: Literal["insert", "replace", "delete"] = Field(
        description="Type of edit: insert new content, replace existing, or delete"
    )
    search: str = Field(
        default="",
        description="Text to search for (for replace/delete). Use empty string for insert at end."
    )
    content: str = Field(
        default="",
        description="New content to insert or replace with"
    )
    description: str = Field(
        description="Human-readable description of this edit"
    )


class DocumentEditPlan(BaseModel):
    """Plan for editing a document with structured operations"""
    edits: List[DocumentEdit] = Field(
        description="List of edit operations to apply in order"
    )
    overall_summary: str = Field(
        description="Overall description of what changes were made"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "edits": [
                        {
                            "type": "insert",
                            "search": "",
                            "content": "## Summary\n\nThis document covers...\n\n",
                            "description": "Added summary section at the beginning"
                        }
                    ],
                    "overall_summary": "Added a summary section"
                }
            ]
        }
    )
