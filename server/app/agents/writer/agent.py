from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

from app.agents.common.schema import DocumentContext
from app.agents.common.tools import get_document_content, apply_document_edits
from app.agents.writer.prompt import WRITE_SYSTEM_PROMPT
from app.agents.providers import create_model


def create_write_agent(provider: str, model_name: str) -> Agent:
    """
    Create document editing agent with structured edit tool.
    """
    model = create_model(provider, model_name)
    return Agent(
        model,
        deps_type=DocumentContext,
        tools=[
            apply_document_edits,  # Structured edits (primary)
            get_document_content,  # For reading current content
            duckduckgo_search_tool(),
        ],
        system_prompt=WRITE_SYSTEM_PROMPT,
    )

