# Configuration settings using Pydantic Settings
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator
from typing import Dict, List, Any
import json
from pathlib import Path

class AppConfig(BaseSettings):
    """Application configuration with providers"""
    cors_origins: List[str] = Field(
        default=["http://localhost:3000"],
        description="CORS allowed origins (comma-separated or JSON array)"
    )
    hocuspocus_url: str = Field(
        default="http://localhost:3001",
        description="HocusPocus server URL"
    )
    http_timeout: float = Field(
        default=30.0,
        description="HTTP request timeout in seconds"
    )
    
    # Provider configurations
    openai_api_key: str = Field(
        default="",
        description="OpenAI API key"
    )
    ollama_base_url: str = Field(
        default="http://192.168.178.83:11434/v1",
        description="Ollama base URL"
    )
    
    # MinIO S3 Storage configuration
    minio_endpoint: str = Field(
        default="localhost:9102",
        description="MinIO endpoint"
    )
    minio_access_key: str = Field(
        default="admin",
        description="MinIO access key"
    )
    minio_secret_key: str = Field(
        default="admin123",
        description="MinIO secret key"
    )
    minio_bucket: str = Field(
        default="auc-chat-storage",
        description="MinIO bucket name"
    )
    minio_secure: bool = Field(
        default=False,
        description="Use HTTPS for MinIO (True/False)"
    )
    
    # Available models per provider
    # Format: provider_slug -> list of model names (JSON string in .env)
    available_models: Dict[str, List[str]] = Field(
        default={
            "ollama": [
                "gpt-oss:20b",
                "gpt-oss:120b",
                "mistral:7b",
                "qwen3-coder:30b"
            ],
            "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
        },
        description="Available models per provider (JSON string in .env)"
    )
    
    # Default model for backward compatibility
    default_provider: str = Field(
        default="ollama",
        description="Default provider"
    )
    default_model: str = Field(
        default="gpt-oss:20b",
        description="Default model name"
    )
    
    @model_validator(mode='before')
    @classmethod
    def parse_complex_types(cls, data: Any) -> Any:
        """Parse complex types from environment variables before type validation"""
        if isinstance(data, dict):
            # Handle cors_origins
            if 'cors_origins' in data and isinstance(data['cors_origins'], str):
                value = data['cors_origins']
                # Try JSON first, then comma-separated
                try:
                    data['cors_origins'] = json.loads(value)
                except json.JSONDecodeError:
                    data['cors_origins'] = [origin.strip() for origin in value.split(',') if origin.strip()]
            
            # Handle available_models
            if 'available_models' in data and isinstance(data['available_models'], str):
                try:
                    data['available_models'] = json.loads(data['available_models'])
                except json.JSONDecodeError:
                    raise ValueError(f"Invalid JSON format for available_models: {data['available_models']}")
            
            # Handle minio_secure boolean
            if 'minio_secure' in data and isinstance(data['minio_secure'], str):
                data['minio_secure'] = data['minio_secure'].lower() in ('true', '1', 'yes', 'on')
        
        return data
    
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

# Create global config instance
config = AppConfig()

# Export for backward compatibility
CORS_ORIGINS = config.cors_origins
HOCUSPOCUS_URL = config.hocuspocus_url
HTTP_TIMEOUT = config.http_timeout
OLLAMA_BASE_URL = config.ollama_base_url
MODEL_NAME = config.default_model
