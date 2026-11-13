"""Types de blocs de contenu des leçons.

Une leçon est une pile de blocs. Chaque bloc a un type et un contenu (`data`).
Ce module définit les types acceptés, valide le contenu saisi dans la console
et prépare la version envoyée aux apprenants.

Ajouter un type de bloc : créer une classe qui hérite de `_Block`, lui donner
un `type`, un `label` et une `family`, puis l'ajouter à `_CLASSES`.
Ce module ne dépend que de Pydantic.
"""

import copy
from datetime import datetime
from typing import Annotated, Any, ClassVar, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)


class BlockError(ValueError):
    """Contenu de bloc refusé. `errors` détaille chaque champ en cause."""

    def __init__(self, message: str, errors: list[dict[str, str]] | None = None):
        super().__init__(message)
        self.errors = errors or []


def _check_media_url(value: str) -> str:
    if value.startswith("https://") or value.startswith("/media/"):
        return value
    raise ValueError("l'adresse doit commencer par https:// ou par /media/")


def _check_https(value: str) -> str:
    if value.startswith("https://"):
        return value
    raise ValueError("l'adresse doit commencer par https://")


Text = Annotated[str, Field(min_length=1, max_length=50_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=300)]
MediaUrl = Annotated[str, Field(max_length=2000), AfterValidator(_check_media_url)]
HttpsUrl = Annotated[str, Field(max_length=2000), AfterValidator(_check_https)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Block(_Strict):
    label: ClassVar[str]
    family: ClassVar[str]


# --- Lecture ---------------------------------------------------------------


class TextBlock(_Block):
    label = "Texte"
    family = "Lecture"
    type: Literal["text"]
    markdown: Text


class ImageItem(_Strict):
    url: MediaUrl
    alt: ShortText
    caption: str | None = Field(default=None, max_length=300)


class ImageBlock(_Block):
    label = "Image"
    family = "Lecture"
    type: Literal["image"]
    url: MediaUrl
    alt: ShortText
    caption: str | None = Field(default=None, max_length=300)


class GalleryBlock(_Block):
    label = "Galerie d'images"
    family = "Lecture"
    type: Literal["gallery"]
    images: list[ImageItem] = Field(min_length=1, max_length=30)


class CalloutBlock(_Block):
    label = "Encadré"
    family = "Lecture"
    type: Literal["callout"]
    variant: Literal["info", "tip", "warning"] = "info"
    markdown: Text


class TableBlock(_Block):
    label = "Tableau"
    family = "Lecture"
    type: Literal["table"]
    headers: list[ShortText] = Field(min_length=1, max_length=12)
    rows: list[list[str]] = Field(min_length=1, max_length=200)
    caption: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _rows_match_headers(self) -> "TableBlock":
        width = len(self.headers)
        for index, row in enumerate(self.rows, start=1):
            if len(row) != width:
                raise ValueError(
                    f"la ligne {index} a {len(row)} cellules, il en faut {width}"
                )
        return self


class CodeBlock(_Block):
    label = "Code ou prompt"
    family = "Lecture"
    type: Literal["code"]
    language: str = Field(default="text", max_length=40)
    code: Text


# --- Média -----------------------------------------------------------------


class VideoBlock(_Block):
    label = "Vidéo"
    family = "Média"
    type: Literal["video"]
    source: Literal["upload", "link"] = "link"
    url: MediaUrl
    title: str | None = Field(default=None, max_length=300)
    duration_seconds: int | None = Field(default=None, ge=1, le=6 * 3600)

    @model_validator(mode="after")
    def _source_matches_url(self) -> "VideoBlock":
        if self.source == "upload" and not self.url.startswith("/media/"):
            raise ValueError("une vidéo téléversée doit avoir une adresse en /media/")
        if self.source == "link" and not self.url.startswith("https://"):
            raise ValueError("un lien vidéo doit commencer par https://")
        return self


class AudioBlock(_Block):
    label = "Audio"
    family = "Média"
    type: Literal["audio"]
    url: MediaUrl
    title: str | None = Field(default=None, max_length=300)


class PdfBlock(_Block):
    label = "Document PDF"
    family = "Média"
    type: Literal["pdf"]
    url: MediaUrl
    title: ShortText


class SlidesBlock(_Block):
    label = "Diaporama"
    family = "Média"
    type: Literal["slides"]
    url: MediaUrl
    title: ShortText


class FileBlock(_Block):
    label = "Fichier à télécharger"
    family = "Média"
    type: Literal["file"]
    url: MediaUrl
    filename: ShortText
    size_bytes: int | None = Field(default=None, ge=0)


class EmbedBlock(_Block):
    label = "Contenu intégré"
    family = "Média"
    type: Literal["embed"]
    url: HttpsUrl
    title: ShortText


# --- Évaluation ------------------------------------------------------------


class Option(_Strict):
    text: ShortText
    correct: bool = False


class Question(_Strict):
    prompt: Annotated[str, Field(min_length=1, max_length=2000)]
    kind: Literal["single", "multiple", "true_false"] = "single"
    options: list[Option] = Field(min_length=2, max_length=10)
    explanation: str | None = Field(default=None, max_length=2000)
    points: int = Field(default=1, ge=1, le=100)

    @model_validator(mode="after")
    def _check_answers(self) -> "Question":
        correct = sum(1 for option in self.options if option.correct)
        if self.kind == "single" and correct != 1:
            raise ValueError("une question à choix unique a exactement une bonne réponse")
        if self.kind == "multiple" and correct < 1:
            raise ValueError("une question à choix multiple a au moins une bonne réponse")
        if self.kind == "true_false" and (len(self.options) != 2 or correct != 1):
            raise ValueError(
                "une question vrai ou faux a deux options, dont une seule correcte"
            )
        return self


class QuizBlock(_Block):
    label = "Quiz"
    family = "Évaluation"
    type: Literal["quiz"]
    title: str | None = Field(default=None, max_length=300)
    questions: list[Question] = Field(min_length=1, max_length=100)
    pass_score: int | None = Field(default=None, ge=0, le=100)


class OpenQuestionBlock(_Block):
    label = "Réponse libre"
    family = "Évaluation"
    type: Literal["open_question"]
    prompt: Annotated[str, Field(min_length=1, max_length=2000)]
    guidance: str | None = Field(default=None, max_length=2000)
    max_words: int | None = Field(default=None, ge=10, le=5000)


class AssignmentBlock(_Block):
    label = "Devoir à rendre"
    family = "Évaluation"
    type: Literal["assignment"]
    title: ShortText
    instructions: Text
    due_days: int | None = Field(default=None, ge=1, le=365)
    accepted_formats: list[str] = Field(default_factory=lambda: ["pdf", "docx"], max_length=10)


class ExamBlock(_Block):
    label = "Examen final"
    family = "Évaluation"
    type: Literal["exam"]
    title: ShortText
    questions: list[Question] = Field(min_length=1, max_length=200)
    duration_minutes: int = Field(ge=1, le=480)
    pass_score: int = Field(ge=0, le=100)
    max_attempts: int = Field(default=3, ge=1, le=20)


# --- Pratique --------------------------------------------------------------


class ToolExerciseBlock(_Block):
    label = "Exercice avec un outil IA"
    family = "Pratique"
    type: Literal["tool_exercise"]
    tool_slug: Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
    instructions: Text


class CaseStudyBlock(_Block):
    label = "Étude de cas"
    family = "Pratique"
    type: Literal["case_study"]
    title: ShortText
    markdown: Text
    questions: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(
        default_factory=list, max_length=30
    )


# --- En direct -------------------------------------------------------------


class LiveSessionBlock(_Block):
    label = "Séance en direct"
    family = "En direct"
    type: Literal["live_session"]
    title: ShortText
    starts_at: datetime
    duration_minutes: int = Field(ge=5, le=600)
    join_url: HttpsUrl | None = None
    location: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _has_a_place(self) -> "LiveSessionBlock":
        if not self.join_url and not self.location:
            raise ValueError("indiquer un lien de visioconférence ou un lieu")
        return self


_CLASSES: tuple[type[_Block], ...] = (
    TextBlock,
    ImageBlock,
    GalleryBlock,
    CalloutBlock,
    TableBlock,
    CodeBlock,
    VideoBlock,
    AudioBlock,
    PdfBlock,
    SlidesBlock,
    FileBlock,
    EmbedBlock,
    QuizBlock,
    OpenQuestionBlock,
    AssignmentBlock,
    ExamBlock,
    ToolExerciseBlock,
    CaseStudyBlock,
    LiveSessionBlock,
)


def _type_of(cls: type[_Block]) -> str:
    return cls.model_fields["type"].annotation.__args__[0]


BLOCK_CLASSES: dict[str, type[_Block]] = {_type_of(cls): cls for cls in _CLASSES}

# Types dont le contenu porte des réponses à cacher aux apprenants.
_GRADED_TYPES = {"quiz", "exam"}


def validate_block(block_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Valide le contenu d'un bloc et renvoie sa forme normalisée, sans le type."""
    cls = BLOCK_CLASSES.get(block_type)
    if cls is None:
        raise BlockError(f"Type de bloc inconnu : {block_type!r}.")
    if not isinstance(data, dict):
        raise BlockError("Le contenu d'un bloc doit être un objet.")
    payload = {key: value for key, value in data.items() if key != "type"}
    try:
        block = cls.model_validate({**payload, "type": block_type})
    except ValidationError as exc:
        errors = [
            {
                "champ": ".".join(str(part) for part in error["loc"]) or "bloc",
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        raise BlockError(f"Contenu invalide pour un bloc « {cls.label} ».", errors) from exc
    normalized = block.model_dump(mode="json")
    normalized.pop("type")
    return normalized


def public_view(block_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Version d'un bloc envoyée à un apprenant.

    Les bonnes réponses et les explications des quiz et des examens sont
    retirées : la correction se fait côté serveur.
    """
    if block_type not in _GRADED_TYPES:
        return data
    visible = copy.deepcopy(data)
    for question in visible.get("questions", []):
        question.pop("explanation", None)
        for option in question.get("options", []):
            option.pop("correct", None)
    return visible


def block_types_catalog() -> list[dict[str, Any]]:
    """Liste des types de blocs, pour construire l'éditeur de la console."""
    return [
        {
            "type": block_type,
            "label": cls.label,
            "family": cls.family,
            "schema": cls.model_json_schema(),
        }
        for block_type, cls in BLOCK_CLASSES.items()
    ]
