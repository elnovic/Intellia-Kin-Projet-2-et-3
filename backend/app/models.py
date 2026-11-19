"""Tables de la base de données."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite rend des dates sans fuseau : on les considère en UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow)


# --- Comptes ---------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _id()
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    # learner | admin
    role: Mapped[str] = mapped_column(String(20), default="learner")
    # jeune_diplome | entrepreneur | pme | autre
    audience: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _created_at()


# --- Cours -----------------------------------------------------------------


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = _id()
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # jeune_diplome | entrepreneur | pme | tous
    audience: Mapped[str] = mapped_column(String(20), default="tous")
    # tronc-commun | carriere | entrepreneuriat | organisations
    parcours: Mapped[str] = mapped_column(String(40), default="tronc-commun")
    # debutant | intermediaire | avance
    level: Mapped[str] = mapped_column(String(20), default="debutant")
    # self_paced | cohort | hybrid
    format: Mapped[str] = mapped_column(String(20), default="self_paced")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    objectives: Mapped[list[str]] = mapped_column(JsonType, default=list)
    skills: Mapped[list[str]] = mapped_column(JsonType, default=list)
    prerequisites: Mapped[str] = mapped_column(String(500), default="Aucun")
    trainer: Mapped[str] = mapped_column(String(200), default="Équipe Intellia Kin")
    cover_image: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=100)
    # Examen final : {"questions": [...]} au format des questions de quiz.
    exam: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    exam_pass_score: Mapped[int] = mapped_column(Integer, default=70)
    exam_distinction_score: Mapped[int] = mapped_column(Integer, default=90)
    # draft | published | archived
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    # depot : rédigé dans le dépôt et rechargé à chaque déploiement ; console : saisi en ligne
    source: Mapped[str] = mapped_column(String(20), default="console")
    content_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created_at()
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    modules: Mapped[list["Module"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Module.position",
    )


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = _id()
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=1)

    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="Lesson.position",
    )


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = _id()
    module_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), index=True
    )
    # Identifiant stable d'une leçon rédigée dans le dépôt.
    key: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(200))
    objective: Mapped[str] = mapped_column(String(500), default="")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=10)
    position: Mapped[int] = mapped_column(Integer, default=1)
    # Leçon visible sans inscription, pour donner un aperçu du cours.
    is_preview: Mapped[bool] = mapped_column(Boolean, default=False)

    module: Mapped[Module] = relationship(back_populates="lessons")
    blocks: Mapped[list["Block"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="Block.position",
    )


class Block(Base):
    """Un élément de contenu d'une leçon. Les types sont définis dans `blocks.py`."""

    __tablename__ = "blocks"

    id: Mapped[uuid.UUID] = _id()
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)

    lesson: Mapped[Lesson] = relationship(back_populates="blocks")


# --- Inscriptions, progression, examen, attestation ------------------------


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    # active | completed
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = _created_at()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("enrollment_id", "lesson_id"),)

    id: Mapped[uuid.UUID] = _id()
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[uuid.UUID] = _id()
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = _created_at()


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)

    id: Mapped[uuid.UUID] = _id()
    # IK-2026-000123
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    # Nom confirmé par l'apprenant ; seul un administrateur peut le corriger ensuite.
    full_name: Mapped[str] = mapped_column(String(120))
    score: Mapped[int] = mapped_column(Integer)
    distinction: Mapped[bool] = mapped_column(Boolean, default=False)
    issued_at: Mapped[datetime] = _created_at()

    course: Mapped[Course] = relationship()


# --- Annonces et événements ------------------------------------------------


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = _id()
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    # formation | evenement | actualite
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="")
    cover_image: Mapped[str | None] = mapped_column(String(500))
    audience: Mapped[str] = mapped_column(String(20), default="tous")
    # draft | published
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Événements et sessions de formation
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(60), default="Africa/Kinshasa")
    location: Mapped[str | None] = mapped_column(String(300))
    online_url: Mapped[str | None] = mapped_column(String(500))
    capacity: Mapped[int | None] = mapped_column(Integer)
    registration_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # none | internal | external
    registration_mode: Mapped[str] = mapped_column(String(20), default="none")
    external_url: Mapped[str | None] = mapped_column(String(500))
    course_slug: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = _created_at()


class Registration(Base):
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("announcement_id", "email"),)

    id: Mapped[uuid.UUID] = _id()
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(32))
    organization: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = _created_at()


# --- Outils IA --------------------------------------------------------------


class ToolUsage(Base):
    __tablename__ = "tool_usage"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    tool_slug: Mapped[str] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
