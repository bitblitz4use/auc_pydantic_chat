"""Single-purpose agent for NIS-2 German summary (no tools)."""

from pydantic_ai import Agent

from app.agents.common.schema import DocumentContext
from app.agents.context.nis2_logic import NIS2_SYSTEM_PROMPT_DE
from app.agents.providers import create_model


def create_nis2_summary_agent(provider: str, model_name: str) -> Agent:
    return Agent(
        create_model(provider, model_name),
        deps_type=DocumentContext,
        system_prompt=NIS2_SYSTEM_PROMPT_DE,
        tools=[],
    )
