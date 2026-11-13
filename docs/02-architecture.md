# Architecture technique

## Vue d'ensemble

```
        app.intelliakin.com            admin.intelliakin.com
        (plateforme, web/)             (console, admin/)
                 \                         /
                  \                       /
                   v                     v
                 +-------------------------+
                 |   API unique (backend/) |
                 |   FastAPI, Python       |
                 +-----------+-------------+
                             |
        +--------------------+---------------------+
        |                    |                     |
   PostgreSQL          File de tâches        Stockage de fichiers
   (données,           (documents, agent     (supports de cours,
   pgvector)           Instagram, rappels)   reçus, attestations)
                             |
                    Passerelle de modèles IA
```

Un seul backend sert les deux interfaces. C'est un **monolithe modulaire** :
chaque domaine (comptes, cours, paiements, outils) vit dans son module, dans le
même code et la même base. Pas de microservices à cette taille d'équipe.

## Technologies

| Couche | Choix |
|---|---|
| API | Python 3.12, FastAPI, Pydantic |
| Données | PostgreSQL, SQLAlchemy 2 ; pgvector pour la recherche documentaire |
| Tâches de fond | Redis et un gestionnaire de tâches Python (à venir) |
| Interfaces | React / Next.js en TypeScript (à venir) |
| Fichiers | Stockage objet Cloudflare R2 (à venir) |
| Déploiement | Conteneurs Docker derrière Cloudflare |
| Tests | pytest, exécutés par GitHub Actions à chaque envoi |

## Modules du backend

| Module | État | Contenu |
|---|---|---|
| Comptes | Présent | Inscription, connexion, rôles (apprenant, administrateur) |
| Organisations | Modèle présent | Une PME, plusieurs utilisateurs, données cloisonnées |
| Cours | Présent | Cours, modules, leçons, blocs, inscription, progression |
| Attestations | À venir | Conditions par cours, PDF numéroté, QR code de vérification |
| Annonces et événements | À venir | Publication, inscriptions, présence |
| Paiements et reçus | À venir | Mode manuel, registre non modifiable, tableau des recettes |
| Crédits et abonnements | À venir | Essai de 7 jours, périodes prépayées |
| Passerelle IA | À venir | Point d'entrée unique vers les modèles |
| Outils IA | À venir | Un module par outil |
| Agent Instagram | À venir | Proposition quotidienne, validation dans la console |
| Journal d'audit | À venir | Qui a fait quoi dans la console |

## Règles de conception

1. **L'IA ne calcule pas.** Paie, échéances et marges sortent d'un moteur de
   règles en code, testé et validé par l'expert-comptable.
2. **Aucun outil n'appelle un modèle directement.** Tout passe par la passerelle.
3. **Les faits viennent des documents.** Lois et barèmes sont servis par
   recherche documentaire, avec citation de la source.
4. **Le registre des paiements ne s'efface pas.** Correction par écriture d'annulation.
5. **Les réponses des quiz ne sortent jamais de l'API** pour un apprenant
   (voir `app/blocks.py`, fonction `public_view`).
6. **Interface légère**, utilisable sur un téléphone d'entrée de gamme et une
   connexion lente.

## Sécurité

- Mots de passe hachés avec Argon2.
- Jetons d'accès signés (JWT), durée limitée.
- Routes `/admin/*` réservées au rôle administrateur.
- Secrets fournis par variables d'environnement, jamais dans le dépôt.
- À venir : vérification du téléphone, limitation de débit, journal d'audit,
  sauvegardes quotidiennes avec restauration testée.

## Environnements

| Environnement | Usage |
|---|---|
| Développement | Poste local, Docker Compose |
| Test | Copie de la production pour valider avant mise en ligne |
| Production | `app.` et `admin.` derrière Cloudflare |
