Vous savez maintenant que l'IA apprend à partir d'exemples. Mais concrètement, comment une machine passe-t-elle d'une pile de données à une décision ? Prenons un cas que tout le monde connaît : les SMS d'arnaque.

## Le problème : repérer les arnaques

« Félicitations, vous avez gagné 1 000 dollars ! Envoyez 20 dollars de frais pour recevoir votre gain. » Vous avez sûrement déjà reçu ce genre de message. Les escrocs en envoient des milliers, avec des variantes infinies. Écrire une règle pour chacun serait impossible.

C'est un problème idéal pour l'IA. Voici comment on s'y prendrait.

![Les quatre étapes de l'apprentissage automatique](images/comment-une-machine-apprend.svg)

## Étape 1 : rassembler des exemples

On réunit des milliers de SMS réels. Pour chacun, une personne indique s'il s'agit d'une arnaque ou d'un message normal. On appelle cela des **données étiquetées**.

La qualité de ces exemples est décisive. Si les données ne contiennent que des arnaques en anglais, l'IA sera perdue face à une arnaque en français ou en lingala. Si les étiquettes sont fausses, l'IA apprendra des erreurs.

## Étape 2 : l'entraînement

Le programme examine tous ces exemples et cherche ce qui distingue les deux groupes. Il remarque peut-être que les arnaques contiennent souvent des mots comme « gagné », « urgent » ou « frais », des montants ronds, des liens étranges, ou qu'elles demandent d'envoyer de l'argent.

Personne ne lui a donné cette liste : il l'a trouvée en comparant des milliers de cas. Il ajuste petit à petit des millions de réglages internes jusqu'à se tromper le moins possible. C'est **l'entraînement**.

## Étape 3 : le modèle

À la fin de l'entraînement, on obtient un **modèle** : un ensemble de réglages qui résume tout ce que le programme a appris. Le modèle ne contient pas les SMS d'origine. Il contient une sorte de « flair » mathématique pour reconnaître une arnaque.

## Étape 4 : la prédiction

Un nouveau SMS arrive, que le modèle n'a jamais vu. Il l'analyse et donne une réponse accompagnée d'un degré de confiance : « arnaque probable à 97 % ». Le téléphone peut alors le ranger dans les messages suspects.

::: attention
Une prédiction n'est jamais une certitude. Même à 97 %, le modèle se trompera 3 fois sur 100. C'est pourquoi les bons systèmes laissent toujours une place à la vérification humaine pour les décisions importantes.
:::

## Ce qu'il faut retenir sur les données

On dit souvent dans le métier : « des données de mauvaise qualité donnent des résultats de mauvaise qualité ». Une IA ne peut pas être meilleure que les exemples qui l'ont formée. Cela a une conséquence très concrète pour l'Afrique : quand nos langues, nos réalités et nos visages sont peu présents dans les données, les IA les reconnaissent moins bien. Nous y reviendrons dans la leçon sur les limites.

::: a-vous Devenez l'IA
Voici trois messages. Lesquels classeriez-vous comme arnaque, et pourquoi ?

1. « Bonjour Grâce, la réunion de demain est déplacée à 10 h. »
2. « URGENT : votre compte sera bloqué. Envoyez votre code secret à ce numéro. »
3. « Vous êtes l'heureux gagnant de notre tirage ! Payez 15 $ de frais de dossier. »

Les indices que vous avez utilisés (urgence, demande d'argent ou de code secret, gain inattendu) sont exactement ceux qu'un modèle apprend à repérer.
:::

::: a-retenir
- Apprendre, pour une machine, c'est **ajuster ses réglages** à partir de nombreux exemples.
- Les quatre étapes : **données**, **entraînement**, **modèle**, **prédiction**.
- Une prédiction est une probabilité, jamais une certitude.
- La qualité d'une IA dépend d'abord de la qualité de ses données.
:::
