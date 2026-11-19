"""Point d'entrée de l'API de l'Académie Intellia Kin."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import models  # noqa: F401  (enregistre les tables)
from .config import DEV_SECRET_KEY, get_settings
from .content import course_image, import_courses
from .db import Base, SessionLocal, engine
from .routers import admin_courses, announcements, auth, courses, tools
from .users import ensure_admin

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s : %(message)s")
log = logging.getLogger("intellia")


def startup() -> None:
    settings = get_settings()
    if settings.environment == "production" and settings.secret_key == DEV_SECRET_KEY:
        raise RuntimeError("IK_SECRET_KEY doit être défini en production.")
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
            outcome = ensure_admin(
                db,
                settings.bootstrap_admin_email,
                settings.bootstrap_admin_name,
                settings.bootstrap_admin_password,
            )
            log.info("Administrateur %s : %s", settings.bootstrap_admin_email, outcome)
        if settings.import_courses_on_startup:
            import_courses(db, settings.content_dir)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    startup()
    yield


app = FastAPI(
    title="Académie Intellia Kin — API",
    description="Cours gratuits avec attestation, outils IA, annonces et événements.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(courses.me_router)
app.include_router(courses.certificates_router)
app.include_router(announcements.router)
app.include_router(announcements.admin_router)
app.include_router(tools.router)
app.include_router(admin_courses.router)


@app.get("/health", tags=["Technique"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/media/cours/{slug}/images/{filename}", tags=["Technique"], include_in_schema=False)
def course_media(slug: str, filename: str) -> FileResponse:
    path = course_image(get_settings().content_dir, slug, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Image introuvable.")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})
