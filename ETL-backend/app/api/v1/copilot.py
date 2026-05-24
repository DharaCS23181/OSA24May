"""
OneStopAnalytics Copilot API.

Provides a simple chat endpoint that proxies to Groq (default) or OpenAI.
The system prompt is loaded from knowledge.md in this directory, which
gives the model context about OneStopAnalytics's features and connector docs.

Requires either:
- GROQ_API_KEY set in .env (free, fast, uses LLaMA 3.1)
- Or the user provides their own API key in the request body
"""

import os
import openai

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/copilot", tags=["Copilot"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    api_key: str | None = None
    provider: str | None = None


def _load_knowledge_base() -> str:
    """
    Load the OneStopAnalytics knowledge base from knowledge.md.
    This file is injected as the system prompt, giving the AI
    awareness of our connector list, pipeline concepts, etc.
    """
    kb_path = os.path.join(os.path.dirname(__file__), "knowledge.md")
    try:
        with open(kb_path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "You are OneStopAnalytics Copilot. Help users build and troubleshoot data pipelines."


@router.post("/chat")
async def chat(req: ChatRequest):
    """
    Send a message to the AI and get a response.

    Defaults to Groq (LLaMA 3.1) for free, fast inference.
    Set provider='openai' and provide an api_key to use GPT-4o-mini instead.
    """
    api_key = req.api_key or settings.GROQ_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="No API key configured. Add GROQ_API_KEY to your .env file.",
        )

    provider = (req.provider or "groq").lower()
    if provider == "openai":
        base_url = "https://api.openai.com/v1"
        model = "gpt-4o-mini"
    else:
        base_url = "https://api.groq.com/openai/v1"
        model = "llama-3.1-8b-instant"

    # Build message list with system prompt first
    system_prompt = _load_knowledge_base()
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages:
        # The React UI uses "ai" as the role name for display purposes,
        # but the API requires "assistant"
        role = "assistant" if msg.role == "ai" else msg.role
        messages.append({"role": role, "content": msg.content})

    try:
        client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            max_tokens=1024,
        )
        return {"reply": response.choices[0].message.content}

    except Exception as exc:
        print(f"Internal Copilot Error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while communicating with the AI provider ({provider}).",
        )
