Didier, gérant d'une quincaillerie à Goma, suivait ses ventes dans un cahier. Chaque fin de mois, il passait une journée entière à faire les totaux à la calculatrice. Quand sa nièce lui a montré comment faire la même chose dans Excel en quelques minutes, il n'en revenait pas.

## Les bases qui changent tout

Excel (ou Google Sheets, ou LibreOffice Calc) est un outil extraordinairement puissant, même avec quelques notions seulement.

**Organiser ses données en tableau.** Une ligne par élément (une vente, un client, un produit), une colonne par information (date, produit, quantité, prix). Pas de lignes vides, pas de cellules fusionnées au milieu des données.

**Mettre sous forme de tableau.** Sélectionnez vos données, puis « Mettre sous forme de tableau » : filtres, tri et mise en forme automatiques.

## Les fonctions indispensables

![Cinq fonctions Excel qui changent tout](images/formules-excel.svg)

- **SOMME, MOYENNE** : total et moyenne d'une colonne.
- **NB.SI, SOMME.SI** : compter ou additionner selon une condition (« le total des ventes du produit ciment »).
- **SI** : afficher un résultat selon une condition (« si le stock est inférieur à 10, afficher À commander »).
- **RECHERCHEX** (ou RECHERCHEV dans les anciennes versions) : retrouver une information dans un autre tableau (le prix d'un produit à partir de sa référence).

## L'IA, votre professeur d'Excel

Vous ne savez pas quelle formule utiliser ? Décrivez ce que vous voulez :

> Dans Excel, j'ai en colonne A les dates, en B les produits, en C les quantités et en D les prix unitaires. Je veux, dans une autre feuille, le total des ventes en dollars par produit pour le mois de mars. Donne-moi la formule et explique-la pas à pas.

L'IA peut aussi expliquer une formule existante que vous ne comprenez pas, ou vous aider à corriger une erreur (#N/A, #VALEUR!).

::: attention
Testez toujours une formule proposée par l'IA sur quelques lignes dont vous connaissez le résultat. Une formule peut sembler correcte et donner un résultat faux, par exemple si les plages de cellules sont mal définies.
:::

## Les tableaux croisés dynamiques

C'est l'outil qui fait passer d'un long tableau à une synthèse claire en quelques clics : total des ventes par mois et par produit, nombre de clients par ville… Insertion, puis Tableau croisé dynamique : glissez les champs, et Excel fait les calculs.

::: a-savoir
Les graphiques se créent en deux clics à partir d'un tableau ou d'un tableau croisé. Un graphique bien choisi (courbe pour une évolution, barres pour une comparaison) rend un rapport beaucoup plus parlant.
:::

::: a-vous Votre premier tableau de suivi
Créez un tableau de suivi pour une activité réelle ou imaginaire (ventes, dépenses, stock) avec au moins vingt lignes. Ajoutez une colonne calculée avec une formule, un total avec SOMME.SI, et un tableau croisé dynamique. Demandez à l'IA de vous aider à chaque blocage.
:::

::: a-retenir
- Une ligne par élément, une colonne par information, pas de cellules fusionnées.
- SOMME, NB.SI, SOMME.SI, SI et RECHERCHEX couvrent la plupart des besoins.
- Décrivez votre besoin à l'IA pour obtenir et comprendre une formule ; testez-la.
- Les tableaux croisés dynamiques transforment les données en synthèse.
:::
