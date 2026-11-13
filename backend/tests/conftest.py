"""Outils communs aux tests.

Les imports de l'application sont faits dans les fonctions : les tests des
blocs (`test_blocks.py`) peuvent ainsi tourner avec Pydantic seul.
"""

import pytest

ADMIN = {"email": "admin@intelliakin.com", "password": "motdepasse-admin"}
LEARNER = {
    "email": "apprenant@intelliakin.com",
    "password": "motdepasse-apprenant",
    "full_name": "Apprenant Test",
    "audience": "jeune_diplome",
}


@pytest.fixture()
def session_factory():
    """Base SQLite en mémoire, neuve pour chaque test."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app import models  # noqa: F401
    from app.db import Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False)
    engine.dispose()


@pytest.fixture()
def client(session_factory):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _login(client, email: str, password: str) -> dict[str, str]:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin_headers(client, session_factory):
    from app.models import User
    from app.security import hash_password

    with session_factory() as db:
        db.add(
            User(
                email=ADMIN["email"],
                full_name="Admin Test",
                password_hash=hash_password(ADMIN["password"]),
                role="admin",
            )
        )
        db.commit()
    return _login(client, ADMIN["email"], ADMIN["password"])


@pytest.fixture()
def learner_headers(client):
    response = client.post("/auth/register", json=LEARNER)
    assert response.status_code == 201, response.text
    return _login(client, LEARNER["email"], LEARNER["password"])
