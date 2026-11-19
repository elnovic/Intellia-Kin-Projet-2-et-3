"""Routes de la console : création et édition des cours."""

import re
import unicodedata
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..blocks import BlockError, block_types_catalog, validate_block, validate_questions
from ..db import get_db
from ..deps import require_admin
from ..models import Block, Certificate, Course, Enrollment, Lesson, Module, User, utcnow
from ..schemas import (
    BlockIn,
    BlockOut,
    BlockUpdate,
    CourseCreate,
    CourseFull,
    CourseSummary,
    CourseUpdate,
    ExamIn,
    LessonCreate,
    LessonAdminOut,
    LessonFull,
    LessonUpdate,
    ModuleCreate,
    ModuleFull,
    ModuleUpdate,
    ReorderIn,
)

router = APIRouter(
    prefix="/admin",
    tags=["Console : cours"],
    dependencies=[Depends(require_admin)],
)


# --- Outils ----------------------------------------------------------------


def slugify(text: str) -> str:
    """« Découvrir l'IA en 3 jours » -> « decouvrir-l-ia-en-3-jours »."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug[:100].strip("-") or "cours"


def _slug_taken(db: Session, slug: str, except_id: uuid.UUID | None = None) -> bool:
    query = select(Course.id).where(Course.slug == slug)
    if except_id is not None:
        query = query.where(Course.id != except_id)
    return db.scalar(query) is not None


def _free_slug(db: Session, base: str) -> str:
    candidate, suffix = base, 2
    while _slug_taken(db, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _get(db: Session, model: type, item_id: uuid.UUID, label: str) -> Any:
    item = db.get(model, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} introuvable.")
    return item


def _editable(db: Session, model: type, item_id: uuid.UUID, label: str) -> Any:
    """Objet modifiable : les cours rédigés dans le dépôt ne se modifient pas en ligne."""
    item = _get(db, model, item_id, label)
    course = item
    if isinstance(item, Module):
        course = item.course
    elif isinstance(item, Lesson):
        course = item.module.course
    elif isinstance(item, Block):
        course = item.lesson.module.course
    if course.source == "depot":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ce cours est rédigé dans le dépôt GitHub (dossier contenu/cours) : modifiez-le là-bas.",
        )
    return item


def _next_position(db: Session, model: type, parent_column: Any, parent_id: uuid.UUID) -> int:
    last = db.scalar(select(func.max(model.position)).where(parent_column == parent_id))
    return (last or 0) + 1


def _reorder(items: list[Any], ids: list[uuid.UUID]) -> None:
    by_id = {item.id: item for item in items}
    if len(ids) != len(set(ids)) or set(ids) != set(by_id):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La liste doit contenir chaque élément une fois, et aucun autre.",
        )
    for position, item_id in enumerate(ids, start=1):
        by_id[item_id].position = position


def _validated(block_type: str, data: dict[str, Any]) -> dict[str, Any]:
    try:
        return validate_block(block_type, data)
    except BlockError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"message": str(exc), "erreurs": exc.errors},
        ) from exc


# --- Types de blocs --------------------------------------------------------


@router.get("/block-types")
def list_block_types() -> list[dict[str, Any]]:
    """Types de blocs disponibles, avec leur schéma, pour l'éditeur de cours."""
    return block_types_catalog()


# --- Cours -----------------------------------------------------------------


@router.get("/courses", response_model=list[CourseSummary])
def list_courses(db: Session = Depends(get_db)) -> list[Course]:
    """Tous les cours, brouillons et gabarits compris."""
    return list(db.scalars(select(Course).order_by(Course.created_at.desc())))


@router.post("/courses", response_model=CourseFull, status_code=status.HTTP_201_CREATED)
def create_course(payload: CourseCreate, db: Session = Depends(get_db)) -> Course:
    if payload.slug is not None:
        if _slug_taken(db, payload.slug):
            raise HTTPException(status.HTTP_409_CONFLICT, "Cette adresse de cours est déjà prise.")
        slug = payload.slug
    else:
        slug = _free_slug(db, slugify(payload.title))
    course = Course(**payload.model_dump(exclude={"slug"}), slug=slug)
    db.add(course)
    db.commit()
    return course


@router.get("/courses/{course_id}", response_model=CourseFull)
def get_course(course_id: uuid.UUID, db: Session = Depends(get_db)) -> Course:
    return _get(db, Course, course_id, "Cours")


@router.patch("/courses/{course_id}", response_model=CourseFull)
def update_course(
    course_id: uuid.UUID, payload: CourseUpdate, db: Session = Depends(get_db)
) -> Course:
    course = _editable(db, Course, course_id, "Cours")
    changes = payload.model_dump(exclude_unset=True)
    new_slug = changes.get("slug")
    if new_slug is not None and _slug_taken(db, new_slug, except_id=course.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette adresse de cours est déjà prise.")
    # Ces champs ne peuvent pas être vidés.
    required = set(CourseUpdate.model_fields) - {"cover_image"}
    for field, value in changes.items():
        if value is None and field in required:
            continue
        setattr(course, field, value)
    db.commit()
    return course


@router.post("/courses/{course_id}/publish", response_model=CourseFull)
def publish_course(course_id: uuid.UUID, db: Session = Depends(get_db)) -> Course:
    course = _editable(db, Course, course_id, "Cours")
    if course.is_template:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Un gabarit ne se publie pas. Créez un cours à partir de lui."
        )
    lesson_count = db.scalar(
        select(func.count(Lesson.id))
        .join(Module, Lesson.module_id == Module.id)
        .where(Module.course_id == course.id)
    )
    if not lesson_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ajoutez au moins une leçon avant de publier ce cours."
        )
    course.status = "published"
    if course.published_at is None:
        course.published_at = utcnow()
    db.commit()
    return course


@router.post("/courses/{course_id}/unpublish", response_model=CourseFull)
def unpublish_course(course_id: uuid.UUID, db: Session = Depends(get_db)) -> Course:
    """Repasse le cours en brouillon. Les inscriptions existantes sont conservées."""
    course = _editable(db, Course, course_id, "Cours")
    course.status = "draft"
    db.commit()
    return course


@router.post("/courses/{course_id}/archive", response_model=CourseFull)
def archive_course(course_id: uuid.UUID, db: Session = Depends(get_db)) -> Course:
    course = _editable(db, Course, course_id, "Cours")
    course.status = "archived"
    db.commit()
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    """Supprime un cours sans inscrit. Un cours suivi s'archive plutôt."""
    course = _editable(db, Course, course_id, "Cours")
    if db.scalar(select(func.count(Enrollment.id)).where(Enrollment.course_id == course.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Des apprenants suivent ce cours : archivez-le plutôt."
        )
    db.delete(course)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/courses/{course_id}/exam", response_model=CourseFull)
def set_exam(course_id: uuid.UUID, payload: ExamIn, db: Session = Depends(get_db)) -> Course:
    """Remplace les questions de l'examen final."""
    course = _editable(db, Course, course_id, "Cours")
    try:
        course.exam = {"questions": validate_questions(payload.questions)}
    except BlockError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, {"message": str(exc), "erreurs": exc.errors}
        ) from exc
    db.commit()
    return course


@router.post("/courses/{course_id}/modules/reorder", response_model=CourseFull)
def reorder_modules(
    course_id: uuid.UUID, payload: ReorderIn, db: Session = Depends(get_db)
) -> Course:
    course = _editable(db, Course, course_id, "Cours")
    _reorder(course.modules, payload.ids)
    db.commit()
    return course


# --- Modules ---------------------------------------------------------------


@router.post(
    "/courses/{course_id}/modules",
    response_model=ModuleFull,
    status_code=status.HTTP_201_CREATED,
)
def create_module(
    course_id: uuid.UUID, payload: ModuleCreate, db: Session = Depends(get_db)
) -> Module:
    course = _editable(db, Course, course_id, "Cours")
    module = Module(
        course_id=course.id,
        title=payload.title,
        position=_next_position(db, Module, Module.course_id, course.id),
    )
    db.add(module)
    db.commit()
    return module


@router.patch("/modules/{module_id}", response_model=ModuleFull)
def update_module(
    module_id: uuid.UUID, payload: ModuleUpdate, db: Session = Depends(get_db)
) -> Module:
    module = _editable(db, Module, module_id, "Module")
    module.title = payload.title
    db.commit()
    return module


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(module_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_editable(db, Module, module_id, "Module"))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/modules/{module_id}/lessons/reorder", response_model=ModuleFull)
def reorder_lessons(
    module_id: uuid.UUID, payload: ReorderIn, db: Session = Depends(get_db)
) -> Module:
    module = _editable(db, Module, module_id, "Module")
    _reorder(module.lessons, payload.ids)
    db.commit()
    return module


# --- Leçons ----------------------------------------------------------------


@router.post(
    "/modules/{module_id}/lessons",
    response_model=LessonFull,
    status_code=status.HTTP_201_CREATED,
)
def create_lesson(
    module_id: uuid.UUID, payload: LessonCreate, db: Session = Depends(get_db)
) -> Lesson:
    module = _editable(db, Module, module_id, "Module")
    lesson = Lesson(
        module_id=module.id,
        title=payload.title,
        objective=payload.objective,
        duration_minutes=payload.duration_minutes,
        is_preview=payload.is_preview,
        position=_next_position(db, Lesson, Lesson.module_id, module.id),
    )
    db.add(lesson)
    db.commit()
    return lesson


@router.get("/lessons/{lesson_id}", response_model=LessonAdminOut)
def get_lesson(lesson_id: uuid.UUID, db: Session = Depends(get_db)) -> LessonAdminOut:
    lesson = _get(db, Lesson, lesson_id, "Leçon")
    out = LessonAdminOut.model_validate(lesson)
    course = lesson.module.course
    out.course_id, out.course_title, out.course_source = course.id, course.title, course.source
    return out


@router.patch("/lessons/{lesson_id}", response_model=LessonFull)
def update_lesson(
    lesson_id: uuid.UUID, payload: LessonUpdate, db: Session = Depends(get_db)
) -> Lesson:
    lesson = _editable(db, Lesson, lesson_id, "Leçon")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(lesson, field, value)
    db.commit()
    return lesson


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(lesson_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_editable(db, Lesson, lesson_id, "Leçon"))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/lessons/{lesson_id}/blocks/reorder", response_model=LessonFull)
def reorder_blocks(
    lesson_id: uuid.UUID, payload: ReorderIn, db: Session = Depends(get_db)
) -> Lesson:
    lesson = _editable(db, Lesson, lesson_id, "Leçon")
    _reorder(lesson.blocks, payload.ids)
    db.commit()
    return lesson


# --- Blocs -----------------------------------------------------------------


@router.post(
    "/lessons/{lesson_id}/blocks",
    response_model=BlockOut,
    status_code=status.HTTP_201_CREATED,
)
def create_block(
    lesson_id: uuid.UUID, payload: BlockIn, db: Session = Depends(get_db)
) -> Block:
    lesson = _editable(db, Lesson, lesson_id, "Leçon")
    block = Block(
        lesson_id=lesson.id,
        type=payload.type,
        data=_validated(payload.type, payload.data),
        position=_next_position(db, Block, Block.lesson_id, lesson.id),
    )
    db.add(block)
    db.commit()
    return block


@router.put("/blocks/{block_id}", response_model=BlockOut)
def update_block(
    block_id: uuid.UUID, payload: BlockUpdate, db: Session = Depends(get_db)
) -> Block:
    """Remplace le contenu d'un bloc. Son type ne change pas."""
    block = _editable(db, Block, block_id, "Bloc")
    block.data = _validated(block.type, payload.data)
    db.commit()
    return block


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(block_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_editable(db, Block, block_id, "Bloc"))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Statistiques ----------------------------------------------------------


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Chiffres clés pour le tableau de bord de l'administration."""
    per_course = db.execute(
        select(Course.slug, Course.title, func.count(Enrollment.id))
        .outerjoin(Enrollment, Enrollment.course_id == Course.id)
        .group_by(Course.id)
        .order_by(Course.position)
    ).all()
    certificates = dict(
        db.execute(
            select(Certificate.course_id, func.count(Certificate.id)).group_by(Certificate.course_id)
        ).all()
    )
    course_ids = dict(db.execute(select(Course.slug, Course.id)).all())
    return {
        "users": db.scalar(select(func.count(User.id))),
        "enrollments": db.scalar(select(func.count(Enrollment.id))),
        "certificates": db.scalar(select(func.count(Certificate.id))),
        "courses": [
            {
                "slug": slug,
                "title": title,
                "enrollments": count,
                "certificates": certificates.get(course_ids.get(slug), 0),
            }
            for slug, title, count in per_course
        ],
    }
