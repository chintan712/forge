from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

AgentKind = Literal["claude", "openai", "gemini", "ollama"]


class CredentialStatus(BaseModel):
    agent_kind: AgentKind
    has_key: bool
    updated_at: Optional[datetime] = None


class CredentialSet(BaseModel):
    api_key: str = Field(min_length=1)
