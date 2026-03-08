"""Agent creation and management"""
from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

from app.agent.schema import DocumentContext, TaskMode
from app.agent.tools import get_document_content, update_document_content, get_source_content
from app.agent.tool_wrappers import smart_update_document_content
from app.agent.prompts import ASK_SYSTEM_PROMPT, WRITE_SYSTEM_PROMPT, SUMMARIZE_SYSTEM_PROMPT
from app.providers import create_model, parse_model_id
from app.config import config


def create_ask_agent(provider: str, model_name: str) -> Agent:
    """
    Create conversational agent without document tools.
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
    
    Returns:
        Agent instance configured for general conversation
    """
    model = create_model(provider, model_name)
    return Agent(
        model,
        deps_type=DocumentContext,
        tools=[duckduckgo_search_tool()],  # Only web search
        system_prompt=ASK_SYSTEM_PROMPT,
    )


def create_write_agent(provider: str, model_name: str) -> Agent:
    """
    Create document editing agent with smart document tools.
    
    The smart_update_document_content wrapper automatically:
    - Reads current document content before any update
    - Logs changes being made
    - Ensures full context is available
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
    
    Returns:
        Agent instance configured for document editing
    """
    model = create_model(provider, model_name)
    return Agent(
        model,
        deps_type=DocumentContext,
        tools=[
            smart_update_document_content,  # Smart wrapper that auto-reads before writing
            duckduckgo_search_tool(),
        ],
        system_prompt=WRITE_SYSTEM_PROMPT,
    )


def create_summarize_agent(provider: str, model_name: str) -> Agent:
    """
    Create source summarization agent with source tools.
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
    
    Returns:
        Agent instance configured for source summarization
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


def create_agent(provider: str, model_name: str, task_mode: TaskMode = TaskMode.ASK) -> Agent:
    """
    Create agent with specified model and task mode.
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
        task_mode: Task mode (ASK, WRITE, or SUMMARIZE)
    
    Returns:
        Agent instance configured with the specified model and mode
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
    
    Args:
        model_id: Model identifier in format "provider:model_name"
        task_mode: Task mode (ASK, WRITE, or SUMMARIZE)
    
    Returns:
        Agent instance configured with the specified model and mode
    """
    provider, model_name = parse_model_id(model_id)
    return create_agent(provider, model_name, task_mode)


# Create default agents for backward compatibility
default_model = create_model(config.default_provider, config.default_model)
document_agent = Agent(
    default_model,
    deps_type=DocumentContext,
    tools=[
        smart_update_document_content,  # Smart wrapper for automatic read-before-write
        duckduckgo_search_tool(),
    ],
    system_prompt=WRITE_SYSTEM_PROMPT,
)
