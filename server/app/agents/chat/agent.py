from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

from app.agents.common.schema import DocumentContext
from app.agents.chat.prompt import ASK_SYSTEM_PROMPT
from app.agents.providers import create_model


def create_ask_agent(provider: str, model_name: str) -> Agent:
    """
    Create conversational agent without document tools.
    """
    model = create_model(provider, model_name)
    return Agent(
        model,
        deps_type=DocumentContext,
        tools=[duckduckgo_search_tool()],  # Only web search
        system_prompt=ASK_SYSTEM_PROMPT,
    )

