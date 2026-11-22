// Passerelle vers les modèles d'IA (Groq, compatible avec l'API OpenAI).
//
// Les modèles configurés sont essayés dans l'ordre : si le premier a épuisé son
// quota ou ne répond pas, le suivant prend le relais. Changer de fournisseur ne
// touche que ce fichier.

export class AIUnavailable extends Error {}

function payload(model, system, user, maxTokens, json) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.6,
    max_tokens: maxTokens,
  };
  // Raisonnement court : réponses plus rapides, quota mieux préservé.
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  // Réponse sous forme d'objet JSON (agent Instagram).
  if (json) body.response_format = { type: "json_object" };
  return body;
}

/** Renvoie [texte, modèle utilisé]. Lève AIUnavailable si tout échoue. */
export async function complete(config, system, user, maxTokens = 2500, { json = false } = {}) {
  const fetchFn = config.fetch || fetch;
  if (!config.groqApiKey) throw new AIUnavailable("Aucune clé d'API configurée.");
  const url = `${config.groqBaseUrl.replace(/\/$/, "")}/chat/completions`;
  for (const model of config.groqModels) {
    let response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groqApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload(model, system, user, maxTokens, json)),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      console.warn(`Modèle ${model} injoignable : ${err}`);
      continue;
    }
    if (response.status !== 200) {
      console.warn(`Modèle ${model} : HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      continue;
    }
    try {
      const text = ((await response.json()).choices?.[0]?.message?.content || "").trim();
      if (text) return [text, model];
    } catch {
      console.warn(`Modèle ${model} : réponse illisible`);
    }
  }
  throw new AIUnavailable("Tous les modèles ont échoué.");
}
