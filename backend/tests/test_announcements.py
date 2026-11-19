from datetime import datetime, timedelta, timezone


def _future(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


EVENT = {
    "kind": "evenement",
    "title": "Webinaire : l'IA pour les PME",
    "summary": "Une heure pour découvrir trois usages concrets de l'IA en entreprise.",
    "body": "Programme détaillé...",
    "registration_mode": "internal",
    "capacity": 2,
}


def _create(client, headers, **overrides):
    payload = {**EVENT, "starts_at": _future(7), **overrides}
    response = client.post("/admin/announcements", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_event_needs_a_date(client, admin_headers):
    response = client.post("/admin/announcements", json=EVENT, headers=admin_headers)
    assert response.status_code == 422


def test_admin_only(client, learner_headers):
    assert client.get("/admin/announcements", headers=learner_headers).status_code == 403


def test_publication_registration_and_export(client, admin_headers):
    event = _create(client, admin_headers)
    assert event["slug"] == "webinaire-l-ia-pour-les-pme"
    assert client.get("/announcements").json() == []
    assert client.get(f"/announcements/{event['slug']}").status_code == 404

    client.post(f"/admin/announcements/{event['id']}/publish", headers=admin_headers)
    listed = client.get("/announcements?kind=evenement&when=upcoming").json()
    assert [a["slug"] for a in listed] == [event["slug"]]
    assert listed[0]["registration_open"] is True

    person = {"full_name": "Moïse Kabasele", "email": "moise@example.com", "phone": "+243810000000"}
    first = client.post(f"/announcements/{event['slug']}/register", json=person)
    assert first.status_code == 201, first.text
    assert first.json()["registered_count"] == 1
    duplicate = client.post(f"/announcements/{event['slug']}/register", json=person)
    assert duplicate.status_code == 409
    second = client.post(
        f"/announcements/{event['slug']}/register",
        json={"full_name": "Aïcha Diallo", "email": "aicha@example.com"},
    )
    assert second.json()["registration_open"] is False  # complet
    full = client.post(
        f"/announcements/{event['slug']}/register",
        json={"full_name": "Tiers", "email": "tiers@example.com"},
    )
    assert full.status_code == 409

    csv = client.get(f"/admin/announcements/{event['id']}/registrations.csv", headers=admin_headers)
    assert csv.status_code == 200
    assert "Moïse Kabasele" in csv.text and "aicha@example.com" in csv.text


def test_expired_and_pinned(client, admin_headers):
    news = _create(
        client, admin_headers, kind="actualite", title="Nouveau cours en ligne",
        summary="Le cours Introduction à l'IA est disponible gratuitement.", registration_mode="internal",
    )
    assert news["registration_mode"] == "none"
    old = _create(client, admin_headers, title="Ancienne annonce", expires_at=_future(-1))
    pinned = _create(client, admin_headers, title="Annonce épinglée", pinned=True)
    for item in (news, old, pinned):
        client.post(f"/admin/announcements/{item['id']}/publish", headers=admin_headers)
    slugs = [a["slug"] for a in client.get("/announcements").json()]
    assert slugs[0] == pinned["slug"]
    assert old["slug"] not in slugs and news["slug"] in slugs


def test_update_and_delete(client, admin_headers):
    event = _create(client, admin_headers)
    payload = {**EVENT, "slug": "webinaire-pme", "starts_at": _future(3), "title": "Webinaire modifié"}
    updated = client.put(f"/admin/announcements/{event['id']}", json=payload, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["slug"] == "webinaire-pme"
    assert client.delete(f"/admin/announcements/{event['id']}", headers=admin_headers).status_code == 204
