# Agent Instagram

L'agent prépare chaque jour une publication Instagram pour Intellia Kin. Rien ne
part sans la validation d'un membre de l'équipe dans le centre de contrôle.

## Fonctionnement

1. **Chaque matin à 6 h (heure de Kinshasa)**, l'agent choisit un sujet en rotation :
   un cours de l'Académie, un outil gratuit, un conseil tiré d'une leçon, ou une
   annonce publiée (repli sur un conseil s'il n'y a rien à annoncer). Il évite de
   reprendre un sujet récent.
2. Le texte (titre du visuel, légende, hashtags) est rédigé par le modèle de
   langue (Groq), uniquement à partir des données de l'Académie : pas de chiffre
   ni de promesse inventés.
3. Le fond du visuel est généré par Workers AI (modèle Flux, offre gratuite de
   Cloudflare), sans texte dans l'image.
4. Dans le centre de contrôle, rubrique **Publications Instagram**, l'équipe relit,
   corrige, régénère le texte ou l'image si besoin. Le visuel final (1080 × 1350)
   est composé aux couleurs d'Intellia Kin : logo, bandeau du thème, titre, adresse
   de l'Académie.
5. **Approuver et programmer** fixe la date et l'heure. Toutes les 15 minutes,
   l'API publie les messages dont l'heure est venue. La publication porte
   l'étiquette « IA » d'Instagram, par transparence.

On peut aussi générer une proposition à la demande, choisir le thème, ou publier
immédiatement.

## Mise en place (une seule fois)

### 1. Passer le compte Instagram en compte professionnel

Dans l'application Instagram, avec le compte d'Intellia Kin :
**Paramètres et activité**, **Type de compte et outils**, **Passer à un compte
professionnel**, choisir **Entreprise**, catégorie conseil ou éducation.
C'est gratuit et réversible.

### 2. Créer l'application Meta

1. Sur developers.facebook.com, se connecter et créer un compte développeur si besoin.
2. **Créer une application**. Cas d'utilisation : gérer les messages et le contenu
   sur Instagram. Nom : `Intellia Kin Agent`.
3. Dans l'application : **Instagram**, **Configuration de l'API avec connexion Instagram**.
4. Section **Générer des tokens d'accès** : **Ajouter un compte**, se connecter avec
   le compte Instagram d'Intellia Kin et accepter les autorisations.
5. **Générer le token** et le copier. Ne jamais l'envoyer par message.

L'application ne sert qu'au compte d'Intellia Kin : l'accès standard suffit et
aucune vérification par Meta (« App Review ») n'est nécessaire.

### 3. Connecter le compte dans le centre de contrôle

Rubrique **Publications Instagram**, coller le jeton dans le champ prévu, puis
**Connecter**. Le jeton est vérifié auprès d'Instagram, chiffré dans la base et
n'est plus jamais affiché. Il est valable 60 jours et prolongé automatiquement
chaque jour par l'API.

## Limites et précautions

- Images générées : environ 60 « neurones » Workers AI par image, sur 10 000 gratuits par jour.
- Le jeton est lié au compte Instagram : en cas de changement de mot de passe
  Instagram, il peut être révoqué. Il suffit alors d'en générer un nouveau et de
  le recoller.
- Pour arrêter toute publication automatique : **Déconnecter** le compte dans le
  centre de contrôle. Les propositions restent consultables.

## Fichiers

| Fichier | Rôle |
|---|---|
| `api/src/instagram.js` | Choix du sujet, rédaction, image, publication, jeton |
| `api/src/routes/instagram.js` | Routes du centre de contrôle et image publique |
| `admin/js/publications.js` | Écran de validation et composition du visuel |
| `api/wrangler.toml` | Liaison Workers AI et tâches planifiées |
