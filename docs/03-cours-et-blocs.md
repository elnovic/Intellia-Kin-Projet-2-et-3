# Cours et blocs de contenu

## Structure

```
Cours
 └─ Modules           (chapitres, ordonnés)
     └─ Leçons        (ordonnées ; une leçon peut être en aperçu libre)
         └─ Blocs     (contenu, ordonnés, de types variés)
```

Une leçon est une pile de blocs. L'équipe compose chaque leçon depuis la
console en ajoutant, déplaçant et modifiant des blocs.

Chaque bloc est stocké avec un **type** et un **contenu** (`data`, en JSON).
Ajouter un type de bloc ne modifie ni la base de données ni les cours existants :
on ajoute une classe dans `backend/app/blocks.py`.

## Types de blocs

| Famille | Type | Contenu |
|---|---|---|
| Lecture | `text` | Texte mis en forme (Markdown) |
| Lecture | `image` | Image, texte alternatif, légende |
| Lecture | `gallery` | Plusieurs images |
| Lecture | `callout` | Encadré : information, astuce, attention |
| Lecture | `table` | Tableau, avec en-têtes |
| Lecture | `code` | Extrait de code ou de prompt |
| Média | `video` | Vidéo téléversée ou lien externe |
| Média | `audio` | Fichier audio |
| Média | `pdf` | Document PDF affiché dans la page |
| Média | `slides` | Diaporama |
| Média | `file` | Fichier à télécharger |
| Média | `embed` | Contenu intégré d'un autre site |
| Évaluation | `quiz` | Questions à choix unique, multiple, vrai ou faux |
| Évaluation | `open_question` | Réponse libre |
| Évaluation | `assignment` | Devoir à rendre |
| Évaluation | `exam` | Examen final chronométré, avec note de réussite |
| Pratique | `tool_exercise` | Exercice relié à un outil IA de la plateforme |
| Pratique | `case_study` | Étude de cas avec questions |
| En direct | `live_session` | Séance datée, en visioconférence ou en présentiel |

La console récupère cette liste, avec le schéma de chaque type, par
`GET /admin/block-types`. Elle peut ainsi construire ses formulaires de saisie
sans les coder en dur.

## Règles de validation

- Les adresses de fichiers commencent par `https://` (lien externe) ou par
  `/media/` (fichier téléversé sur la plateforme).
- Question à choix unique : exactement une bonne réponse.
- Question à choix multiple : au moins une bonne réponse.
- Vrai ou faux : deux options, une seule correcte.
- Tableau : chaque ligne a autant de cellules que d'en-têtes.
- Un apprenant ne reçoit jamais les bonnes réponses ni les explications d'un
  quiz ou d'un examen : l'API les retire avant d'envoyer la leçon.

## Formats de cours

| Format | Code | Usage |
|---|---|---|
| À son rythme | `self_paced` | Accès libre, sans date |
| Session datée | `cohort` | Un groupe, un calendrier, des séances en direct |
| Hybride | `hybrid` | Contenu en ligne et séances en présentiel |

Chaque format peut être gratuit ou payant. Un cours peut être marqué comme
**gabarit** (`is_template`) pour servir de point de départ à d'autres cours.
Les **parcours** (plusieurs cours enchaînés, pour les formations longues)
arrivent dans une prochaine étape.

## Publics

`jeune_diplome`, `entrepreneur`, `pme`, `tous`.

## Cycle de vie d'un cours

`draft` (brouillon) → `published` (publié) → `archived` (archivé).
Un cours ne peut être publié que s'il contient au moins une leçon.

## Inscription et progression

- Cours gratuit : inscription immédiate.
- Cours payant : l'inscription passera par le module de paiement (à venir).
  En attendant, l'API répond que le paiement est requis.
- L'apprenant marque chaque leçon comme terminée ; la progression est le
  pourcentage de leçons terminées.

## Attestation (à venir)

Conditions fixées par cours : toutes les leçons terminées et, si le cours a un
examen, note minimale atteinte (`certificate_min_score`). L'attestation est un
PDF aux couleurs de la charte, avec un numéro unique et un QR code de vérification.
