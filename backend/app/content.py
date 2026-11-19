"""Chargement des cours rédigés dans le dépôt (dossier `contenu/cours`).

Chaque cours est un dossier :

    contenu/cours/<slug>/
        cours.json        fiche, programme, quiz et examen final
        lecons/*.md       une leçon par fichier
        images/*          illustrations

Dans une leçon, les encadrés s'écrivent ainsi :

    ::: a-retenir
    Texte de l'encadré.
    :::

Variantes : `a-retenir`, `a-savoir`, `attention`, `a-vous` (exercice).
Un titre facultatif suit la variante : `::: a-vous Votre premier prompt`.

Les images s'écrivent `![description](images/schema.svg)`.

Le chargement est idempotent : un cours inchangé (même empreinte) n'est pas
réécrit. La progression des apprenants est conservée, car chaque leçon garde
son identifiant tant que sa clé (`key`) ne change pas.
"""

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .blocks import BlockError, validate_block, validate_questions
from .models import Block, Course, Lesson, Module, utcnow

log = logging.getLogger("intellia.content")

IMAGE_EXTENSIONS = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
_CALLOUTS = {
    "a-retenir": ("tip", "À retenir"),
    "a-savoir": ("info", "À savoir"),
    "attention": ("warning", "Attention"),
    "a-vous": ("exercise", "À vous de jouer"),
}
_OPEN = re.compile(r"^:::\s*([a-z-]+)\s*(.*)$")
_IMAGE = re.compile(r"!\[([^\]]*)\]\((?:\./)?images/([^)\s]+)\)")


class ContentError(ValueError):
    pass


def media_url(slug: str, filename: str) -> str:
    return f"/media/cours/{slug}/images/{filename}"


def lesson_blocks(slug: str, markdown: str) -> list[dict[str, Any]]:
    """Découpe une leçon en blocs : texte et encadrés."""
    markdown = _IMAGE.sub(lambda m: f"![{m.group(1)}]({media_url(slug, m.group(2))})", markdown)
    blocks: list[dict[str, Any]] = []
    buffer: list[str] = []
    callout: tuple[str, str] | None = None

    def flush() -> None:
        text = "\n".join(buffer).strip()
        buffer.clear()
        if not text:
            return
        if callout is None:
            blocks.append({"type": "text", "data": {"markdown": text}})
        else:
            variant, title = callout
            blocks.append(
                {"type": "callout", "data": {"variant": variant, "title": title, "markdown": text}}
            )

    for line in markdown.splitlines():
        stripped = line.strip()
        match = _OPEN.match(stripped)
        if callout is None and match and match.group(1) in _CALLOUTS:
            flush()
            variant, default_title = _CALLOUTS[match.group(1)]
            callout = (variant, match.group(2).strip() or default_title)
        elif callout is not None and stripped == ":::":
            flush()
            callout = None
        else:
            buffer.append(line)
    if callout is not None:
        raise ContentError("Un encadré « ::: » n'est pas refermé.")
    flush()
    return blocks


def _folder_hash(folder: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        digest.update(str(path.relative_to(folder)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _read_course(folder: Path) -> dict[str, Any]:
    spec = json.loads((folder / "cours.json").read_text(encoding="utf-8"))
    slug = spec.get("slug") or folder.name
    if slug != folder.name:
        raise ContentError(f"Le slug « {slug} » doit être le nom du dossier « {folder.name} ».")
    spec["slug"] = slug
    keys: set[str] = set()
    for module in spec.get("modules", []):
        for lesson in module.get("lessons", []):
            key = lesson["key"]
            if key in keys:
                raise ContentError(f"Clé de leçon en double : {key}")
            keys.add(key)
            path = folder / "lecons" / lesson["file"]
            blocks = lesson_blocks(slug, path.read_text(encoding="utf-8"))
            if lesson.get("quiz"):
                blocks.append({"type": "quiz", "data": {"questions": lesson["quiz"]}})
            normalized = []
            for block in blocks:
                try:
                    normalized.append(
                        {"type": block["type"], "data": validate_block(block["type"], block["data"])}
                    )
                except BlockError as exc:
                    raise ContentError(f"{path.name} : {exc} {exc.errors}") from exc
            lesson["blocks"] = normalized
    exam = spec.get("exam") or {}
    if exam.get("questions"):
        try:
            exam["questions"] = validate_questions(exam["questions"])
        except BlockError as exc:
            raise ContentError(f"{slug} examen : {exc} {exc.errors}") from exc
    spec["exam"] = exam
    return spec


_COURSE_FIELDS = (
    "title",
    "summary",
    "description",
    "audience",
    "parcours",
    "level",
    "format",
    "duration_minutes",
    "objectives",
    "skills",
    "prerequisites",
    "trainer",
    "position",
)


def _apply(db: Session, spec: dict[str, Any], digest: str) -> Course:
    slug = spec["slug"]
    course = db.scalar(select(Course).where(Course.slug == slug))
    if course is None:
        course = Course(slug=slug)
        db.add(course)
    for field in _COURSE_FIELDS:
        if field in spec:
            setattr(course, field, spec[field])
    cover = spec.get("cover_image")
    course.cover_image = media_url(slug, cover.split("/")[-1]) if cover else None
    course.exam = {"questions": spec["exam"].get("questions", [])}
    course.exam_pass_score = spec["exam"].get("pass_score", 70)
    course.exam_distinction_score = spec["exam"].get("distinction_score", 90)
    course.source = "depot"
    course.content_hash = digest
    course.status = spec.get("status", "published")
    if course.status == "published" and course.published_at is None:
        course.published_at = utcnow()
    db.flush()

    existing_lessons = {
        lesson.key: lesson
        for module in course.modules
        for lesson in module.lessons
        if lesson.key
    }
    modules = list(course.modules)
    kept_keys: set[str] = set()
    for m_index, m_spec in enumerate(spec.get("modules", []), start=1):
        if m_index <= len(modules):
            module = modules[m_index - 1]
        else:
            module = Module(course=course, position=m_index, title=m_spec["title"])
            db.add(module)
            modules.append(module)
        module.title = m_spec["title"]
        module.position = m_index
        db.flush()
        for l_index, l_spec in enumerate(m_spec.get("lessons", []), start=1):
            lesson = existing_lessons.get(l_spec["key"])
            if lesson is None:
                lesson = Lesson(key=l_spec["key"], module_id=module.id, title=l_spec["title"])
                db.add(lesson)
            lesson.module_id = module.id
            lesson.title = l_spec["title"]
            lesson.objective = l_spec.get("objective", "")
            lesson.duration_minutes = l_spec.get("duration_minutes", 10)
            lesson.is_preview = l_spec.get("is_preview", False)
            lesson.position = l_index
            db.flush()
            for block in list(lesson.blocks):
                db.delete(block)
            db.flush()
            for b_index, block in enumerate(l_spec["blocks"], start=1):
                db.add(Block(lesson_id=lesson.id, type=block["type"], data=block["data"], position=b_index))
            kept_keys.add(l_spec["key"])
    db.flush()
    for key, lesson in existing_lessons.items():
        if key not in kept_keys:
            db.delete(lesson)
    for module in modules[len(spec.get("modules", [])):]:
        # Recharger d'abord ses leçons : celles déplacées ailleurs ne doivent pas être supprimées.
        db.refresh(module)
        db.delete(module)
    db.flush()
    db.expire(course)
    return course


def import_courses(db: Session, content_dir: Path, force: bool = False) -> dict[str, str]:
    """Charge tous les cours du dossier. Renvoie {slug: « créé/mis à jour/inchangé/erreur »}."""
    root = Path(content_dir) / "cours"
    report: dict[str, str] = {}
    if not root.is_dir():
        log.info("Aucun dossier de cours dans %s", root)
        return report
    for folder in sorted(p for p in root.iterdir() if (p / "cours.json").is_file()):
        digest = _folder_hash(folder)
        current = db.scalar(select(Course).where(Course.slug == folder.name))
        if current is not None and current.content_hash == digest and not force:
            report[folder.name] = "inchangé"
            continue
        try:
            spec = _read_course(folder)
            _apply(db, spec, digest)
            db.commit()
            report[folder.name] = "mis à jour" if current else "créé"
        except (ContentError, KeyError, ValueError, OSError) as exc:
            db.rollback()
            report[folder.name] = f"erreur : {exc}"
            log.error("Cours %s non chargé : %s", folder.name, exc)
    log.info("Import des cours : %s", report)
    return report


def course_image(content_dir: Path, slug: str, filename: str) -> Path | None:
    """Chemin d'une image de cours, ou None si la demande est invalide."""
    if not re.fullmatch(r"[a-z0-9-]+", slug) or not re.fullmatch(r"[A-Za-z0-9._-]+", filename):
        return None
    path = Path(content_dir) / "cours" / slug / "images" / filename
    if path.suffix.lower() not in IMAGE_EXTENSIONS or not path.is_file():
        return None
    return path
