"""Réglages de l'application, lus dans les variables d'environnement `IK_*`."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_KEY = "cle-de-developpement-a-remplacer-avant-la-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IK_", env_file=".env", extra="ignore")

    environment: str = "development"
    # PostgreSQL en production : postgresql+psycopg://utilisateur:motdepasse@hote:5432/base
    database_url: str = "sqlite:///./dev.db"
    secret_key: str = DEV_SECRET_KEY
    access_token_minutes: int = 12 * 60
    # Liste JSON, par exemple : ["https://app.intelliakin.com","https://admin.intelliakin.com"]
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    # Crée les tables au démarrage. Sera remplacé par des migrations.
    auto_create_tables: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
