"""Routes de la plateforme : catalogue, leçons, progression, examen, attestations."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..blocks import grade, public_questions, public_view, score_percent
from ..db import get_db
from ..deps import get_current_user, get_optional_user
from ..models import (
    Block,
    Certificate,
    Course,
    Enrollment,
    ExamAttempt,
    Lesson,
    LessonProgress,
    Module,
    User,
    as_utc,
    utcnow,
)
from ..schemas import (
    AnswersIn,
    BlockOut,
    CertificateOut,
    CertificateRequest,
    CourseAudience,
    CourseDetail,
    CourseSummary,
    EnrollmentOut,
    ExamOut,
    ExamResultOut,
    LessonFull,
    MyCourseOut,
    Parcours,
    ProgressOut,
    QuizCheckOut,
)

router = APIRouter(prefix="/courses", tags=["Cours"])
me_router = APIRouter(prefix="/me", tags=["Mon espace"])
certificates_router = APIRouter(prefix="/certificates", tags=["Attestations"])

MAX_ATTEMPTS = 3
ATTEMPT_WINDOW = timedelta(hours=24)


# --- Outils ----------------------------------------------------------------


def _published_course(db: Session, slug: str) -> Course:
    course = db.scalar(select(Course).where(Course.slug == slug, Course.status == "published"))
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
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id)
    )


def _required_enrollment(db: Session, user: User, course: Course) -> Enrollment:
    enrollment = _enrollment(db, user, course)
    if enrollment is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Inscrivez-vous à ce cours pour y accéder.")
    return enrollment


def _check_lesson_access(db: Session, course: Course, lesson: Lesson, user: User | None) -> None:
    """Un compte est toujours requis. Une leçon d'aperçu se lit sans inscription au cours."""
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Connectez-vous pour lire cette leçon.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role != "admin" and not lesson.is_preview:
        _required_enrollment(db, user, course)


def _course_lesson_ids(db: Session, course: Course) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .where(Module.course_id == course.id)
        )
    )


def _attempts(db: Session, enrollment: Enrollment) -> list[ExamAttempt]:
    return list(
        db.scalars(
            select(ExamAttempt)
            .where(ExamAttempt.enrollment_id == enrollment.id)
            .order_by(ExamAttempt.created_at)
        )
    )


def _progress(db: Session, course: Course, enrollment: Enrollment) -> ProgressOut:
    lesson_ids = set(_course_lesson_ids(db, course))
    done = [
        lesson_id
        for lesson_id in db.scalars(
            select(LessonProgress.lesson_id).where(LessonProgress.enrollment_id == enrollment.id)
        )
        if lesson_id in lesson_ids
    ]
    total = len(lesson_ids)
    attempts = _attempts(db, enrollment)
    certificate = db.scalar(
        select(Certificate.number).where(
            Certificate.user_id == enrollment.user_id, Certificate.course_id == course.id
        )
    )
    return ProgressOut(
        completed_lessons=len(done),
        total_lessons=total,
        percent=round(100 * len(done) / total) if total else 0,
        completed_lesson_ids=done,
        exam_passed=any(a.passed for a in attempts),
        best_score=max((a.score for a in attempts), default=None),
        certificate_number=certificate,
    )


def _attempt_window(attempts: list[ExamAttempt]) -> tuple[int, datetime | None]:
    """Tentatives restantes sur 24 heures glissantes, et heure de la prochaine possible."""
    now = utcnow()
    recent = [as_utc(a.created_at) for a in attempts if as_utc(a.created_at) > now - ATTEMPT_WINDOW]
    left = max(0, MAX_ATTEMPTS - len(recent))
    retry_at = min(recent) + ATTEMPT_WINDOW if left == 0 else None
    return left, retry_at


def _certificate_out(certificate: Certificate) -> CertificateOut:
    course = certificate.course
    return CertificateOut(
        number=certificate.number,
        full_name=certificate.full_name,
        course_slug=course.slug,
        course_title=course.title,
        level=course.level,
        duration_minutes=course.duration_minutes,
        skills=course.skills or [],
        score=certificate.score,
        distinction=certificate.distinction,
        issued_at=certificate.issued_at,
    )


# --- Catalogue -------------------------------------------------------------


@router.get("", response_model=list[CourseSummary])
def list_courses(
    audience: CourseAudience | None = None,
    parcours: Parcours | None = None,
    db: Session = Depends(get_db),
) -> list[Course]:
    """Catalogue des cours publiés. Un cours « tous publics » apparaît pour chaque public."""
    query = select(Course).where(Course.status == "published", Course.is_template.is_(False))
    if audience is not None and audience != "tous":
        query = query.where(Course.audience.in_([audience, "tous"]))
    if parcours is not None:
        query = query.where(Course.parcours == parcours)
    return list(db.scalars(query.order_by(Course.position, Course.title)))


@router.get("/{slug}", response_model=CourseDetail)
def get_course(slug: str, db: Session = Depends(get_db)) -> CourseDetail:
    """Fiche d'un cours : description et programme, sans le contenu des leçons."""
    course = _published_course(db, slug)
    detail = CourseDetail.model_validate(course)
    detail.exam_question_count = len((course.exam or {}).get("questions", []))
    return detail


# --- Leçons ----------------------------------------------------------------


@router.get("/{slug}/lessons/{lesson_id}", response_model=LessonFull)
def read_lesson(
    slug: str,
    lesson_id: uuid.UUID,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> LessonFull:
    """Contenu d'une leçon. Les réponses des quiz ne sont jamais envoyées."""
    course = _published_course(db, slug)
    lesson = _lesson_of(db, course, lesson_id)
    _check_lesson_access(db, course, lesson, user)
    return LessonFull(
        id=lesson.id,
        title=lesson.title,
        objective=lesson.objective,
        duration_minutes=lesson.duration_minutes,
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


@router.post("/{slug}/lessons/{lesson_id}/blocks/{block_id}/check", response_model=QuizCheckOut)
def check_quiz(
    slug: str,
    lesson_id: uuid.UUID,
    block_id: uuid.UUID,
    payload: AnswersIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> QuizCheckOut:
    """Corrige un quiz de leçon. Il sert à s'entraîner : rien n'est enregistré."""
    course = _published_course(db, slug)
    lesson = _lesson_of(db, course, lesson_id)
    _check_lesson_access(db, course, lesson, user)
    block = db.get(Block, block_id)
    if block is None or block.lesson_id != lesson.id or block.type != "quiz":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz introuvable.")
    questions = block.data["questions"]
    results = grade(questions, payload.answers)
    for result, question in zip(results, questions):
        result["correct_options"] = [
            i for i, option in enumerate(question["options"]) if option.get("correct")
        ]
        result["explanation"] = question.get("explanation")
    return QuizCheckOut(results=results, score=score_percent(results))


# --- Inscription et progression -------------------------------------------


@router.post("/{slug}/enroll", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED)
def enroll(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Enrollment:
    """Inscription gratuite à un cours."""
    course = _published_course(db, slug)
    if _enrollment(db, user, course) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Vous êtes déjà inscrit à ce cours.")
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
        db.commit()
    return _progress(db, course, enrollment)


@router.get("/{slug}/progress", response_model=ProgressOut)
def get_progress(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut:
    course = _published_course(db, slug)
    return _progress(db, course, _required_enrollment(db, user, course))


# --- Examen final ----------------------------------------------------------


def _exam_ready(db: Session, course: Course, user: User) -> tuple[Enrollment, ProgressOut]:
    enrollment = _required_enrollment(db, user, course)
    progress = _progress(db, course, enrollment)
    if not (course.exam or {}).get("questions"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce cours n'a pas d'examen final.")
    if progress.completed_lessons < progress.total_lessons:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Terminez toutes les leçons avant de passer l'examen."
        )
    return enrollment, progress


@router.get("/{slug}/exam", response_model=ExamOut)
def get_exam(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExamOut:
    course = _published_course(db, slug)
    enrollment, progress = _exam_ready(db, course, user)
    left, retry_at = _attempt_window(_attempts(db, enrollment))
    return ExamOut(
        questions=public_questions(course.exam["questions"]),
        pass_score=course.exam_pass_score,
        attempts_left=left,
        retry_at=retry_at,
        best_score=progress.best_score,
        passed=progress.exam_passed,
    )


@router.post("/{slug}/exam", response_model=ExamResultOut)
def submit_exam(
    slug: str,
    payload: AnswersIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExamResultOut:
    """Corrige l'examen. Trois tentatives par période de 24 heures.

    Seul le résultat de chaque question est renvoyé, pas la bonne réponse.
    """
    course = _published_course(db, slug)
    enrollment, _ = _exam_ready(db, course, user)
    left, retry_at = _attempt_window(_attempts(db, enrollment))
    if left == 0:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trois tentatives en 24 heures : nouvel essai possible après "
            f"{retry_at:%d/%m/%Y à %H:%M} (UTC).",
        )
    questions = course.exam["questions"]
    results = grade(questions, payload.answers)
    score = score_percent(results)
    passed = score >= course.exam_pass_score
    db.add(ExamAttempt(enrollment_id=enrollment.id, score=score, passed=passed))
    if passed and enrollment.completed_at is None:
        enrollment.status = "completed"
        enrollment.completed_at = utcnow()
    db.commit()
    return ExamResultOut(
        score=score,
        passed=passed,
        distinction=passed and score >= course.exam_distinction_score,
        results=[{"correct": r["correct"]} for r in results],
        attempts_left=left - 1,
    )


# --- Attestations ----------------------------------------------------------


def _next_number(db: Session) -> str:
    year = utcnow().year
    prefix = f"IK-{year}-"
    last = db.scalar(
        select(Certificate.number)
        .where(Certificate.number.like(f"{prefix}%"))
        .order_by(Certificate.number.desc())
        .limit(1)
    )
    sequence = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{sequence:06d}"


@router.post("/{slug}/certificate", response_model=CertificateOut)
def issue_certificate(
    slug: str,
    payload: CertificateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CertificateOut:
    """Délivre l'attestation au nom confirmé par l'apprenant.

    Si elle existe déjà, elle est renvoyée telle quelle : le nom ne change plus.
    """
    course = _published_course(db, slug)
    enrollment = _required_enrollment(db, user, course)
    existing = db.scalar(
        select(Certificate).where(Certificate.user_id == user.id, Certificate.course_id == course.id)
    )
    if existing is not None:
        return _certificate_out(existing)
    progress = _progress(db, course, enrollment)
    if progress.completed_lessons < progress.total_lessons or not progress.exam_passed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Terminez toutes les leçons et réussissez l'examen final pour obtenir l'attestation.",
        )
    score = progress.best_score or 0
    for _ in range(3):
        certificate = Certificate(
            number=_next_number(db),
            user_id=user.id,
            course_id=course.id,
            full_name=" ".join(payload.full_name.split()),
            score=score,
            distinction=score >= course.exam_distinction_score,
        )
        db.add(certificate)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(status.HTTP_409_CONFLICT, "Réessayez dans un instant.")
    db.refresh(certificate)
    return _certificate_out(certificate)


@certificates_router.get("/{number}", response_model=CertificateOut)
def verify_certificate(number: str, db: Session = Depends(get_db)) -> CertificateOut:
    """Vérification publique d'une attestation par son numéro."""
    certificate = db.scalar(select(Certificate).where(Certificate.number == number.upper()))
    if certificate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucune attestation ne porte ce numéro.")
    return _certificate_out(certificate)


# --- Mon espace ------------------------------------------------------------


@me_router.get("/courses", response_model=list[MyCourseOut])
def my_courses(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MyCourseOut]:
    enrollments = db.scalars(
        select(Enrollment).where(Enrollment.user_id == user.id).order_by(Enrollment.created_at.desc())
    )
    result = []
    for enrollment in enrollments:
        course = db.get(Course, enrollment.course_id)
        if course is None or course.status != "published":
            continue
        result.append(
            MyCourseOut(
                course=CourseSummary.model_validate(course),
                progress=_progress(db, course, enrollment),
            )
        )
    return result


@me_router.get("/certificates", response_model=list[CertificateOut])
def my_certificates(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[CertificateOut]:
    certificates = db.scalars(
        select(Certificate).where(Certificate.user_id == user.id).order_by(Certificate.issued_at.desc())
    )
    return [_certificate_out(c) for c in certificates]


@me_router.get("/stats")
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return {
        "courses": db.scalar(select(func.count(Enrollment.id)).where(Enrollment.user_id == user.id)),
        "certificates": db.scalar(
            select(func.count(Certificate.id)).where(Certificate.user_id == user.id)
        ),
    }
