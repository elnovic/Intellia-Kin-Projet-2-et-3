# Architecture technique

Mise à jour du 19 novembre 2026 : l'API est hébergée sur Cloudflare Workers avec
une base D1, pour rester gratuite et sans carte bancaire (Render exigeait une carte).

## Vue d'ensemble

```
   academie.intelliakin.com         intellia-controle.pages.dev
   (Académie, web/)                 (centre de contrôle, admin/)
   Cloudflare Pages                 Cloudflare Pages
            \                           /
             v                         v
          +-------------------------------+
          |  API unique (api/)            |
          |  Cloudflare Worker, JavaScript |
          +---------------+---------------+
                          |
          +---------------+----------------+
          |                                |
   Base Cloudflare D1               Passerelle IA (api/src/ai.js)
   (SQLite : comptes, cours,        -> Groq, offre gratuite
   progression, attestations,
   annonces)
```

Un seul Worker sert les deux interfaces. Le code est découpé par domaine dans
`api/src/routes/` : comptes, cours et attestations, annonces, outils IA, centre de contrôle.

## Technologies

| Couche | Choix |
|---|---|
| API | JavaScript (modules ES) sur Cloudflare Workers, sans dépendance à l'exécution |
| Données | Cloudflare D1 (SQLite) ; dates en texte ISO UTC, champs JSON en texte |
| Cours du dépôt | Préparés et validés à la construction (`api/scripts/build-content.mjs`) |
| Interfaces | HTML, CSS et JavaScript sans étape de construction |
| Modèle d'IA | Groq (`openai/gpt-oss-120b`, puis `openai/gpt-oss-20b` en réserve) |
| Tests | `node --test` avec une imitation de D1 sur le SQLite intégré à Node, exécutés par GitHub Actions |

## Fichiers de l'API

| Fichier | Rôle |
|---|---|
| `src/index.js`, `src/app.js` | Point d'entrée, configuration, préparation de la base, routage, CORS |
| `src/db.js` | Schéma des tables et accès à D1 |
| `src/auth.js` | Mots de passe, jetons de session, utilisateur connecté |
| `src/blocks.js` | Types de blocs de leçon, validation, correction des quiz et examens |
| `src/content-parse.js`, `src/content-import.js` | Cours du dépôt : lecture, puis import idempotent |
| `src/tools.js`, `src/tool-prompts.js`, `src/ai.js` | Outils IA : formulaires, consignes, passerelle |
| `src/routes/*.js` | Routes par domaine |
| `src/validate.js` | Validation des données reçues, messages en français |

## Règles de conception

1. **L'IA ne calcule pas.** Les calculs (prix, marges) sont faits en code.
2. **Aucun outil n'appelle un modèle directement.** Tout passe par `src/ai.js`.
3. **Les réponses des quiz ne sortent jamais de l'API** pour un apprenant
   (`publicView` dans `src/blocks.js`).
4. **Un cours du dépôt ne se modifie pas en ligne** : il se corrige dans `contenu/cours`.
5. **Peu de requêtes par appel** : l'offre gratuite limite à 50 requêtes vers la
   base par appel ; les tests vérifient qu'aucune route n'en fait plus de 45.
6. **Interface légère**, utilisable sur un téléphone d'entrée de gamme et une connexion lente.

## Sécurité

- Mots de passe : PBKDF2-SHA256 avec sel, précédé d'un HMAC avec la clé secrète du
  serveur. Le nombre d'itérations est adapté au temps de calcul de l'offre gratuite
  et enregistré avec chaque empreinte, pour pouvoir le relever plus tard.
- Sessions : jetons signés (HS256), valables 7 jours.
- Routes `/admin/*` réservées au rôle administrateur.
- CORS limité aux adresses de l'Académie et du centre de contrôle.
- Secrets fournis par le tableau de bord Cloudflare, jamais dans le dépôt.
- À venir : limitation de débit, journal d'audit.

## Environnements

| Environnement | Usage |
|---|---|
| Développement | `npx wrangler dev` (base D1 locale) |
| Production | Worker `intellia-academie-api`, base D1 `intellia-academie`, deux projets Pages |
