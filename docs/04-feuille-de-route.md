# Feuille de route

Les durées sont des estimations pour une petite équipe. Elles seront affinées
à la fin de chaque vague.

| Vague | Contenu | Durée estimée |
|---|---|---|
| 1 | Socle : comptes, console, crédits, paiement manuel avec reçus | 4 à 6 semaines |
| 2 | Académie : cours, attestation, annonces, événements | 4 à 6 semaines |
| 3 | Agent Instagram et outils presque gratuits | 3 à 4 semaines |
| 4 | Jeunes diplômés : tests de recrutement, simulateur vocal, coach de mémoire | 6 à 8 semaines |
| 5 | Entrepreneurs : calculateur de marge, contrats OHADA, formalisation, copilote | 8 à 10 semaines |
| 6 | PME, premier bloc : échéancier fiscal, puis paie | 8 à 12 semaines |
| 7 | PME, second bloc : saisie par photo, passeport financier, stock, recherche juridique | 4 à 6 mois |

Les outils PME arrivent en dernier : ils exigent les experts partenaires, la
confiance des clients et un cabinet enregistré.

## État d'avancement

### Fait
- Cadrage et décisions.
- Socle de l'API : inscription, connexion, rôles.
- Modèle des cours : cours, modules, leçons, 19 types de blocs.
- Routes d'administration des cours et routes publiques (catalogue, leçon,
  inscription aux cours gratuits, progression).
- Charte graphique en code (`design/`).

### Prochaines étapes
1. Migrations de base de données (Alembic).
2. Téléversement de fichiers (supports de cours).
3. Interface de la console : éditeur de cours par blocs.
4. Interface de la plateforme : catalogue et lecteur de cours.
5. Réponses aux quiz, notation, attestation.
6. Annonces et événements.
7. Paiement manuel, reçus et registre des recettes.
