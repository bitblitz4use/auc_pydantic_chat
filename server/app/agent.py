from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
import sys
from pathlib import Path

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.models import DocumentContext
from app.tools import get_document_content, update_document_content
from app.config import OLLAMA_BASE_URL, MODEL_NAME

# Ollama model configuration
ollama_model = OpenAIChatModel(
    model_name=MODEL_NAME,
    provider=OllamaProvider(base_url=OLLAMA_BASE_URL),  
)

# Create document editor agent with tools
document_agent = Agent(
    ollama_model,
    deps_type=DocumentContext,
    tools=[
        get_document_content,
        update_document_content,
        duckduckgo_search_tool(),
    ],
    system_prompt="""You are a helpful document editing assistant with the following capabilities:

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
""",
)
