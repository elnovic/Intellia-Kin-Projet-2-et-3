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
backend/    API Python (FastAPI), modèles de données, tests (à venir)
design/     Charte graphique en code : couleurs, polices, logo
docs/       Cadrage et architecture
```

## Documents

1. [Cadrage et décisions](docs/01-cadrage.md)
2. [Architecture technique](docs/02-architecture.md)

## Méthode de travail

- `main` contient ce qui a été relu et validé.
- Chaque évolution arrive sur une branche, avec une demande de fusion.
- Les tests s'exécuteront automatiquement à chaque envoi.
