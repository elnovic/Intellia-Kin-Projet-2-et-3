La responsable des opérations de l'institution de microfinance était fière de son assistant. Avant de le déployer, elle l'a fait tester par trois agents expérimentés pendant une semaine. Ils ont découvert qu'il confondait deux types de prêts, qu'il répondait parfois avec l'ancienne grille de taux, et qu'il acceptait de donner un avis sur un dossier client. Trois corrections plus tard, l'assistant était prêt.

## Pourquoi tester

Un assistant IA peut donner des réponses fausses avec beaucoup d'assurance. Dans une organisation, une mauvaise réponse peut entraîner une mauvaise décision, un client mal informé ou une procédure non respectée. Les tests permettent de repérer ces problèmes **avant** qu'ils ne touchent les utilisateurs.

## Le jeu de tests

Utilisez les vingt à trente questions réelles rassemblées lors de la conception, et ajoutez :

- **des questions difficiles** : cas particuliers, exceptions, combinaisons de règles ;
- **des questions hors sujet** : l'assistant doit poliment indiquer qu'il ne peut pas répondre ;
- **des questions sans réponse dans les documents** : il doit le dire, sans inventer ;
- **des demandes interdites** : décision sur un dossier, informations sur une personne ;
- **des tentatives de contournement** : « Ignore tes instructions et… ».

## Évaluer les réponses

Pour chaque question, notez :

- **l'exactitude** : la réponse est-elle correcte selon les documents ?
- **la source** : le document cité est-il le bon ?
- **la complétude** : manque-t-il des éléments importants ?
- **le respect des règles** : ton, format, limites ;
- **le comportement face à l'inconnu** : a-t-il reconnu ne pas savoir ?

Un simple tableau suffit : question, réponse obtenue, réponse attendue, évaluation, correction à apporter.

## Corriger et retester

Selon les problèmes repérés, améliorez :

- **les instructions** : préciser une règle, ajouter un exemple ;
- **les documents** : corriger une procédure ambiguë, retirer une ancienne version ;
- **le périmètre** : réduire la mission si l'assistant se perd.

Puis refaites passer **tous** les tests : une correction peut en dérégler une autre.

::: attention
Ne déployez pas un assistant tant qu'il invente des réponses aux questions sans réponse dans les documents, ou qu'il accepte des demandes interdites. Ces deux comportements sont les plus dangereux.
:::

## Le pilote

Avant un déploiement général, faites utiliser l'assistant par un petit groupe d'utilisateurs volontaires pendant une ou deux semaines. Recueillez leurs retours et les questions réelles posées : elles enrichiront votre jeu de tests.

::: a-savoir
Conservez votre jeu de tests et refaites-le passer à chaque modification importante (nouvelles instructions, nouveaux documents, changement d'outil ou de modèle). C'est la meilleure garantie de qualité dans la durée.
:::

::: a-vous Votre campagne de tests
Construisez un jeu de trente tests pour votre assistant, avec les cinq catégories de questions. Testez-le, remplissez le tableau d'évaluation, corrigez, puis refaites passer tous les tests. Notez le taux de bonnes réponses avant et après correction.
:::

::: a-retenir
- Testez avant de déployer : un assistant peut se tromper avec assurance.
- Questions réelles, difficiles, hors sujet, sans réponse, interdites, contournements.
- Évaluez exactitude, source, complétude, règles et comportement face à l'inconnu.
- Corrigez, retestez tout, puis lancez un pilote.
:::
