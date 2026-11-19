"""Opérations sur les comptes partagées par l'API et les commandes."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import User
from .security import hash_password, verify_password


def ensure_admin(db: Session, email: str, full_name: str, password: str) -> str:
    """Crée l'administrateur, ou le promeut et met à jour son mot de passe."""
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        db.add(
            User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                role="admin",
            )
        )
        outcome = "créé"
    else:
        outcome = "inchangé"
        if user.role != "admin":
            user.role = "admin"
            outcome = "promu"
        if not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
            outcome = "mis à jour"
    db.commit()
    return outcome
