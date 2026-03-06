from dataclasses import dataclass
from typing import Optional
import httpx

@dataclass
class DocumentContext:
    """Context for document editing operations"""
    http_client: httpx.AsyncClient
    hocuspocus_url: str = "http://localhost:3001"
    current_document: Optional[str] = None
    model_name: str = "gpt-oss:20b"
