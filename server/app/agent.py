from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
import sys
from pathlib import Path

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.models import DocumentContext, TaskMode
from app.tools import get_document_content, update_document_content
from app.providers import create_model, parse_model_id
from app.config import config

# System prompt for conversational agent (no document tools)
ASK_SYSTEM_PROMPT = """You are a helpful AI assistant. 
Answer questions concisely and accurately.
You can search the web for current information when needed."""

# System prompt for document editing agent (with document tools)
WRITE_SYSTEM_PROMPT = """You are a document editing assistant with the following capabilities:

1. **Document Access**: You can read and write documents using the get_document_content and update_document_content tools.

2. **Editing Workflow**:
   - First, ALWAYS fetch the current document content using get_document_content
   - Analyze the user's request carefully
   - Modify the markdown content as requested
   - Write back the COMPLETE document using update_document_content
   
3. **Important Rules**:
   - ALWAYS work with the full document content - never just send partial updates
   - Preserve all existing content that shouldn't change
   - Maintain proper markdown formatting
   - When updating, provide a clear change_description
   
4. **Web Search**: You can also search the web using DuckDuckGo when users need current information.

Be concise and helpful. After making changes, let the user know they can accept or reject the changes in their editor.
"""


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
    Create document editing agent with document tools.
    
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
            get_document_content,
            update_document_content,
            duckduckgo_search_tool(),
        ],
        system_prompt=WRITE_SYSTEM_PROMPT,
    )


def create_agent(provider: str, model_name: str, task_mode: TaskMode = TaskMode.ASK) -> Agent:
    """
    Create agent with specified model and task mode.
    
    Args:
        provider: Provider slug (e.g., "openai", "ollama")
        model_name: Model identifier (e.g., "gpt-4o", "gpt-oss:20b")
        task_mode: Task mode (ASK or WRITE)
    
    Returns:
        Agent instance configured with the specified model and mode
    """
    if task_mode == TaskMode.WRITE:
        return create_write_agent(provider, model_name)
    else:
        return create_ask_agent(provider, model_name)


def create_agent_from_model_id(model_id: str, task_mode: TaskMode = TaskMode.ASK) -> Agent:
    """
    Create agent from model ID in format "provider:model_name".
    
    Args:
        model_id: Model identifier in format "provider:model_name"
        task_mode: Task mode (ASK or WRITE)
    
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
        get_document_content,
        update_document_content,
        duckduckgo_search_tool(),
    ],
    system_prompt=WRITE_SYSTEM_PROMPT,
)
