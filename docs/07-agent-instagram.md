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

Depuis fin 2026, Meta ne propose plus la « connexion Instagram » aux nouvelles
applications : elles passent par la **connexion unifiée** (Facebook Login for
Business) avec un **jeton d'utilisateur système**, qui n'expire jamais.

Prérequis : un **portefeuille business** Meta (business.facebook.com) et une
**Page Facebook** d'Intellia Kin reliée au compte Instagram professionnel
(Page Facebook, Paramètres, Comptes liés, Instagram).

1. Sur developers.facebook.com, créer l'application (`Intellia Kin Agent`) avec le
   cas d'utilisation Instagram, et l'associer au portefeuille business.
2. **Configurez votre application**, **Créer une nouvelle configuration** :
   jeton d'utilisateur système, expiration « Jamais ». Autorisations à cocher :
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `business_management`, et `pages_manage_posts`
   (pour la future publication sur la Page Facebook). Les autorisations de
   publicité et de messages ne sont pas nécessaires. L'URL de redirection peut
   rester vide.
3. Dans le portefeuille business, **Utilisateurs système** : créer un utilisateur
   système administrateur, lui attribuer la Page et le compte Instagram (contrôle
   total) et l'application, puis **Générer un token** avec cette configuration.
4. Copier le jeton. Ne jamais l'envoyer par message.

L'application ne sert qu'aux comptes d'Intellia Kin : l'accès standard suffit et
aucune vérification par Meta (« App Review ») n'est nécessaire.

### 3. Connecter le compte dans le centre de contrôle

Rubrique **Publications Instagram**, coller le jeton dans le champ prévu, puis
**Connecter**. L'API retrouve d'elle-même la Page Facebook et le compte Instagram
qui lui est relié. Si elle n'y parvient pas, elle le dit : remplir alors le champ
**ID du compte Instagram** (affiché dans le tableau de bord Meta) et recommencer.
Le jeton est chiffré dans la base et n'est plus jamais affiché.

Les anciens jetons « Instagram Login » (commençant par `IG`) restent acceptés :
ils durent 60 jours et l'API les prolonge automatiquement chaque jour.

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
