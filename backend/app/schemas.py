"""Formats des données échangées avec l'API."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

UserAudience = Literal["jeune_diplome", "entrepreneur", "pme", "autre"]
CourseAudience = Literal["jeune_diplome", "entrepreneur", "pme", "tous"]
CourseFormat = Literal["self_paced", "cohort", "hybrid"]

_SLUG = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
_PHONE = r"^\+[1-9]\d{7,14}$"  # format international, par exemple +243828245747


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Comptes ---------------------------------------------------------------


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=_PHONE)
    audience: UserAudience | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(_Out):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    phone_verified: bool
    role: str
    audience: str | None
    created_at: datetime


# --- Cours : saisie --------------------------------------------------------


class CourseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)
    summary: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=20_000)
    audience: CourseAudience = "tous"
    format: CourseFormat = "self_paced"
    is_free: bool = True
    price_usd: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    certificate_min_score: int | None = Field(default=None, ge=0, le=100)
    is_template: bool = False

    @model_validator(mode="after")
    def _price_matches_access(self) -> "CourseCreate":
        if self.is_free:
            self.price_usd = None
        elif self.price_usd is None or self.price_usd <= 0:
            raise ValueError("un cours payant doit avoir un prix supérieur à zéro")
        return self


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=20_000)
    audience: CourseAudience | None = None
    format: CourseFormat | None = None
    is_free: bool | None = None
    price_usd: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    certificate_min_score: int | None = Field(default=None, ge=0, le=100)
    is_template: bool | None = None


class ModuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ModuleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class LessonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    is_preview: bool = False


class LessonUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    is_preview: bool | None = None


class BlockIn(BaseModel):
    type: str = Field(min_length=1, max_length=40)
    data: dict[str, Any] = Field(default_factory=dict)


class BlockUpdate(BaseModel):
    data: dict[str, Any]


class ReorderIn(BaseModel):
    """Identifiants dans le nouvel ordre. Tous les éléments doivent y figurer."""

    ids: list[uuid.UUID] = Field(min_length=1)


# --- Cours : lecture -------------------------------------------------------


class CourseSummary(_Out):
    id: uuid.UUID
    slug: str
    title: str
    summary: str
    audience: str
    format: str
    is_free: bool
    price_usd: Decimal | None
    status: str
    published_at: datetime | None


class LessonOutline(_Out):
    id: uuid.UUID
    title: str
    position: int
    is_preview: bool


class ModuleOutline(_Out):
    id: uuid.UUID
    title: str
    position: int
    lessons: list[LessonOutline]


class CourseDetail(CourseSummary):
    """Fiche publique d'un cours : programme sans le contenu des leçons."""

    description: str
    certificate_min_score: int | None
    modules: list[ModuleOutline]


class BlockOut(_Out):
    id: uuid.UUID
    type: str
    position: int
    data: dict[str, Any]


class LessonFull(LessonOutline):
    blocks: list[BlockOut]


class ModuleFull(_Out):
    id: uuid.UUID
    title: str
    position: int
    lessons: list[LessonFull]


class CourseFull(CourseSummary):
    """Cours complet, avec tous les blocs. Réservé à la console."""

    description: str
    certificate_min_score: int | None
    is_template: bool
    created_at: datetime
    modules: list[ModuleFull]


# --- Inscriptions ----------------------------------------------------------


class EnrollmentOut(_Out):
    id: uuid.UUID
    course_id: uuid.UUID
    status: str
    created_at: datetime
    completed_at: datetime | None


class ProgressOut(BaseModel):
    completed_lessons: int
    total_lessons: int
    percent: int
