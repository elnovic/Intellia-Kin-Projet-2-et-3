"""Commandes d'administration.

Créer le premier administrateur :

    python -m app.cli create-admin admin@intelliakin.com "Nom Complet"
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from . import models  # noqa: F401
from .db import Base, SessionLocal, engine
from .models import User
from .security import hash_password


def create_admin(email: str, full_name: str, password: str) -> str:
    """Crée un administrateur, ou promeut le compte s'il existe déjà."""
    Base.metadata.create_all(bind=engine)
    email = email.lower()
    with SessionLocal() as db:
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
            user.role = "admin"
            user.password_hash = hash_password(password)
            outcome = "mis à jour"
        db.commit()
    return outcome


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="Créer ou promouvoir un administrateur")
    admin.add_argument("email")
    admin.add_argument("full_name")
    args = parser.parse_args(argv)

    password = getpass.getpass("Mot de passe (8 caractères minimum) : ")
    if len(password) < 8:
        print("Mot de passe trop court.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirmez le mot de passe : "):
        print("Les deux mots de passe sont différents.", file=sys.stderr)
        return 1
    outcome = create_admin(args.email, args.full_name, password)
    print(f"Administrateur {args.email} {outcome}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
