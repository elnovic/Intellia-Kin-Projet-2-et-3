"""Passerelle vers les modèles d'IA.

Tous les outils passent par `complete()`. Les modèles configurés sont essayés
dans l'ordre : si le premier a épuisé son quota ou ne répond pas, le suivant
prend le relais. Changer de fournisseur ne touche que ce fichier.
"""

import logging

import httpx

from .config import get_settings

log = logging.getLogger("intellia.ai")


class AIUnavailable(RuntimeError):
    """Aucun modèle n'a pu répondre."""


def is_configured() -> bool:
    return bool(get_settings().groq_api_key)


def _payload(model: str, system: str, user: str, max_tokens: int) -> dict:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.6,
        "max_tokens": max_tokens,
    }
    if model.startswith("openai/gpt-oss"):
        # Raisonnement court : réponses plus rapides, quota mieux préservé.
        payload["reasoning_effort"] = "low"
    return payload


def complete(system: str, user: str, max_tokens: int = 2500) -> tuple[str, str]:
    """Renvoie (texte, modèle utilisé). Lève AIUnavailable si tout échoue."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise AIUnavailable("Aucune clé d'API configurée.")
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    with httpx.Client(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        for model in settings.groq_models:
            try:
                response = client.post(url, headers=headers, json=_payload(model, system, user, max_tokens))
            except httpx.HTTPError as exc:
                log.warning("Modèle %s injoignable : %s", model, exc)
                continue
            if response.status_code != 200:
                log.warning("Modèle %s : HTTP %s %s", model, response.status_code, response.text[:300])
                continue
            try:
                text = response.json()["choices"][0]["message"]["content"] or ""
            except (KeyError, IndexError, ValueError):
                log.warning("Modèle %s : réponse illisible", model)
                continue
            if text.strip():
                return text.strip(), model
    raise AIUnavailable("Tous les modèles ont échoué.")
