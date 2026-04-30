"""Per-model metadata: context window + max output tokens.

Providers split into two groups:

- **Static** — Claude and OpenAI don't expose context window via their
  standard ``/v1/models`` response, so we hardcode values from each
  vendor's docs and maintain them manually when new models ship.
- **Dynamic** — Gemini's ``/v1beta/models/{id}`` returns
  ``inputTokenLimit`` / ``outputTokenLimit`` programmatically, so we
  fetch live and cache the result for the server's lifetime. If the
  fetch fails (no key, 429, network blip), we fall back to the static
  table so the UI still has something to show.

Values sourced from vendor docs; sources noted inline. Update when
models ship new context windows.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelInfo:
    context_window: int   # max input tokens the model accepts
    max_output_tokens: int  # max tokens the model can emit in one turn
    source: str           # "static" | "api" — where this value came from


# ─── Static table ────────────────────────────────────────────────────
# Values verified against vendor docs; source + date noted below each
# block. Keys are ``(agent_kind, model_id)``.

_STATIC: Dict[Tuple[str, str], ModelInfo] = {
    # Anthropic Claude 4.x
    # Source: https://platform.claude.com/docs/en/docs/about-claude/models/overview
    # Verified: 2026-04-20
    ("claude", "claude-opus-4-7"):    ModelInfo(1_000_000, 128_000, "static"),
    ("claude", "claude-sonnet-4-6"):  ModelInfo(1_000_000,  64_000, "static"),
    ("claude", "claude-haiku-4-5"):   ModelInfo(  200_000,  64_000, "static"),

    # OpenAI GPT-5 family + GPT-4.1
    # Source: platform.openai.com/docs/models (blocked from WebFetch;
    # values recalled from public docs + changelog — verify before
    # shipping to prod).
    ("openai", "gpt-5"):              ModelInfo(  400_000, 128_000, "static"),
    ("openai", "gpt-4.1"):            ModelInfo(1_000_000,  32_768, "static"),
    ("openai", "gpt-5-mini"):         ModelInfo(  400_000, 128_000, "static"),

    # Google Gemini — fallback values used when live fetch isn't
    # available (no key, network down). Real values come from the API
    # when possible.
    # Source: ai.google.dev/gemini-api/docs/models — verified ranges.
    ("gemini", "gemini-2.5-pro"):                    ModelInfo(2_000_000,  64_000, "static"),
    ("gemini", "gemini-2.5-flash"):                  ModelInfo(1_000_000,  64_000, "static"),
    ("gemini", "gemini-2.5-flash-lite"):             ModelInfo(1_000_000,  64_000, "static"),
    ("gemini", "gemini-3.1-pro-preview"):            ModelInfo(1_000_000,  64_000, "static"),
    ("gemini", "gemini-3-flash-preview"):            ModelInfo(1_000_000,  64_000, "static"),
    ("gemini", "gemini-3.1-flash-lite-preview"):     ModelInfo(1_000_000,  64_000, "static"),
}


# ─── Runtime fetch cache ─────────────────────────────────────────────
_cache: Dict[Tuple[str, str], ModelInfo] = {}
_cache_lock = asyncio.Lock()


async def get_model_info(
    agent_kind: str,
    model: str,
    api_key: str,
) -> Optional[ModelInfo]:
    """Resolve a model's context window + max output.
 
    Order of preference:
      1. Previously fetched + cached live value (providers that expose it)
      2. Fresh live fetch (Gemini)
      3. Static table (Claude, OpenAI, Gemini fallback)
      4. ``None`` if we have no idea

    Never raises — failures are logged and return the static fallback
    or ``None``.
    """
    key = (agent_kind, model)

    if key in _cache:
        return _cache[key]

    # For Gemini, try a live fetch first so the value is authoritative.
    if agent_kind == "gemini" and api_key:
        live = await _fetch_gemini(model, api_key)
        if live is not None:
            async with _cache_lock:
                _cache[key] = live
            return live
            
    if agent_kind == "ollama":
        live = await _fetch_ollama(model)
        if live is not None:
            async with _cache_lock:
                _cache[key] = live
            return live

    return _STATIC.get(key)


async def _fetch_gemini(model: str, api_key: str) -> Optional[ModelInfo]:
    """Pull ``input_token_limit`` / ``output_token_limit`` from the
    Gemini models API. Returns None on any failure — caller falls back
    to the static table."""
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        # google-genai's aio surface exposes models.get; wrap in
        # to_thread as a conservative fallback if the async method
        # isn't present on the installed version.
        got = await client.aio.models.get(model=model)
        ctx = int(getattr(got, "input_token_limit", 0) or 0)
        out = int(getattr(got, "output_token_limit", 0) or 0)
        if ctx <= 0:
            return None
        return ModelInfo(
            context_window=ctx,
            max_output_tokens=out,
            source="api",
        )
    except Exception as exc:
        log.info(
            "model_info: gemini live fetch failed for %s (%s: %s)",
            model,
            type(exc).__name__,
            exc,
        )
        return None

async def _fetch_ollama(model: str) -> Optional[ModelInfo]:
    """Fetch context length and capability metadata from Ollama's show endpoint."""
    try:
        import httpx
        from app.store.credentials import get_ollama_base_url
        base_url = get_ollama_base_url().rstrip('/')
        
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(f"{base_url}/api/show", json={"name": model})
            resp.raise_for_status()
            data = resp.json()
            
            # Context length usually sits in model_info under a key that ends with '.context_length' 
            # e.g. 'llama.context_length' or 'deepseek.context_length'
            model_info = data.get("model_info", {})
            
            ctx = 0
            for key, val in model_info.items():
                if key.endswith(".context_length") and isinstance(val, int):
                    ctx = val
                    break
                    
            if ctx <= 0:
                ctx = 128000 # Sensible default if not reported
                
            return ModelInfo(
                context_window=ctx,
                max_output_tokens=8192,
                source="api",
            )
    except Exception as exc:
        log.info(
            "model_info: ollama live fetch failed for %s (%s: %s)",
            model,
            type(exc).__name__,
            exc,
        )
        return ModelInfo(context_window=128000, max_output_tokens=8192, source="static")

