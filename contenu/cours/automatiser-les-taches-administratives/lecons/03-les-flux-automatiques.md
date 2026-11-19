Le formulaire remplit un tableau. Et si, à chaque nouvelle ligne, un e-mail de confirmation partait automatiquement, le responsable recevait une notification, et un rappel était programmé ? C'est le principe des **flux automatiques**.

![La logique de toute automatisation](images/declencheur-action.svg)

## La logique : déclencheur, condition, action

Toute automatisation suit la même logique :

- **Déclencheur** : un événement se produit (un formulaire est rempli, un e-mail arrive, une date est atteinte, une ligne est ajoutée).
- **Condition** (facultative) : on vérifie une règle (le montant dépasse 500 dollars, le paiement n'est pas reçu).
- **Action** : une tâche s'exécute (envoyer un e-mail, créer une ligne, prévenir quelqu'un, générer un document).

**Exemples** :

- *Quand* une demande de congé est soumise, *alors* envoyer une notification au responsable et enregistrer la demande dans le tableau des congés.
- *Chaque* 10 du mois, *si* le paiement d'un parent n'est pas enregistré, *alors* envoyer un rappel poli.
- *Quand* une facture arrive par e-mail, *alors* enregistrer la pièce jointe dans le dossier « Factures à payer » et ajouter une ligne au tableau de suivi.

## Les outils sans code

Plusieurs outils permettent de créer ces flux sans programmer, en reliant les applications que vous utilisez déjà :

- **Les fonctions intégrées** des suites bureautiques : règles de messagerie, notifications de formulaires, automatisations des tableurs en ligne.
- **Les plateformes d'automatisation** comme Microsoft Power Automate, Zapier ou Make, qui relient des centaines d'applications. Elles proposent des offres gratuites limitées et des modèles prêts à l'emploi.
- **Les automatisations de WhatsApp Business** pour les échanges avec les clients.

::: a-savoir
Les offres gratuites de ces plateformes limitent généralement le nombre d'opérations par mois. Commencez par un ou deux flux simples, mesurez le volume, et vérifiez les conditions avant de vous engager sur un abonnement.
:::

## L'IA pour concevoir un flux

L'IA est un excellent conseiller pour concevoir une automatisation :

> Je veux automatiser le traitement des demandes de congé dans une PME de 25 salariés qui utilise Google Workspace. Décris le flux étape par étape (déclencheur, conditions, actions), les outils à utiliser, et les points de contrôle humain nécessaires.

Elle peut aussi vous guider pas à pas dans la configuration d'un outil, ou vous aider à corriger une automatisation qui ne fonctionne pas.

::: attention
Testez chaque flux avec des données fictives avant de l'utiliser pour de vrai. Une erreur de règle peut envoyer cent messages de relance à des parents qui ont déjà payé. Prévoyez toujours une personne responsable de chaque automatisation.
:::

::: a-vous Votre premier flux sur papier
Choisissez une des trois tâches de votre inventaire. Décrivez son flux automatique sur papier : déclencheur, conditions, actions, contrôle humain. Demandez ensuite à l'IA quels outils utiliser et les étapes de configuration.
:::

::: a-retenir
- Toute automatisation suit la logique déclencheur, condition, action.
- Des outils sans code relient les applications que vous utilisez déjà.
- L'IA aide à concevoir et à configurer les flux.
- Testez avec des données fictives et désignez un responsable par automatisation.
:::
