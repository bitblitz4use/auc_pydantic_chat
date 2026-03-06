# Configuration settings using Pydantic Settings
from pydantic_settings import BaseSettings
from typing import Dict, List

class AppConfig(BaseSettings):
    """Application configuration with providers"""
    cors_origins: List[str] = ["http://localhost:3000"]
    hocuspocus_url: str = "http://localhost:3001"
    http_timeout: float = 30.0
    
    # Provider configurations
    openai_api_key: str = ""
    ollama_base_url: str = "http://192.168.178.83:11434/v1"
    
    # Available models per provider
    # Format: provider_slug -> list of model names
    available_models: Dict[str, List[str]] = {
        "ollama": [
            "gpt-oss:20b",
            "gpt-oss:120b",
            "mistral:7b",
            "qwen3-coder:30b"
        ],
        "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
    }
    
    # Default model for backward compatibility
    default_provider: str = "ollama"
    default_model: str = "gpt-oss:20b"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

# Create global config instance
config = AppConfig()

# Export for backward compatibility
CORS_ORIGINS = config.cors_origins
HOCUSPOCUS_URL = config.hocuspocus_url
HTTP_TIMEOUT = config.http_timeout
OLLAMA_BASE_URL = config.ollama_base_url
MODEL_NAME = config.default_model
