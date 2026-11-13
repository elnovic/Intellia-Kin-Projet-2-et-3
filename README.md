# Intellia Kin — Plateforme (projets 2 et 3)

Plateforme en ligne du cabinet Intellia Kin : cours gratuits et payants avec
attestation, annonces de formations, événements, outils IA par abonnement, et la
console d'administration qui pilote l'ensemble.

| Adresse | Rôle | Dossier |
|---|---|---|
| `intelliakin.com` | Site vitrine existant (hors de ce dépôt) | — |
| `app.intelliakin.com` | Plateforme : cours, outils IA, annonces, événements, compte | `web/` (à venir) |
| `admin.intelliakin.com` | Console d'administration | `admin/` (à venir) |
| API | Logique métier commune aux deux interfaces | `backend/` |

## Organisation du dépôt

```
backend/    API Python (FastAPI), modèles de données, tests
design/     Charte graphique en code : couleurs, polices, logo
docs/       Cadrage, architecture, modèle des cours, feuille de route
```

## Démarrer

```bash
docker compose up --build
```

L'API répond sur http://localhost:8000 et sa documentation sur
http://localhost:8000/docs. Voir [`backend/README.md`](backend/README.md) pour
créer le premier administrateur, lancer sans Docker et exécuter les tests.

## Documents

1. [Cadrage et décisions](docs/01-cadrage.md)
2. [Architecture technique](docs/02-architecture.md)
3. [Cours et blocs de contenu](docs/03-cours-et-blocs.md)
4. [Feuille de route](docs/04-feuille-de-route.md)

## Méthode de travail

- `main` contient ce qui a été relu et validé.
- Chaque évolution arrive sur une branche, avec une demande de fusion.
- Les tests s'exécutent automatiquement à chaque envoi (`.github/workflows/tests.yml`).
