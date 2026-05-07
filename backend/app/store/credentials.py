# modified by agent: add ollama base url config functions
from datetime import datetime, timezone
from typing import Optional

from app.db import get_conn
from app.schemas.credentials import AgentKind, CredentialStatus

AGENT_KINDS: tuple[AgentKind, ...] = ("claude", "openai", "gemini", "ollama")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_status() -> list[CredentialStatus]:
    with get_conn() as conn:
        rows = {
            r["agent_kind"]: r
            for r in conn.execute("SELECT agent_kind, updated_at FROM credentials")
        }
    out: list[CredentialStatus] = []
    for kind in AGENT_KINDS:
        row = rows.get(kind)
        out.append(
            CredentialStatus(
                agent_kind=kind,
                has_key=row is not None,
                updated_at=datetime.fromisoformat(row["updated_at"]) if row else None,
            )
        )
    return out


def get_key(agent_kind: AgentKind) -> Optional[str]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT api_key FROM credentials WHERE agent_kind = ?", (agent_kind,)
        ).fetchone()
    return row["api_key"] if row else None


def upsert_key(agent_kind: AgentKind, api_key: str) -> CredentialStatus:
    now = _now_iso()
    with get_conn() as conn:
        try:
            conn.execute("BEGIN")
            conn.execute(
                """
                INSERT INTO credentials (agent_kind, api_key, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(agent_kind) DO UPDATE SET
                    api_key    = excluded.api_key,
                    updated_at = excluded.updated_at
                """,
                (agent_kind, api_key, now, now),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return CredentialStatus(
        agent_kind=agent_kind,
        has_key=True,
        updated_at=datetime.fromisoformat(now),
    )


def delete_key(agent_kind: AgentKind) -> bool:
    with get_conn() as conn:
        try:
            conn.execute("BEGIN")
            cur = conn.execute(
                "DELETE FROM credentials WHERE agent_kind = ?", (agent_kind,)
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return cur.rowcount > 0


def get_ollama_base_url() -> str:
    url = get_key("ollama_url") # type: ignore
    return url if url else "http://localhost:11434"


def set_ollama_base_url(url: str) -> None:
    upsert_key("ollama_url", url) # type: ignore
