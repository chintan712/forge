from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, status

from app import runtime
from app.api.models import MODELS
from app.schemas.sessions import Session, SessionCreate, SessionUpdate
from app.store import credentials as cred_store
from app.store import messages as msg_store
from app.store import sessions as store

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=List[Session])
async def list_sessions() -> List[Session]:
    return store.list_all()


@router.get("/usage")
async def sessions_usage() -> Dict[str, int]:
    """Map of ``session_id`` → most recent ``input_tokens`` value.
    Sessions that haven't emitted a usage event yet are omitted."""
    return store.last_input_tokens_by_session()


@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate) -> Session:
    if cred_store.get_key(payload.agent_kind) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"No API key configured for {payload.agent_kind}. Add it in Settings.",
        )

    p = Path(payload.folder_path).expanduser()
    try:
        resolved = p.resolve(strict=False)  
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Invalid folder path: {exc}"
        ) from exc
    if not resolved.exists():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Folder does not exist: {resolved}"
        )
    if not resolved.is_dir():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Not a directory: {resolved}"
        )

    payload = payload.model_copy(update={"folder_path": str(resolved)})
    return store.create(payload)


@router.get("/{session_id}", response_model=Session)
async def get_session(session_id: str) -> Session:
    found = store.get(session_id)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return found


@router.patch("/{session_id}", response_model=Session)
async def update_session(session_id: str, payload: SessionUpdate) -> Session:
    sess = store.get(session_id)
    if sess is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if payload.model is not None:
        from app.api.models import get_all_models_dict
        all_models = await get_all_models_dict()
        allowed = all_models.get(sess.agent_kind, [])
        if payload.model not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Model '{payload.model}' is not valid for provider '{sess.agent_kind}'.",
            )
        store.update_model(session_id, payload.model)
    updated = store.get(session_id)
    assert updated is not None
    return updated


@router.get("/{session_id}/messages")
async def get_session_messages(session_id: str) -> List[Dict[str, Any]]:
    if store.get(session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return msg_store.list_for_session(session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str) -> None:
    if store.get(session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    await runtime.remove(session_id)
    store.delete(session_id)
