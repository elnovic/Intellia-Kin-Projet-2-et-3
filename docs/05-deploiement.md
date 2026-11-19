# Déploiement pas à pas

Trois services gratuits, reliés au dépôt GitHub. Après la mise en place,
chaque envoi sur la branche `main` met la plateforme à jour automatiquement.

| Élément | Service | Adresse |
|---|---|---|
| Base de données | Supabase | (privée) |
| API | Render | `https://intellia-academie-api.onrender.com` |
| Interface | Cloudflare Pages | `https://academie.intelliakin.com` |

Le site `intelliakin.com` n'est pas modifié.

## Étape 1 — Supabase (base de données)

1. Sur supabase.com, se connecter avec GitHub, puis **New project**.
2. Nom : `intellia-academie`. Région : **Central EU (Frankfurt)**.
3. **Generate a password**, puis l'enregistrer dans un gestionnaire de mots de passe.
4. Une fois le projet prêt : bouton **Connect** en haut de la page,
   onglet **Connection string**, méthode **Session pooler**.
5. Copier la chaîne `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`
   et remplacer `[YOUR-PASSWORD]` par le mot de passe.
   Si le mot de passe contient des caractères spéciaux (`@ # / ?`), les encoder
   (par exemple `@` devient `%40`).

Ne jamais transmettre cette chaîne par message : elle se colle uniquement dans Render.

## Étape 2 — Groq (modèle d'IA des outils)

1. Sur console.groq.com, créer un compte gratuit.
2. **API Keys**, puis **Create API Key**, nom : `intellia-academie`.
3. Copier la clé (elle commence par `gsk_`). Elle ne s'affiche qu'une fois.

## Étape 3 — Render (API)

1. Sur render.com, se connecter avec GitHub et autoriser l'accès au dépôt
   `Intellia-Kin-Projet-2-et-3`.
2. **New**, puis **Blueprint**, choisir le dépôt. Render lit `render.yaml`.
3. Renseigner les valeurs demandées :

| Variable | Valeur |
|---|---|
| `IK_DATABASE_URL` | la chaîne Supabase de l'étape 1 |
| `IK_BOOTSTRAP_ADMIN_EMAIL` | l'e-mail du compte administrateur |
| `IK_BOOTSTRAP_ADMIN_PASSWORD` | un mot de passe solide (12 caractères ou plus) |
| `IK_GROQ_API_KEY` | la clé Groq de l'étape 2 |

4. **Apply**. Le premier déploiement prend quelques minutes.
5. Vérifier : `https://<adresse-render>/health` doit afficher `{"status":"ok"}`
   et `https://<adresse-render>/courses` la liste des cours.
6. Si l'adresse donnée par Render n'est pas `intellia-academie-api.onrender.com`,
   la reporter dans `web/config.js`.

Sur l'offre gratuite, l'API s'endort après 15 minutes sans visite et met
environ une minute à se réveiller. L'interface affiche alors un message d'attente.

## Étape 4 — Cloudflare Pages (interface)

1. Tableau de bord Cloudflare, **Workers & Pages**, **Create**, onglet **Pages**,
   **Connect to Git**, choisir le dépôt.
2. Nom du projet : `intellia-academie`.
3. Réglages de build :
   - Framework preset : **None**
   - Build command : *(laisser vide)*
   - Build output directory : `web`
4. **Save and Deploy**. L'interface est en ligne sur `https://intellia-academie.pages.dev`.
5. Onglet **Custom domains**, **Set up a custom domain** : `academie.intelliakin.com`.
   Le domaine étant déjà chez Cloudflare, l'enregistrement DNS est créé automatiquement.

## Étape 5 — Premiers pas

1. Ouvrir `https://academie.intelliakin.com/connexion` et se connecter avec le
   compte administrateur de l'étape 3.
2. Le lien **Administration** apparaît dans le menu : tableau de bord, annonces,
   cours, attestations.
3. Créer une première annonce de test, la publier, puis la supprimer.

## Mettre à jour la plateforme

- **Cours** : modifier les fichiers de `contenu/cours/`, envoyer sur `main`.
  Render recharge les cours modifiés au redémarrage.
- **Interface** : modifier `web/`, envoyer sur `main`. Cloudflare redéploie seul.
- **Annonces et événements** : directement depuis l'administration, sans toucher au code.

## Sauvegardes

L'offre gratuite de Supabase ne fait pas de sauvegarde automatique.
Une fois par semaine, depuis un ordinateur
avec PostgreSQL installé :

```bash
pg_dump "<chaîne Supabase>" > sauvegarde-$(date +%F).sql
```

Un projet Supabase gratuit sans activité pendant 7 jours est mis en pause :
il suffit de le relancer depuis le tableau de bord.
