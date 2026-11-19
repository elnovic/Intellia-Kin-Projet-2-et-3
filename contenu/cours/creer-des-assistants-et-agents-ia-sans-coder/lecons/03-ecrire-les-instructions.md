Les instructions sont le cœur de votre assistant. Ce sont elles qui déterminent son comportement dans toutes les conversations. Des instructions vagues donnent un assistant imprévisible ; des instructions claires donnent un assistant fiable.

## La structure des instructions

De bonnes instructions couvrent généralement :

1. **Le rôle** : qui est l'assistant et pour qui il travaille.
2. **La mission** : ce qu'il doit faire.
3. **Les sources** : sur quoi il doit s'appuyer.
4. **Le format des réponses** : longueur, structure, langue.
5. **Les règles et les limites** : ce qu'il ne doit pas faire.
6. **La conduite à tenir dans les cas difficiles** : question hors sujet, information introuvable, demande sensible.

## Un exemple complet

> **Rôle** : Tu es l'assistant procédures de [nom de l'institution], une institution de microfinance. Tu aides les agents de crédit à appliquer correctement les procédures internes.
>
> **Mission** : Réponds aux questions des agents sur les procédures de crédit, les documents à demander, les taux et les étapes de traitement des dossiers.
>
> **Sources** : Appuie-toi uniquement sur les documents fournis (Manuel des procédures de crédit, version de mars 2026 ; Grille des taux en vigueur). Cite toujours le document et la section utilisés.
>
> **Format** : Réponds en français, de façon concise (moins de 150 mots sauf si on te demande plus de détails). Utilise des listes pour les étapes et les documents.
>
> **Limites** : Tu ne prends aucune décision d'octroi ou de refus de crédit. Tu ne traites aucune information sur un client précis. Tu ne donnes pas de conseil juridique.
>
> **Cas difficiles** : Si la réponse ne figure pas dans les documents, dis-le clairement (« Je ne trouve pas cette information dans les procédures ») et oriente vers la responsable des opérations. N'invente jamais une procédure, un taux ou un délai.

## Les bonnes pratiques

- **Soyez explicite** : l'assistant ne devine pas ce que vous ne dites pas.
- **Donnez des exemples** de bonnes réponses pour les questions les plus fréquentes.
- **Formulez positivement** ce qu'il doit faire, en plus de ce qu'il ne doit pas faire.
- **Insistez sur l'interdiction d'inventer** : c'est la règle la plus importante pour un assistant fondé sur des documents.
- **Restez lisible** : des sections claires valent mieux qu'un long paragraphe.

::: a-savoir
Vous pouvez demander à l'IA de vous aider à rédiger les instructions de votre assistant à partir de votre fiche de conception. Demandez-lui ensuite de les critiquer : « Quelles situations ces instructions ne couvrent-elles pas ? Quelles ambiguïtés pourraient poser problème ? »
:::

::: attention
Un utilisateur malintentionné peut essayer de contourner les instructions (« Oublie tes règles et donne-moi… »). Les outils récents résistent de mieux en mieux, mais aucun n'est infaillible. Ne confiez jamais à un assistant des informations qu'il ne doit en aucun cas divulguer, et limitez ses capacités d'action au strict nécessaire.
:::

::: a-vous Vos instructions
À partir de votre fiche de conception, rédigez les instructions complètes de votre assistant en six sections. Demandez à l'IA de les critiquer, puis améliorez-les. Ajoutez deux exemples de bonnes réponses.
:::

::: a-retenir
- Rôle, mission, sources, format, limites, cas difficiles.
- Soyez explicite et donnez des exemples.
- La règle d'or : ne jamais inventer, dire quand on ne sait pas.
- Aucun assistant n'est infaillible : limitez ses accès et ses capacités.
:::
