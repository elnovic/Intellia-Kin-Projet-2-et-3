# Déploiement pas à pas

Tout est hébergé gratuitement chez Cloudflare, sans carte bancaire, et relié au
dépôt GitHub : après la mise en place, chaque envoi sur la branche `main` met la
plateforme à jour automatiquement. Seuls les outils IA utilisent un service
extérieur gratuit, Groq.

| Élément | Service | Adresse |
|---|---|---|
| Base de données | Cloudflare D1 | (privée) |
| API | Cloudflare Workers | `https://intellia-academie-api.intelliakin.workers.dev` |
| Académie (public) | Cloudflare Pages | `https://academie.intelliakin.com` |
| Centre de contrôle (équipe) | Cloudflare Pages, sans domaine | `https://intellia-controle.pages.dev` |
| Modèle d'IA des outils | Groq, offre gratuite | — |

Le site `intelliakin.com` n'est pas modifié.

Règle de sécurité : la clé Groq, la clé secrète et le mot de passe administrateur
se saisissent **uniquement** dans le tableau de bord Cloudflare, jamais dans un
message ni dans le dépôt.

## Étape 1 — Groq (modèle d'IA des outils)

1. Sur console.groq.com, créer un compte gratuit.
2. **API Keys**, puis **Create API Key**, nom : `intellia-academie`.
3. Copier la clé (elle commence par `gsk_`) dans une note privée. Elle ne s'affiche qu'une fois.

## Étape 2 — Base de données D1

1. Tableau de bord Cloudflare, menu **Storage & databases**, puis **D1 SQL database**.
2. **Create database**. Nom : `intellia-academie`. Emplacement : laisser le choix
   automatique, ou choisir l'Europe de l'Ouest.
3. Sur la page de la base, copier le **Database ID** (une suite de lettres et de
   chiffres séparés par des tirets). Cet identifiant n'est pas secret.
4. Le reporter dans `api/wrangler.toml`, ligne `database_id`, puis envoyer sur `main`.

Les tables sont créées automatiquement par l'API à son premier démarrage, et les
20 cours du dossier `contenu/cours` y sont chargés.

## Étape 3 — API (Cloudflare Workers)

1. **Workers & Pages**, **Create application**, puis **Import a repository**
   (ou **Connect to Git**). Autoriser Cloudflare à lire le dépôt
   `Intellia-Kin-Projet-2-et-3` si c'est demandé.
2. Nom du projet : `intellia-academie-api`.
3. Réglages :
   - Root directory (dossier racine) : `api`
   - Build command : *(laisser vide)*
   - Deploy command : `npx wrangler deploy`
4. **Deploy**. La construction prend une à deux minutes : elle prépare les cours
   et publie le Worker.
5. Ouvrir le Worker, onglet **Settings**, section **Variables and Secrets**, puis
   **Add** pour chacune des quatre valeurs, en choisissant le type **Secret** :

| Nom | Valeur |
|---|---|
| `SECRET_KEY` | une longue suite aléatoire de 48 caractères ou plus (générateur de mots de passe) |
| `ADMIN_EMAIL` | l'e-mail du compte administrateur |
| `ADMIN_PASSWORD` | un mot de passe solide, 12 caractères ou plus |
| `GROQ_API_KEY` | la clé Groq de l'étape 1 |

6. **Deploy** pour enregistrer. Tant que `SECRET_KEY` n'est pas défini, l'API répond
   par une erreur : c'est voulu.
7. Vérifier, avec l'adresse affichée par Cloudflare (onglet **Settings**, **Domains & Routes**) :
   `https://<adresse>/health` doit afficher `{"status":"ok"}` et
   `https://<adresse>/courses` la liste des 20 cours.
8. Reporter cette adresse dans `web/config.js` et `admin/config.js` (`apiBase`),
   puis envoyer sur `main`.

## Étape 4 — Cloudflare Pages (Académie)

1. **Workers & Pages**, **Create**, onglet **Pages**, **Connect to Git**, choisir le dépôt.
2. Nom du projet : `intellia-academie`.
3. Réglages de build :
   - Framework preset : **None**
   - Build command : *(laisser vide)*
   - Build output directory : `web`
4. **Save and Deploy**. L'Académie est en ligne sur `https://intellia-academie.pages.dev`.
5. Onglet **Custom domains**, **Set up a custom domain** : `academie.intelliakin.com`.
   Le domaine étant déjà chez Cloudflare, l'enregistrement DNS est créé automatiquement.

## Étape 5 — Cloudflare Pages (centre de contrôle, sans domaine)

1. **Workers & Pages**, **Create**, **Pages**, **Connect to Git**, même dépôt.
2. Nom du projet : `intellia-controle`.
3. Réglages de build :
   - Framework preset : **None**
   - Build command : `bash admin/build.sh`
   - Build output directory : `admin/dist`
4. **Save and Deploy**. Ne pas ajouter de domaine personnalisé : l'adresse
   `https://intellia-controle.pages.dev` reste connue de l'équipe seulement.
   Les pages portent la consigne « noindex » pour ne pas apparaître dans les moteurs de recherche.
5. Si Cloudflare attribue un autre nom (par exemple `intellia-controle-xyz.pages.dev`),
   l'ajouter à `CORS_ORIGINS` dans `api/wrangler.toml`.

## Étape 6 — Premiers pas

1. Ouvrir le centre de contrôle et se connecter avec le compte administrateur de l'étape 3.
2. Créer une annonce de test, la publier, vérifier qu'elle apparaît sur l'Académie, puis la supprimer.
3. Créer un cours de test, ajouter un module, une leçon et quelques blocs, le publier,
   le vérifier sur l'Académie, puis le supprimer.
4. Créer un compte apprenant, suivre une leçon, essayer un outil IA.

## Étape 7 — E-mails « mot de passe oublié » (Resend, facultatif)

Sur la page « Mot de passe oublié » de l'Académie, l'apprenant reçoit un code à
6 chiffres par e-mail (valable 15 minutes, 5 essais, 3 demandes par heure).
L'envoi passe par **Resend**, offre gratuite sans carte : 3 000 e-mails par mois,
100 par jour. (L'envoi d'e-mails de Cloudflare n'est gratuit que vers des
adresses vérifiées à l'avance, pas vers les apprenants.)

1. Créer un compte sur resend.com.
2. **Domains**, **Add domain** : `academie.intelliakin.com`. Resend affiche
   quelques enregistrements DNS (DKIM, SPF, MX sur des sous-noms comme
   `resend._domainkey.academie` et `send.academie`). Les ajouter dans Cloudflare
   (DNS de intelliakin.com), ou laisser Resend le faire s'il propose la connexion
   à Cloudflare. Ils ne touchent ni au site intelliakin.com ni à l'Académie.
3. Attendre que le domaine soit **Verified**.
4. **API Keys**, **Create API key** : accès « Sending access », limité au domaine.
   Copier la clé (commence par `re_`), sans l'envoyer par message.
5. Cloudflare, Worker `intellia-academie-api`, **Settings**, **Variables and
   Secrets** : ajouter le secret `RESEND_API_KEY` avec cette clé.

L'expéditeur est `Académie Intellia Kin <noreply@academie.intelliakin.com>`
(variable `EMAIL_FROM` de `api/wrangler.toml`).

**Sans clé Resend**, ou si un apprenant ne reçoit rien : il contacte l'équipe.
Dans le centre de contrôle, rubrique **Apprenants**, on retrouve son compte, on
vérifie son identité, puis **Lien de réinitialisation** crée un lien valable
24 heures et une seule fois, à lui transmettre (bouton WhatsApp si son numéro est
connu). Changer de mot de passe ferme toutes ses sessions ouvertes.

L'administrateur, lui, peut aussi changer son mot de passe en modifiant le secret
`ADMIN_PASSWORD` du Worker.

## Mettre à jour la plateforme

- **Cours du dépôt** : modifier les fichiers de `contenu/cours/`, envoyer sur `main`.
  Le Worker est reconstruit et recharge seulement les cours modifiés ; la
  progression des apprenants est conservée.
- **Interfaces** : modifier `web/` ou `admin/`, envoyer sur `main`. Cloudflare redéploie seul.
- **Nouveaux cours, annonces et événements** : directement depuis le centre de contrôle, sans toucher au code.
- **Changer le mot de passe administrateur** : modifier le secret `ADMIN_PASSWORD`
  dans le tableau de bord ; il est appliqué au prochain démarrage de l'API.

## Limites de l'offre gratuite

| Ressource | Limite quotidienne ou par requête |
|---|---|
| Requêtes vers l'API | 100 000 par jour |
| Lectures dans la base | 5 millions de lignes par jour |
| Écritures dans la base | 100 000 lignes par jour |
| Taille de la base | 500 Mo |
| Temps de calcul | 10 ms par requête (le code est écrit pour rester en dessous) |

Ces limites suffisent largement pour le lancement. Les compteurs sont visibles dans
le tableau de bord (**Workers & Pages** et **D1**).

## Sauvegardes

D1 garde un historique de 7 jours sur l'offre gratuite (« Time Travel ») : la
base peut être restaurée à un instant précis depuis le tableau de bord.
En complément, une fois par semaine, depuis un ordinateur avec Node.js :

```bash
cd api
npx wrangler d1 export intellia-academie --remote --output=sauvegarde-$(date +%F).sql
```

Conserver ces fichiers hors du dépôt, en lieu sûr : ils contiennent les données des apprenants.

## Travailler en local

```bash
cd api
cp .dev.vars.example .dev.vars
npm install
npx wrangler dev          # API sur http://localhost:8787, base D1 locale
npm test                  # tests de l'API et vérification des cours
```

Servir ensuite `web/` sur le port 8080 et `admin/dist` (après `bash admin/build.sh`)
sur le port 8081 avec n'importe quel serveur de fichiers statiques.
Compte administrateur local : celui de `.dev.vars`.
