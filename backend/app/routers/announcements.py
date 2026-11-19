"""Annonces de formations, événements et actualités."""

import csv
import io
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_optional_user, require_admin
from ..models import Announcement, Registration, User, as_utc, utcnow
from ..schemas import (
    AnnouncementCreate,
    AnnouncementKind,
    AnnouncementOut,
    AnnouncementUpdate,
    RegistrationIn,
    RegistrationOut,
)
from .admin_courses import slugify

router = APIRouter(prefix="/announcements", tags=["Annonces"])
admin_router = APIRouter(
    prefix="/admin/announcements",
    tags=["Administration : annonces"],
    dependencies=[Depends(require_admin)],
)


def _count(db: Session, announcement: Announcement) -> int:
    return db.scalar(
        select(func.count(Registration.id)).where(Registration.announcement_id == announcement.id)
    ) or 0


def _registration_open(announcement: Announcement, count: int) -> bool:
    if announcement.registration_mode != "internal" or announcement.status != "published":
        return False
    now = utcnow()
    deadline = as_utc(announcement.registration_deadline) or as_utc(announcement.starts_at)
    if deadline is not None and now > deadline:
        return False
    if announcement.capacity is not None and count >= announcement.capacity:
        return False
    return True


def _out(db: Session, announcement: Announcement) -> AnnouncementOut:
    out = AnnouncementOut.model_validate(announcement)
    out.registered_count = _count(db, announcement)
    out.registration_open = _registration_open(announcement, out.registered_count)
    return out


def _visible(db: Session, slug: str) -> Announcement:
    announcement = db.scalar(
        select(Announcement).where(Announcement.slug == slug, Announcement.status == "published")
    )
    expires = as_utc(announcement.expires_at) if announcement else None
    if announcement is None or (expires is not None and expires < utcnow()):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Annonce introuvable.")
    return announcement


# --- Public ----------------------------------------------------------------


@router.get("", response_model=list[AnnouncementOut])
def list_announcements(
    kind: AnnouncementKind | None = None,
    when: Literal["all", "upcoming", "past"] = "all",
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[AnnouncementOut]:
    """Annonces publiées et non expirées : épinglées d'abord, puis les plus récentes."""
    now = utcnow()
    query = select(Announcement).where(
        Announcement.status == "published",
        or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
    )
    if kind is not None:
        query = query.where(Announcement.kind == kind)
    if when == "upcoming":
        query = query.where(Announcement.starts_at >= now)
    elif when == "past":
        query = query.where(Announcement.starts_at < now)
    query = query.order_by(Announcement.pinned.desc(), Announcement.published_at.desc())
    return [_out(db, a) for a in db.scalars(query.limit(max(1, min(limit, 100))))]


@router.get("/{slug}", response_model=AnnouncementOut)
def get_announcement(slug: str, db: Session = Depends(get_db)) -> AnnouncementOut:
    return _out(db, _visible(db, slug))


@router.post(
    "/{slug}/register", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED
)
def register(
    slug: str,
    payload: RegistrationIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> AnnouncementOut:
    """Inscription à un événement ou à une session, avec ou sans compte."""
    announcement = _visible(db, slug)
    if not _registration_open(announcement, _count(db, announcement)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Les inscriptions sont fermées.")
    db.add(
        Registration(
            announcement_id=announcement.id,
            user_id=user.id if user else None,
            full_name=" ".join(payload.full_name.split()),
            email=payload.email.lower(),
            phone=payload.phone,
            organization=payload.organization,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Cette adresse e-mail est déjà inscrite."
        ) from None
    return _out(db, announcement)


# --- Administration --------------------------------------------------------


def _get(db: Session, announcement_id: uuid.UUID) -> Announcement:
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Annonce introuvable.")
    return announcement


def _slug_taken(db: Session, slug: str, except_id: uuid.UUID | None = None) -> bool:
    query = select(Announcement.id).where(Announcement.slug == slug)
    if except_id is not None:
        query = query.where(Announcement.id != except_id)
    return db.scalar(query) is not None


@admin_router.get("", response_model=list[AnnouncementOut])
def admin_list(db: Session = Depends(get_db)) -> list[AnnouncementOut]:
    query = select(Announcement).order_by(Announcement.created_at.desc())
    return [_out(db, a) for a in db.scalars(query)]


@admin_router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def admin_create(payload: AnnouncementCreate, db: Session = Depends(get_db)) -> AnnouncementOut:
    data = payload.model_dump(mode="json", exclude={"slug"})
    if payload.slug:
        if _slug_taken(db, payload.slug):
            raise HTTPException(status.HTTP_409_CONFLICT, "Cette adresse est déjà prise.")
        slug = payload.slug
    else:
        base, slug, suffix = slugify(payload.title), slugify(payload.title), 2
        while _slug_taken(db, slug):
            slug, suffix = f"{base}-{suffix}", suffix + 1
    announcement = Announcement(**_with_dates(payload, data), slug=slug)
    db.add(announcement)
    db.commit()
    return _out(db, announcement)


def _with_dates(payload: AnnouncementCreate | AnnouncementUpdate, data: dict) -> dict:
    """`mode="json"` transforme les dates en texte : on remet les objets date."""
    for field in ("expires_at", "starts_at", "ends_at", "registration_deadline"):
        data[field] = getattr(payload, field)
    return data


@admin_router.put("/{announcement_id}", response_model=AnnouncementOut)
def admin_update(
    announcement_id: uuid.UUID, payload: AnnouncementUpdate, db: Session = Depends(get_db)
) -> AnnouncementOut:
    announcement = _get(db, announcement_id)
    if _slug_taken(db, payload.slug, except_id=announcement.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette adresse est déjà prise.")
    for field, value in _with_dates(payload, payload.model_dump(mode="json")).items():
        setattr(announcement, field, value)
    db.commit()
    return _out(db, announcement)


@admin_router.post("/{announcement_id}/publish", response_model=AnnouncementOut)
def admin_publish(announcement_id: uuid.UUID, db: Session = Depends(get_db)) -> AnnouncementOut:
    announcement = _get(db, announcement_id)
    announcement.status = "published"
    if announcement.published_at is None:
        announcement.published_at = utcnow()
    db.commit()
    return _out(db, announcement)


@admin_router.post("/{announcement_id}/unpublish", response_model=AnnouncementOut)
def admin_unpublish(announcement_id: uuid.UUID, db: Session = Depends(get_db)) -> AnnouncementOut:
    announcement = _get(db, announcement_id)
    announcement.status = "draft"
    db.commit()
    return _out(db, announcement)


@admin_router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(announcement_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_get(db, announcement_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_router.get("/{announcement_id}/registrations", response_model=list[RegistrationOut])
def admin_registrations(
    announcement_id: uuid.UUID, db: Session = Depends(get_db)
) -> list[Registration]:
    _get(db, announcement_id)
    return list(
        db.scalars(
            select(Registration)
            .where(Registration.announcement_id == announcement_id)
            .order_by(Registration.created_at)
        )
    )


@admin_router.get("/{announcement_id}/registrations.csv")
def admin_registrations_csv(announcement_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    """Liste des inscrits, lisible dans Excel (séparateur point-virgule)."""
    announcement = _get(db, announcement_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["Nom", "E-mail", "Téléphone", "Organisation", "Inscrit le"])
    for r in admin_registrations(announcement_id, db):
        writer.writerow(
            [r.full_name, r.email, r.phone or "", r.organization or "", f"{r.created_at:%d/%m/%Y %H:%M}"]
        )
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="inscrits-{announcement.slug}.csv"'},
    )
