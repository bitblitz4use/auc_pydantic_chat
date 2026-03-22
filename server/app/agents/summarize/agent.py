from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

from app.agents.common.schema import DocumentContext
from app.agents.common.tools import get_source_content
from app.agents.summarize.prompt import SUMMARIZE_SYSTEM_PROMPT
from app.providers import create_model


def create_summarize_agent(provider: str, model_name: str) -> Agent:
    """
    Create source summarization agent with source tools.
    """
    model = create_model(provider, model_name)
    return Agent(
        model,
        deps_type=DocumentContext,
        tools=[
            get_source_content,
            duckduckgo_search_tool(),
        ],
        system_prompt=SUMMARIZE_SYSTEM_PROMPT,
    )

