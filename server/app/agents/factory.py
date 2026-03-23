"""Factory functions to create agents by mode and defaults."""
from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

from app.agents.common.schema import DocumentContext, TaskMode
from app.agents.writer.agent import create_write_agent
from app.agents.chat.agent import create_ask_agent
from app.agents.summarize.agent import create_summarize_agent
from app.agents.writer.prompt import WRITE_SYSTEM_PROMPT
from app.agents.common.tools import get_document_content, apply_document_edits
from app.agents.providers import create_model, parse_model_id
from app.config import config


def create_agent(provider: str, model_name: str, task_mode: TaskMode = TaskMode.ASK) -> Agent:
    """
    Create agent with specified model and task mode.
    """
    if task_mode == TaskMode.WRITE:
        return create_write_agent(provider, model_name)
    elif task_mode == TaskMode.SUMMARIZE:
        return create_summarize_agent(provider, model_name)
    else:
        return create_ask_agent(provider, model_name)


def create_agent_from_model_id(model_id: str, task_mode: TaskMode = TaskMode.ASK) -> Agent:
    """
    Create agent from model ID in format "provider:model_name".
    """
    provider, model_name = parse_model_id(model_id)
    return create_agent(provider, model_name, task_mode)


# Backward-compat default write-focused agent instance
_default_model = create_model(config.default_provider, config.default_model)
document_agent = Agent(
    _default_model,
    deps_type=DocumentContext,
    tools=[
        apply_document_edits,  # Primary tool (structured edits)
        get_document_content,  # For reading
        duckduckgo_search_tool(),
    ],
    system_prompt=WRITE_SYSTEM_PROMPT,
)

