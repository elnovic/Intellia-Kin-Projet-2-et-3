# Académie Intellia Kin

Plateforme gratuite du cabinet Intellia Kin : 20 cours sur l'IA avec attestation
de réussite, 10 outils gratuits, annonces et événements. L'équipe la pilote depuis
un centre de contrôle séparé.
Elle est distincte du site vitrine `intelliakin.com`, qui n'est pas modifié.

| Partie | Dossier | Hébergement |
|---|---|---|
| Académie publique (`academie.intelliakin.com`) | `web/` | Cloudflare Pages |
| Centre de contrôle de l'équipe (sans domaine) | `admin/` | Cloudflare Pages |
| API | `backend/` | Render |
| Base de données | — | Supabase |
| Cours rédigés | `contenu/cours/` | chargés par l'API au démarrage |
| Charte graphique en code | `design/` | — |

## Démarrer en local

```bash
docker compose up --build
```

Académie : http://localhost:8080 · Contrôle : http://localhost:8081 · API : http://localhost:8000/docs
Compte administrateur local : `admin@intelliakin.com` / `admin-local-123`.

## Documents

1. [Cadrage et décisions](docs/01-cadrage.md)
2. [Architecture technique](docs/02-architecture.md)
3. [Rédiger un cours](docs/03-cours-et-blocs.md)
4. [Feuille de route](docs/04-feuille-de-route.md)
5. [Déploiement pas à pas](docs/05-deploiement.md)
6. [Programme des 20 cours](docs/06-programme-des-cours.md)

## Méthode de travail

- `main` est la version en ligne : chaque envoi met à jour Render et Cloudflare.
- Les tests et la vérification des cours s'exécutent à chaque envoi (`.github/workflows/tests.yml`).
