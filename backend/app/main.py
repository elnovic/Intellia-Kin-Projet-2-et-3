"""Point d'entrée de l'API Intellia Kin."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (enregistre les tables)
from .config import DEV_SECRET_KEY, get_settings
from .db import Base, engine
from .routers import admin_courses, auth, courses


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.environment == "production" and settings.secret_key == DEV_SECRET_KEY:
        raise RuntimeError("IK_SECRET_KEY doit être défini en production.")
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Intellia Kin — API",
    description="Cours, outils IA, annonces, événements et console d'administration.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(admin_courses.router)


@app.get("/health", tags=["Technique"])
def health() -> dict[str, str]:
    return {"status": "ok"}
