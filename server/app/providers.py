"""
Provider factory module for creating AI models dynamically.
Uses Pydantic AI's built-in provider system.
"""
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.ollama import OllamaProvider
from typing import Dict
import logging
import sys
from pathlib import Path

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.config import config

logger = logging.getLogger(__name__)


def create_model(provider: str, model_name: str) -> OpenAIChatModel:
    """
    Factory function to create models based on provider.
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
    
    Returns:
        OpenAIChatModel instance configured for the specified provider
    
    Raises:
        ValueError: If provider is unknown or required config is missing
    """
    if provider == "openai":
        if not config.openai_api_key:
            raise ValueError("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.")
        
        logger.info(f"🔧 Creating OpenAI model: {model_name}")
        return OpenAIChatModel(
            model_name=model_name,
            provider=OpenAIProvider(api_key=config.openai_api_key)
        )
    
    elif provider == "ollama":
        logger.info(f"🔧 Creating Ollama model: {model_name}")
        return OpenAIChatModel(
            model_name=model_name,
            provider=OllamaProvider(base_url=config.ollama_base_url)
        )
    
    else:
        raise ValueError(
            f"Unknown provider: {provider}. "
            f"Available providers: {list(config.available_models.keys())}"
        )


def parse_model_id(model_id: str) -> tuple[str, str]:
    """
    Parse model ID in format "provider:model_name" into provider and model name.
    
    Args:
        model_id: Model identifier in format "provider:model_name"
    
    Returns:
        Tuple of (provider, model_name)
    
    Raises:
        ValueError: If model_id format is invalid
    """
    if ":" not in model_id:
        raise ValueError(
            f"Invalid model ID format: {model_id}. "
            f"Expected format: 'provider:model_name' (e.g., 'openai:gpt-4o')"
        )
    
    provider, model_name = model_id.split(":", 1)
    return provider, model_name


def get_available_models() -> Dict[str, list[str]]:
    """
    Get all available models grouped by provider.
    
    Returns:
        Dictionary mapping provider slugs to lists of model names
    """
    return config.available_models.copy()
