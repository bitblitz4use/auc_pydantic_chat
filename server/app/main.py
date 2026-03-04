from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider

from pydantic_ai import Agent
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

app = FastAPI(title="Pydantic AI Chat API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a Pydantic AI agent with Ollama
# Make sure Ollama is running and you have a model pulled (e.g., ollama pull llama3.2)

ollama_model = OpenAIChatModel(
    model_name='gpt-oss:20b',
    provider=OllamaProvider(base_url='http://192.168.178.83:11434/v1'),  
)

agent = Agent(ollama_model, system_prompt='You are a helpful assistant.')


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}


@app.post("/api/chat")
async def chat(request: Request) -> Response:
    """
    Chat endpoint that handles Vercel AI Data Stream Protocol requests.
    This endpoint receives chat messages from the frontend and streams
    responses back using Server-Sent Events (SSE).
    """
    return await VercelAIAdapter.dispatch_request(
        request,
        agent=agent,
        sdk_version=6 
    )