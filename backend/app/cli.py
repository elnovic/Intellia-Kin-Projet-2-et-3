"""Commandes d'administration.

    python -m app.cli create-admin admin@intelliakin.com "Nom Complet"
    python -m app.cli import-courses            # recharge les cours modifiés
    python -m app.cli import-courses --force    # recharge tous les cours
    python -m app.cli check-courses             # vérifie les cours sans toucher la base
"""

import argparse
import getpass
import sys
from pathlib import Path

from . import models  # noqa: F401
from .config import get_settings
from .content import ContentError, _read_course, import_courses
from .db import Base, SessionLocal, engine
from .users import ensure_admin


def check_courses(content_dir: Path) -> int:
    """Valide chaque cours du dépôt. Renvoie le nombre de cours en erreur."""
    errors = 0
    root = Path(content_dir) / "cours"
    for folder in sorted(p for p in root.iterdir() if (p / "cours.json").is_file()):
        try:
            spec = _read_course(folder)
            lessons = sum(len(m.get("lessons", [])) for m in spec.get("modules", []))
            questions = len(spec["exam"].get("questions", []))
            print(f"OK      {folder.name} : {lessons} leçons, {questions} questions d'examen")
        except (ContentError, KeyError, ValueError, OSError) as exc:
            errors += 1
            print(f"ERREUR  {folder.name} : {exc}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="Commandes Intellia Kin")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="Créer ou promouvoir un administrateur")
    admin.add_argument("email")
    admin.add_argument("full_name")
    load = commands.add_parser("import-courses", help="Charger les cours du dépôt")
    load.add_argument("--force", action="store_true")
    commands.add_parser("check-courses", help="Vérifier les cours du dépôt")
    args = parser.parse_args(argv)
    settings = get_settings()

    if args.command == "check-courses":
        return 1 if check_courses(settings.content_dir) else 0

    Base.metadata.create_all(bind=engine)
    if args.command == "import-courses":
        with SessionLocal() as db:
            for slug, outcome in import_courses(db, settings.content_dir, args.force).items():
                print(f"{slug} : {outcome}")
        return 0

    password = getpass.getpass("Mot de passe (8 caractères minimum) : ")
    if len(password) < 8:
        print("Mot de passe trop court.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirmez le mot de passe : "):
        print("Les deux mots de passe sont différents.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        outcome = ensure_admin(db, args.email, args.full_name, password)
    print(f"Administrateur {args.email} : {outcome}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
