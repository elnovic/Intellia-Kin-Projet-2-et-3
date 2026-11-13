"""Routes de la plateforme : catalogue, leçons, inscription, progression."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..blocks import public_view
from ..db import get_db
from ..deps import get_current_user, get_optional_user
from ..models import Course, Enrollment, Lesson, LessonProgress, Module, User, utcnow
from ..schemas import (
    BlockOut,
    CourseAudience,
    CourseDetail,
    CourseSummary,
    EnrollmentOut,
    LessonFull,
    ProgressOut,
)

router = APIRouter(prefix="/courses", tags=["Cours"])


def _published_course(db: Session, slug: str) -> Course:
    course = db.scalar(
        select(Course).where(Course.slug == slug, Course.status == "published")
    )
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cours introuvable.")
    return course


def _lesson_of(db: Session, course: Course, lesson_id: uuid.UUID) -> Lesson:
    lesson = db.scalar(
        select(Lesson)
        .join(Module, Lesson.module_id == Module.id)
        .where(Lesson.id == lesson_id, Module.course_id == course.id)
    )
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
    return lesson


def _enrollment(db: Session, user: User, course: Course) -> Enrollment | None:
    return db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == course.id,
            Enrollment.status != "cancelled",
        )
    )


def _required_enrollment(db: Session, user: User, course: Course) -> Enrollment:
    enrollment = _enrollment(db, user, course)
    if enrollment is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Inscrivez-vous à ce cours pour y accéder."
        )
    return enrollment


def _progress(db: Session, course: Course, enrollment: Enrollment) -> ProgressOut:
    total = db.scalar(
        select(func.count(Lesson.id))
        .join(Module, Lesson.module_id == Module.id)
        .where(Module.course_id == course.id)
    )
    completed = db.scalar(
        select(func.count(LessonProgress.id)).where(
            LessonProgress.enrollment_id == enrollment.id
        )
    )
    total = total or 0
    completed = min(completed or 0, total)
    percent = round(100 * completed / total) if total else 0
    return ProgressOut(completed_lessons=completed, total_lessons=total, percent=percent)


@router.get("", response_model=list[CourseSummary])
def list_courses(
    audience: CourseAudience | None = None,
    is_free: bool | None = None,
    db: Session = Depends(get_db),
) -> list[Course]:
    """Catalogue des cours publiés. Un cours « tous publics » apparaît pour chaque public."""
    query = select(Course).where(Course.status == "published", Course.is_template.is_(False))
    if audience is not None and audience != "tous":
        query = query.where(Course.audience.in_([audience, "tous"]))
    if is_free is not None:
        query = query.where(Course.is_free.is_(is_free))
    query = query.order_by(Course.published_at.desc(), Course.title)
    return list(db.scalars(query))


@router.get("/{slug}", response_model=CourseDetail)
def get_course(slug: str, db: Session = Depends(get_db)) -> Course:
    """Fiche d'un cours : description et programme, sans le contenu des leçons."""
    return _published_course(db, slug)


@router.get("/{slug}/lessons/{lesson_id}", response_model=LessonFull)
def read_lesson(
    slug: str,
    lesson_id: uuid.UUID,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> LessonFull:
    """Contenu d'une leçon.

    Ouvert à tous pour une leçon en aperçu, sinon réservé aux inscrits.
    Les réponses des quiz et des examens ne sont jamais envoyées.
    """
    course = _published_course(db, slug)
    lesson = _lesson_of(db, course, lesson_id)
    if not lesson.is_preview:
        if user is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Connexion requise.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if user.role != "admin":
            _required_enrollment(db, user, course)
    return LessonFull(
        id=lesson.id,
        title=lesson.title,
        position=lesson.position,
        is_preview=lesson.is_preview,
        blocks=[
            BlockOut(
                id=block.id,
                type=block.type,
                position=block.position,
                data=public_view(block.type, block.data),
            )
            for block in lesson.blocks
        ],
    )


@router.post(
    "/{slug}/enroll", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED
)
def enroll(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Enrollment:
    """Inscription à un cours gratuit. Les cours payants passeront par le paiement."""
    course = _published_course(db, slug)
    existing = db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course.id
        )
    )
    if existing is not None and existing.status != "cancelled":
        raise HTTPException(status.HTTP_409_CONFLICT, "Vous êtes déjà inscrit à ce cours.")
    if not course.is_free:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Ce cours est payant. Le paiement en ligne sera bientôt disponible.",
        )
    if existing is not None:
        existing.status = "active"
        enrollment = existing
    else:
        enrollment = Enrollment(user_id=user.id, course_id=course.id)
        db.add(enrollment)
    db.commit()
    return enrollment


@router.post("/{slug}/lessons/{lesson_id}/complete", response_model=ProgressOut)
def complete_lesson(
    slug: str,
    lesson_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut:
    """Marque une leçon comme terminée et renvoie la progression dans le cours."""
    course = _published_course(db, slug)
    lesson = _lesson_of(db, course, lesson_id)
    enrollment = _required_enrollment(db, user, course)
    already_done = db.scalar(
        select(LessonProgress).where(
            LessonProgress.enrollment_id == enrollment.id,
            LessonProgress.lesson_id == lesson.id,
        )
    )
    if already_done is None:
        db.add(LessonProgress(enrollment_id=enrollment.id, lesson_id=lesson.id))
        db.flush()
    progress = _progress(db, course, enrollment)
    if progress.total_lessons and progress.completed_lessons == progress.total_lessons:
        if enrollment.completed_at is None:
            enrollment.completed_at = utcnow()
        enrollment.status = "completed"
    db.commit()
    return progress


@router.get("/{slug}/progress", response_model=ProgressOut)
def get_progress(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut:
    course = _published_course(db, slug)
    enrollment = _required_enrollment(db, user, course)
    return _progress(db, course, enrollment)
