import pytest

from app import ai

CV = {
    "document": "cv",
    "nom_complet": "Grâce Mbuyi",
    "poste_vise": "Assistante administrative",
    "formation": "Licence en gestion, Université de Kinshasa, 2025",
    "competences": "Excel, rédaction, accueil",
}


@pytest.fixture()
def fake_ai(monkeypatch):
    calls = []

    def complete(system, user, max_tokens=2500):
        calls.append(user)
        return "## Grâce Mbuyi\nAssistante administrative", "modele-test"

    monkeypatch.setattr(ai, "complete", complete)
    return calls


def test_tools_are_listed_with_their_form(client):
    tools = {t["slug"]: t for t in client.get("/tools").json()}
    assert set(tools) == {"cv-lettre", "assistant-redaction", "plan-affaires"}
    assert "poste_vise" in tools["cv-lettre"]["fields"]["properties"]


def test_tools_need_an_account(client):
    assert client.post("/tools/cv-lettre", json=CV).status_code == 401


def test_invalid_form_is_refused(client, learner_headers, fake_ai):
    response = client.post("/tools/cv-lettre", json={"poste_vise": "x"}, headers=learner_headers)
    assert response.status_code == 422
    assert fake_ai == []


def test_daily_limit(client, learner_headers, fake_ai):
    for remaining in (2, 1, 0):
        response = client.post("/tools/cv-lettre", json=CV, headers=learner_headers)
        assert response.status_code == 200, response.text
        assert response.json()["remaining_today"] == remaining
    assert "<donnees>" in fake_ai[0] and "Grâce Mbuyi" in fake_ai[0]
    blocked = client.post("/tools/cv-lettre", json=CV, headers=learner_headers)
    assert blocked.status_code == 429
    quota = client.get("/tools/quota", headers=learner_headers).json()
    assert quota["remaining_today"] == 0


def test_unavailable_model_is_not_counted(client, learner_headers, monkeypatch):
    def down(*args, **kwargs):
        raise ai.AIUnavailable("indisponible")

    monkeypatch.setattr(ai, "complete", down)
    response = client.post("/tools/cv-lettre", json=CV, headers=learner_headers)
    assert response.status_code == 503
    assert client.get("/tools/quota", headers=learner_headers).json()["used_today"] == 0


def test_gateway_falls_back_to_the_next_model(monkeypatch):
    import httpx

    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "groq_api_key", "cle-test")
    monkeypatch.setattr(settings, "groq_models", ["premier", "second"])
    seen = []

    def handler(request):
        model = request.read().decode()
        seen.append(model)
        if '"premier"' in model:
            return httpx.Response(429, json={"error": "quota"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Bonjour"}}]})

    real_client = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )
    assert ai.complete("system", "user") == ("Bonjour", "second")
    assert len(seen) == 2
