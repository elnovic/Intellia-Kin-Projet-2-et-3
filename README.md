# Académie Intellia Kin

Plateforme gratuite du cabinet Intellia Kin : 20 cours sur l'IA avec attestation
de réussite, 10 outils gratuits, annonces et événements. L'équipe la pilote depuis
un centre de contrôle séparé.
Elle est distincte du site vitrine `intelliakin.com`, qui n'est pas modifié.

| Partie | Dossier | Hébergement |
|---|---|---|
| Académie publique (`academie.intelliakin.com`) | `web/` | Cloudflare Pages |
| Centre de contrôle de l'équipe (sans domaine) | `admin/` | Cloudflare Pages |
| API | `api/` | Cloudflare Workers |
| Base de données | — | Cloudflare D1 |
| Cours rédigés | `contenu/cours/` | préparés à chaque déploiement, chargés par l'API |
| Charte graphique en code | `design/` | — |

Tout fonctionne sur les offres gratuites, sans carte bancaire.

## Démarrer en local

```bash
cd api
cp .dev.vars.example .dev.vars
npm install
npx wrangler dev     # API sur http://localhost:8787
npm test             # tests et vérification des cours
```

Servir `web/` sur le port 8080 et `admin/dist` (après `bash admin/build.sh`) sur le port 8081.

## Documents

1. [Cadrage et décisions](docs/01-cadrage.md)
2. [Architecture technique](docs/02-architecture.md)
3. [Rédiger un cours](docs/03-cours-et-blocs.md)
4. [Feuille de route](docs/04-feuille-de-route.md)
5. [Déploiement pas à pas](docs/05-deploiement.md)
6. [Programme des 20 cours](docs/06-programme-des-cours.md)
7. [Agent Instagram](docs/07-agent-instagram.md)

## Méthode de travail

- `main` est la version en ligne : chaque envoi met à jour Cloudflare.
- Les tests et la vérification des cours s'exécutent à chaque envoi (`.github/workflows/tests.yml`).
