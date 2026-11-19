"""Outils IA gratuits : trois utilisations par jour et par compte."""

from datetime import datetime, time, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import ai
from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..models import ToolUsage, User
from ..schemas import ToolOut, ToolQuotaOut, ToolResultOut
from ..tools import TOOLS

router = APIRouter(prefix="/tools", tags=["Outils IA"])


def _used_today(db: Session, user: User) -> int:
    start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    return db.scalar(
        select(func.count(ToolUsage.id)).where(
            ToolUsage.user_id == user.id, ToolUsage.created_at >= start
        )
    ) or 0


@router.get("", response_model=list[ToolOut])
def list_tools() -> list[ToolOut]:
    return [
        ToolOut(
            slug=tool.slug,
            title=tool.title,
            description=tool.description,
            course_slug=tool.course_slug,
            fields=tool.form.model_json_schema(),
        )
        for tool in TOOLS.values()
    ]


@router.get("/quota", response_model=ToolQuotaOut)
def quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ToolQuotaOut:
    limit = get_settings().ai_daily_limit
    used = _used_today(db, user)
    return ToolQuotaOut(
        daily_limit=limit,
        used_today=used,
        remaining_today=max(0, limit - used),
        available=ai.is_configured(),
    )


@router.post("/{slug}", response_model=ToolResultOut)
def run_tool(
    slug: str,
    payload: dict[str, Any],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ToolResultOut:
    tool = TOOLS.get(slug)
    if tool is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Outil introuvable.")
    try:
        form = tool.form.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {
                "message": "Certains champs sont incomplets.",
                "erreurs": [
                    {"champ": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                    for e in exc.errors()
                ],
            },
        ) from exc
    limit = get_settings().ai_daily_limit
    used = _used_today(db, user)
    if user.role != "admin" and used >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Vous avez utilisé vos {limit} générations du jour. Revenez demain !",
        )
    try:
        text, model = ai.complete(tool.system, tool.build(form), tool.max_tokens)
    except ai.AIUnavailable:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "L'assistant est très sollicité en ce moment. Réessayez dans quelques minutes : "
            "cette tentative n'est pas décomptée.",
        ) from None
    db.add(ToolUsage(user_id=user.id, tool_slug=tool.slug, model=model))
    db.commit()
    return ToolResultOut(markdown=text, remaining_today=max(0, limit - used - 1))
