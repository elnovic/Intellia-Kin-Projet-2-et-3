# Backend — API Intellia Kin

API unique de la plateforme et de la console. Python 3.12, FastAPI, SQLAlchemy.

## Lancer avec Docker (recommandé)

Depuis la racine du dépôt :

```bash
docker compose up --build
```

- API : http://localhost:8000
- Documentation interactive : http://localhost:8000/docs

Créer le premier administrateur :

```bash
docker compose exec api python -m app.cli create-admin vous@intelliakin.com "Votre Nom"
```

## Lancer sans Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
python -m app.cli create-admin vous@intelliakin.com "Votre Nom"
```

Sans autre réglage, l'API utilise un fichier SQLite local (`dev.db`).

## Tests

```bash
cd backend
pytest
```

Les tests utilisent une base SQLite en mémoire, neuve pour chaque test.
Ils s'exécutent aussi sur GitHub à chaque envoi de code.

## Organisation

| Fichier | Rôle |
|---|---|
| `app/main.py` | Application et branchement des routes |
| `app/config.py` | Réglages (variables `IK_*`) |
| `app/db.py` | Connexion à la base |
| `app/models.py` | Tables |
| `app/schemas.py` | Formats d'entrée et de sortie de l'API |
| `app/blocks.py` | Types de blocs de contenu, validation, vue apprenant |
| `app/security.py` | Mots de passe (Argon2) et jetons (JWT) |
| `app/deps.py` | Utilisateur connecté, rôle administrateur |
| `app/routers/auth.py` | Inscription, connexion, profil |
| `app/routers/courses.py` | Catalogue, leçons, inscription, progression |
| `app/routers/admin_courses.py` | Console : cours, modules, leçons, blocs |
| `app/cli.py` | Commandes d'administration |

## Routes principales

| Méthode et chemin | Accès | Rôle |
|---|---|---|
| `POST /auth/register` | Public | Créer un compte |
| `POST /auth/login` | Public | Obtenir un jeton |
| `GET /auth/me` | Connecté | Profil |
| `GET /courses` | Public | Catalogue (filtres `audience`, `is_free`) |
| `GET /courses/{slug}` | Public | Fiche et programme d'un cours |
| `GET /courses/{slug}/lessons/{id}` | Aperçu : public ; sinon inscrit | Contenu d'une leçon |
| `POST /courses/{slug}/enroll` | Connecté | S'inscrire à un cours gratuit |
| `POST /courses/{slug}/lessons/{id}/complete` | Inscrit | Terminer une leçon |
| `GET /courses/{slug}/progress` | Inscrit | Progression |
| `GET /admin/block-types` | Administrateur | Types de blocs et leurs schémas |
| `/admin/courses`, `/admin/modules`, `/admin/lessons`, `/admin/blocks` | Administrateur | Édition des cours |

## Limites actuelles

- Les tables sont créées au démarrage ; les migrations (Alembic) arrivent ensuite.
- Pas encore de téléversement de fichiers : les blocs référencent des adresses.
- Les réponses aux quiz ne sont pas encore enregistrées ni notées.
- Les cours payants ne sont pas encore ouverts à l'inscription.
