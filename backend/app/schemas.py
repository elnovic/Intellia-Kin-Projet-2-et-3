"""Formats des données échangées avec l'API."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, model_validator

UserAudience = Literal["jeune_diplome", "entrepreneur", "pme", "autre"]
CourseAudience = Literal["jeune_diplome", "entrepreneur", "pme", "tous"]
CourseFormat = Literal["self_paced", "cohort", "hybrid"]
CourseLevel = Literal["debutant", "intermediaire", "avance"]
Parcours = Literal["tronc-commun", "carriere", "entrepreneuriat", "organisations"]
AnnouncementKind = Literal["formation", "evenement", "actualite"]
RegistrationMode = Literal["none", "internal", "external"]

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


# --- Cours : saisie (console) ----------------------------------------------


class CourseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)
    summary: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=20_000)
    audience: CourseAudience = "tous"
    parcours: Parcours = "tronc-commun"
    level: CourseLevel = "debutant"
    format: CourseFormat = "self_paced"
    duration_minutes: int = Field(default=60, ge=5, le=6000)
    objectives: list[str] = Field(default_factory=list, max_length=12)
    skills: list[str] = Field(default_factory=list, max_length=8)
    prerequisites: str = Field(default="Aucun", max_length=500)
    trainer: str = Field(default="Équipe Intellia Kin", max_length=200)
    cover_image: str | None = Field(default=None, max_length=500)
    position: int = Field(default=100, ge=0, le=10_000)
    exam_pass_score: int = Field(default=70, ge=0, le=100)
    exam_distinction_score: int = Field(default=90, ge=0, le=100)
    is_template: bool = False


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=20_000)
    audience: CourseAudience | None = None
    parcours: Parcours | None = None
    level: CourseLevel | None = None
    format: CourseFormat | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=6000)
    objectives: list[str] | None = Field(default=None, max_length=12)
    skills: list[str] | None = Field(default=None, max_length=8)
    prerequisites: str | None = Field(default=None, max_length=500)
    trainer: str | None = Field(default=None, max_length=200)
    cover_image: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0, le=10_000)
    exam_pass_score: int | None = Field(default=None, ge=0, le=100)
    exam_distinction_score: int | None = Field(default=None, ge=0, le=100)
    is_template: bool | None = None


class ExamIn(BaseModel):
    questions: list[dict[str, Any]] = Field(min_length=1, max_length=100)


class ModuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ModuleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class LessonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(default="", max_length=500)
    duration_minutes: int = Field(default=10, ge=1, le=600)
    is_preview: bool = False


class LessonUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    objective: str | None = Field(default=None, max_length=500)
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
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
    parcours: str
    level: str
    format: str
    duration_minutes: int
    cover_image: str | None
    position: int
    status: str
    source: str
    published_at: datetime | None


class LessonOutline(_Out):
    id: uuid.UUID
    title: str
    objective: str
    duration_minutes: int
    position: int
    is_preview: bool


class ModuleOutline(_Out):
    id: uuid.UUID
    title: str
    position: int
    lessons: list[LessonOutline]


class CourseDetail(CourseSummary):
    """Fiche publique d'un cours : description et programme, sans le contenu des leçons."""

    description: str
    objectives: list[str]
    skills: list[str]
    prerequisites: str
    trainer: str
    exam_pass_score: int
    exam_question_count: int = 0
    modules: list[ModuleOutline]


class BlockOut(_Out):
    id: uuid.UUID
    type: str
    position: int
    data: dict[str, Any]


class LessonFull(LessonOutline):
    blocks: list[BlockOut]


class LessonAdminOut(LessonFull):
    course_id: uuid.UUID | None = None
    course_title: str = ""
    course_source: str = "console"


class ModuleFull(_Out):
    id: uuid.UUID
    title: str
    position: int
    lessons: list[LessonFull]


class CourseFull(CourseSummary):
    """Cours complet, avec tous les blocs et l'examen. Réservé à l'administration."""

    description: str
    objectives: list[str]
    skills: list[str]
    prerequisites: str
    trainer: str
    exam: dict[str, Any]
    exam_pass_score: int
    exam_distinction_score: int
    is_template: bool
    created_at: datetime
    modules: list[ModuleFull]


# --- Parcours de l'apprenant -----------------------------------------------


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
    completed_lesson_ids: list[uuid.UUID] = []
    exam_passed: bool = False
    best_score: int | None = None
    certificate_number: str | None = None


class MyCourseOut(BaseModel):
    course: CourseSummary
    progress: ProgressOut


class AnswersIn(BaseModel):
    """`answers[i]` : indices des options cochées pour la question i."""

    answers: list[list[int]] = Field(max_length=200)


class QuizCheckOut(BaseModel):
    results: list[dict[str, Any]]
    score: int


class ExamOut(BaseModel):
    questions: list[dict[str, Any]]
    pass_score: int
    attempts_left: int
    retry_at: datetime | None = None
    best_score: int | None = None
    passed: bool = False


class ExamResultOut(BaseModel):
    score: int
    passed: bool
    distinction: bool
    results: list[dict[str, Any]]
    attempts_left: int


class CertificateRequest(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)


class CertificateFix(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)


class CertificateOut(BaseModel):
    number: str
    full_name: str
    course_slug: str
    course_title: str
    level: str
    duration_minutes: int
    skills: list[str]
    score: int
    distinction: bool
    issued_at: datetime
    signatory_name: str = "Elnovic NTEDIKA"
    signatory_title: str = "COO, Intellia Kin"


# --- Annonces --------------------------------------------------------------


class AnnouncementBase(BaseModel):
    kind: AnnouncementKind
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(min_length=10, max_length=160)
    body: str = Field(default="", max_length=30_000)
    cover_image: HttpUrl | None = None
    audience: CourseAudience = "tous"
    pinned: bool = False
    expires_at: datetime | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    timezone: str = Field(default="Africa/Kinshasa", max_length=60)
    location: str | None = Field(default=None, max_length=300)
    online_url: HttpUrl | None = None
    capacity: int | None = Field(default=None, ge=1, le=100_000)
    registration_deadline: datetime | None = None
    registration_mode: RegistrationMode = "none"
    external_url: HttpUrl | None = None
    course_slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)

    @model_validator(mode="after")
    def _coherent(self) -> "AnnouncementBase":
        if self.kind == "evenement" and self.starts_at is None:
            raise ValueError("un événement doit avoir une date de début")
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("la fin doit être après le début")
        if self.registration_mode == "external" and self.external_url is None:
            raise ValueError("indiquer le lien d'inscription externe")
        if self.kind == "actualite":
            self.registration_mode = "none"
        return self


class AnnouncementCreate(AnnouncementBase):
    slug: str | None = Field(default=None, pattern=_SLUG, max_length=120)


class AnnouncementUpdate(AnnouncementBase):
    """Remplacement complet : la console renvoie toute l'annonce."""

    slug: str = Field(pattern=_SLUG, max_length=120)


class AnnouncementOut(_Out):
    id: uuid.UUID
    slug: str
    kind: str
    title: str
    summary: str
    body: str
    cover_image: str | None
    audience: str
    status: str
    pinned: bool
    published_at: datetime | None
    expires_at: datetime | None
    starts_at: datetime | None
    ends_at: datetime | None
    timezone: str
    location: str | None
    online_url: str | None
    capacity: int | None
    registration_deadline: datetime | None
    registration_mode: str
    external_url: str | None
    course_slug: str | None
    registered_count: int = 0
    registration_open: bool = False


class RegistrationIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, pattern=_PHONE)
    organization: str | None = Field(default=None, max_length=200)


class RegistrationOut(_Out):
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    organization: str | None
    created_at: datetime


# --- Outils IA --------------------------------------------------------------


class ToolOut(BaseModel):
    slug: str
    title: str
    description: str
    course_slug: str | None
    fields: dict[str, Any]


class ToolResultOut(BaseModel):
    markdown: str
    remaining_today: int


class ToolQuotaOut(BaseModel):
    daily_limit: int
    used_today: int
    remaining_today: int
    available: bool
