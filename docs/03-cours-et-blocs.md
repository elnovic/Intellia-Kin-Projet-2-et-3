# Rédiger un cours

Les 20 cours de l'Académie sont rédigés dans le dépôt, dans `contenu/cours/`.
Chaque envoi sur `main` les vérifie (tests GitHub) puis les recharge sur la plateforme.

## Un dossier par cours

```
contenu/cours/<slug>/
    cours.json      fiche, programme, quiz des leçons, examen final
    lecons/*.md     une leçon par fichier (Markdown)
    images/*        illustrations (SVG, PNG, JPG, WebP)
```

Le nom du dossier est l'adresse du cours : `academie.intelliakin.com/cours/<slug>`.

## La fiche `cours.json`

| Champ | Rôle |
|---|---|
| `title`, `summary`, `description` | Titre, résumé (carte du catalogue), présentation longue (Markdown) |
| `audience` | `tous`, `jeune_diplome`, `entrepreneur`, `pme` |
| `parcours` | `tronc-commun`, `carriere`, `entrepreneuriat`, `organisations` |
| `level` | `debutant`, `intermediaire`, `avance` |
| `duration_minutes`, `position` | Durée affichée, ordre dans le catalogue |
| `objectives` | « Ce que vous allez apprendre » |
| `skills` | Compétences imprimées sur l'attestation (3 ou 4) |
| `prerequisites`, `trainer`, `cover_image` | Prérequis, formateur, image de couverture |
| `modules[].lessons[]` | `key` (identifiant stable, ne jamais le changer), `title`, `file`, `objective`, `duration_minutes`, `is_preview`, `quiz` |
| `exam` | `pass_score` (70), `distinction_score` (90), `questions` |

Une question : `{"prompt": "...", "kind": "single" | "multiple" | "true_false",
"options": [{"text": "...", "correct": true}], "explanation": "..."}`.

## Écrire une leçon

Markdown simple : `##` pour les sections, `**gras**`, listes `-` et `1.`,
tableaux, citations `>`, blocs de code entre trois accents graves.

Images : `![Description de l'image](images/nom-du-fichier.svg)`.

Encadrés :

```
::: a-retenir
- Point clé 1
- Point clé 2
:::

::: a-vous Titre de l'exercice
Consigne de l'exercice.
:::
```

Variantes : `a-retenir` (cyan), `a-savoir` (bleu), `attention` (orange), `a-vous` (exercice).

## Ton et style

- Une histoire ou une situation concrète pour ouvrir la leçon.
- Des personnages récurrents, d'Afrique francophone et d'ailleurs.
- Phrases courtes, « vous », aucun jargon non expliqué.
- Chaque leçon finit par un exercice « À vous de jouer » et un encadré « À retenir ».
- Aucun chiffre ni fait vérifiable sans source sûre.

## Vérifier avant d'envoyer

```bash
cd api && node scripts/build-content.mjs --check
```

## Les types de blocs (cours saisis dans l'administration)

Les cours créés en ligne utilisent les mêmes blocs : texte, image, galerie, encadré,
tableau, code, vidéo, audio, PDF, diaporama, fichier, contenu intégré, quiz,
réponse libre, devoir, examen, exercice avec un outil IA, étude de cas, séance en direct.
Leur schéma est fourni par `GET /admin/block-types`.
