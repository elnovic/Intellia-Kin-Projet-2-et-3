"""Réglages de l'application, lus dans les variables d'environnement `IK_*`."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_KEY = "cle-de-developpement-a-remplacer-avant-la-production"
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IK_", env_file=".env", extra="ignore")

    environment: str = "development"
    # Supabase : coller la chaîne « Session pooler » (postgresql://...).
    database_url: str = "sqlite:///./dev.db"
    secret_key: str = DEV_SECRET_KEY
    access_token_minutes: int = 7 * 24 * 60
    # Liste JSON, par exemple : ["https://academie.intelliakin.com"]
    cors_origins: list[str] = ["http://localhost:8080", "http://127.0.0.1:8080"]
    # Crée les tables au démarrage.
    auto_create_tables: bool = True

    # Cours rédigés dans le dépôt (dossier contenu/cours), chargés au démarrage.
    content_dir: Path = _REPO_ROOT / "contenu"
    import_courses_on_startup: bool = True

    # Premier administrateur, créé ou mis à jour au démarrage si renseigné.
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    bootstrap_admin_name: str = "Administrateur Intellia Kin"

    # Outils IA (Groq). Sans clé, les outils IA répondent « indisponible ».
    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Modèles essayés dans l'ordre : le second sert de réserve de quota.
    groq_models: list[str] = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    ai_daily_limit: int = 3

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        # Supabase et Render fournissent « postgresql:// » ou « postgres:// ».
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
