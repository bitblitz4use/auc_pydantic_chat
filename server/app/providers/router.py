"""Providers API routes."""
import logging
from typing import Dict

from fastapi import APIRouter

from app.agents.providers import get_available_models
from app.providers.schema import ModelInfo, ProvidersResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/providers", response_model=ProvidersResponse)
async def get_providers():
    """
    Discovery endpoint returning available models grouped by provider.
    Returns models in format expected by the frontend model selector.
    """
    logger.info("📋 Providers discovery request received")

    models = []

    # Map provider slugs to display names
    provider_names: Dict[str, str] = {"ollama": "Ollama", "openai": "OpenAI"}

    available_models = get_available_models()

    for provider_slug, model_list in available_models.items():
        provider_name = provider_names.get(provider_slug, provider_slug.title())

        for model_id in model_list:
            # Use original model ID format (no formatting - keep lowercase, colons, hyphens)
            # Create full model ID in format "provider:model_name"
            full_model_id = f"{provider_slug}:{model_id}"

            models.append(
                ModelInfo(
                    id=full_model_id,
                    name=model_id,  # Use original model ID as name (e.g., "gpt-oss:20b")
                    chef=provider_name,
                    chefSlug=provider_slug,
                    providers=[provider_slug],
                )
            )

    logger.info(
        "✅ Returning %s models from %s providers", len(models), len(available_models)
    )
    return ProvidersResponse(models=models)

