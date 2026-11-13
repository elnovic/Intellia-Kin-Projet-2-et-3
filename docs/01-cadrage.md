# Cadrage et décisions

Dernière mise à jour : 13 novembre 2026.
Ce document consigne les décisions prises pendant le cadrage. Toute décision
modifiée doit l'être ici, avec sa date.

## 1. Ce que l'on construit

| Élément | Description |
|---|---|
| Plateforme unique | Cours et outils IA sur un même site, avec un seul compte et un seul paiement |
| Console d'administration | Publication des cours, annonces et événements ; validation des paiements ; pilotage des outils IA ; validation des posts Instagram |
| Agent Instagram | Service de fond qui prépare un post par jour ; un humain valide dans la console avant publication |

Le site vitrine `intelliakin.com` reste tel quel. Ses intitulés font foi :
**Formation, Consulting, Réalisation de projet**.

## 2. Décisions prises

### Produit
- Un seul domaine, géré chez Cloudflare : `app.` pour la plateforme, `admin.` pour la console.
- Essai gratuit de **7 jours**, plafonné en crédits, un essai par numéro de téléphone vérifié.
- Les cours gratuits restent accessibles après l'essai.
- Les cours sont saisis par l'équipe depuis la console (pas d'import automatique).
- Validation humaine des posts Instagram au départ. Les visuels générés par IA sont acceptés ; logo, couleurs et texte sont posés en gabarit par-dessus.

### Paiement (solution d'attente, jusqu'à l'enregistrement du cabinet)
- Encaissement par mobile money sur des numéros dédiés, au nom du CEO.
- L'écran de paiement affiche la photo du CEO, son nom exact tel qu'il apparaîtra
  à la confirmation, et la phrase « Vous payez à [nom], directeur général d'Intellia Kin ».
- Le client reçoit une référence unique, paie, puis saisit l'identifiant de transaction.
- Un administrateur valide dans la console ; l'accès s'active et le reçu part.
- Chaque paiement validé produit un **reçu numéroté** ; le registre n'autorise
  aucune suppression (une erreur s'annule par une écriture d'annulation).
- L'abonnement est une **période prépayée** (pas de prélèvement automatique).
- Le paiement est un module remplaçable : mode manuel aujourd'hui, agrégateur ensuite.
- Agrégateurs à consulter une fois le cabinet enregistré : FlexPay (premier choix),
  pawaPay (second devis), CinetPay (repli).

### Technique
- Backend Python (FastAPI), base PostgreSQL, monolithe modulaire.
- Les outils chiffrés (paie, échéances, marges) calculent en code ; l'IA ne calcule jamais.
- Tous les appels aux modèles d'IA passent par une passerelle unique
  (choix du modèle, crédits, plafond de dépense, journaux).
- Le choix des modèles d'IA est reporté après la conception de la plateforme.
  Piste retenue : modèles open source hébergés, adaptateurs LoRA propres à
  Intellia Kin sur Cloudflare Workers AI, connaissances via recherche documentaire.

## 3. Outils IA retenus

### PME
| Outil | Niveau |
|---|---|
| Paie congolaise | Payant |
| Échéancier fiscal et social | Payant |
| Saisie comptable par photo | Payant |
| Passeport financier | Payant |
| Stock et prévision des ventes | Payant |
| Recherche juridique congolaise | Payant |
| Assistant de rédaction | Presque gratuit |
| Analyse de documents | Presque gratuit |

### Entrepreneurs
| Outil | Niveau |
|---|---|
| Parcours de formalisation guidé | Payant |
| Copilote après création | Payant |
| Contrats types conformes OHADA | Payant |
| Calculateur de prix de revient et de marge | Payant |
| Plan d'affaires | Presque gratuit |
| Étude de marché | Presque gratuit |

### Jeunes diplômés
| Outil | Niveau |
|---|---|
| Simulateur d'entretien vocal noté | Payant, petit prix |
| Entraînement aux tests de recrutement | Payant, petit prix |
| Coach de mémoire (méthode et relecture uniquement, jamais de rédaction à la place de l'étudiant) | Payant, petit prix |

## 4. Points ouverts

- Enregistrement du cabinet (RCCM, Id. Nat., NIF) : en cours. Il débloque
  l'agrégateur de paiement et les crédits cloud pour startups.
- Partenaires à trouver : expert-comptable (paie, fiscal, comptabilité) et
  juriste (droit congolais, OHADA, formalisation). Sans eux, les outils
  réglementés ne sortent pas.
- La facture normalisée est obligatoire en RDC : tout outil qui émet des
  factures devra s'y conformer.
- Vidéos des cours : lien externe et téléversement sont tous deux prévus par le
  modèle ; le choix par défaut reste à arrêter.
- Sujet du premier cours gratuit.
- Développeur d'interface : à confirmer selon la charge.
