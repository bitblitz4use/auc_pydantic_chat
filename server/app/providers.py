"""
Provider factory module for creating AI models dynamically.
Uses Pydantic AI's built-in provider system with Ollama compatibility fix.
"""
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.ollama import OllamaProvider
from typing import Dict
import logging
import httpx

from app.config import config

logger = logging.getLogger(__name__)


async def _fix_ollama_messages(request: httpx.Request) -> None:
    """
    Fix null content in messages for Ollama compatibility.
    Ollama doesn't accept null content - replaces with empty string.
    """
    if request.content:
        try:
            import json
            body = json.loads(request.content.decode('utf-8'))
            
            # Fix null content in messages
            if 'messages' in body:
                for msg in body['messages']:
                    if msg.get('content') is None:
                        msg['content'] = ''
                
                # Update request with fixed content
                new_content = json.dumps(body).encode('utf-8')
                request.stream = httpx.ByteStream(new_content)
                request.headers['Content-Length'] = str(len(new_content))
        except Exception:
            pass  # If anything fails, let the original request through


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
        
        # Create httpx client with minimal hook for Ollama compatibility
        client = httpx.AsyncClient(
            event_hooks={'request': [_fix_ollama_messages]}
        )
        
        return OpenAIChatModel(
            model_name=model_name,
            provider=OllamaProvider(
                base_url=config.ollama_base_url,
                http_client=client
            )
        )
    
    else:
        raise ValueError(
            f"Unknown provider: {provider}. "
            f"Available providers: {list(config.available_models.keys())}"
        )


def parse_model_id(model_id: str) -> tuple[str, str]:
    """Parse model ID in format "provider:model_name"."""
    if ":" not in model_id:
        raise ValueError(
            f"Invalid model ID format: {model_id}. "
            f"Expected format: 'provider:model_name' (e.g., 'openai:gpt-4o')"
        )
    
    provider, model_name = model_id.split(":", 1)
    return provider, model_name


def get_available_models() -> Dict[str, list[str]]:
    """Get all available models grouped by provider."""
    return config.available_models.copy()
