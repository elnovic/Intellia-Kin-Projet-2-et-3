from app.routers.admin_courses import slugify

QUIZ = {
    "questions": [
        {
            "prompt": "Que signifie IA ?",
            "kind": "single",
            "options": [
                {"text": "Intelligence artificielle", "correct": True},
                {"text": "Internet avancé"},
            ],
            "explanation": "IA est l'abréviation d'intelligence artificielle.",
        }
    ]
}


def _create_course(client, headers, **overrides):
    payload = {"title": "Découvrir l'IA en 3 jours", "audience": "jeune_diplome", **overrides}
    response = client.post("/admin/courses", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _add_lesson(client, headers, course_id, title="Leçon 1", is_preview=False):
    module = client.post(
        f"/admin/courses/{course_id}/modules", json={"title": "Module 1"}, headers=headers
    )
    assert module.status_code == 201, module.text
    lesson = client.post(
        f"/admin/modules/{module.json()['id']}/lessons",
        json={"title": title, "is_preview": is_preview},
        headers=headers,
    )
    assert lesson.status_code == 201, lesson.text
    return module.json(), lesson.json()


def _add_block(client, headers, lesson_id, block_type, data):
    response = client.post(
        f"/admin/lessons/{lesson_id}/blocks",
        json={"type": block_type, "data": data},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _published_course(client, headers, **overrides):
    course = _create_course(client, headers, **overrides)
    _, lesson = _add_lesson(client, headers, course["id"])
    published = client.post(f"/admin/courses/{course['id']}/publish", headers=headers)
    assert published.status_code == 200, published.text
    return published.json(), lesson


def test_slugify():
    assert slugify("Découvrir l'IA en 3 jours") == "decouvrir-l-ia-en-3-jours"
    assert slugify("  Paie & fiscalité !  ") == "paie-fiscalite"
    assert slugify("???") == "cours"


def test_console_is_reserved_to_admins(client, learner_headers):
    assert client.get("/admin/courses").status_code == 401
    assert client.get("/admin/courses", headers=learner_headers).status_code == 403
    refused = client.post(
        "/admin/courses", json={"title": "Cours pirate"}, headers=learner_headers
    )
    assert refused.status_code == 403


def test_block_types_are_listed_for_the_editor(client, admin_headers):
    response = client.get("/admin/block-types", headers=admin_headers)
    assert response.status_code == 200
    types = {entry["type"] for entry in response.json()}
    assert {"text", "video", "quiz", "exam", "live_session"} <= types


def test_slug_is_generated_and_kept_unique(client, admin_headers):
    first = _create_course(client, admin_headers)
    second = _create_course(client, admin_headers)
    assert first["slug"] == "decouvrir-l-ia-en-3-jours"
    assert second["slug"] == "decouvrir-l-ia-en-3-jours-2"
    taken = client.post(
        "/admin/courses",
        json={"title": "Autre cours", "slug": first["slug"]},
        headers=admin_headers,
    )
    assert taken.status_code == 409


def test_paid_course_needs_a_price(client, admin_headers):
    no_price = client.post(
        "/admin/courses",
        json={"title": "Cours payant", "is_free": False},
        headers=admin_headers,
    )
    assert no_price.status_code == 422
    paid = _create_course(client, admin_headers, is_free=False, price_usd="25.00")
    assert paid["is_free"] is False
    assert float(paid["price_usd"]) == 25.0
    # Rendre le cours gratuit efface son prix.
    freed = client.patch(
        f"/admin/courses/{paid['id']}", json={"is_free": True}, headers=admin_headers
    )
    assert freed.status_code == 200, freed.text
    assert freed.json()["price_usd"] is None


def test_course_needs_a_lesson_to_be_published(client, admin_headers):
    course = _create_course(client, admin_headers)
    empty = client.post(f"/admin/courses/{course['id']}/publish", headers=admin_headers)
    assert empty.status_code == 409
    _add_lesson(client, admin_headers, course["id"])
    ready = client.post(f"/admin/courses/{course['id']}/publish", headers=admin_headers)
    assert ready.status_code == 200
    assert ready.json()["status"] == "published"
    assert ready.json()["published_at"] is not None


def test_drafts_are_hidden_from_the_catalogue(client, admin_headers):
    draft = _create_course(client, admin_headers, title="Brouillon secret")
    published, _ = _published_course(client, admin_headers, title="Cours ouvert")

    catalogue = client.get("/courses")
    assert catalogue.status_code == 200
    assert [course["slug"] for course in catalogue.json()] == [published["slug"]]
    assert client.get(f"/courses/{draft['slug']}").status_code == 404

    detail = client.get(f"/courses/{published['slug']}")
    assert detail.status_code == 200
    lesson = detail.json()["modules"][0]["lessons"][0]
    assert lesson["title"] == "Leçon 1"
    assert "blocks" not in lesson


def test_catalogue_filters(client, admin_headers):
    _published_course(client, admin_headers, title="Pour les jeunes", audience="jeune_diplome")
    _published_course(client, admin_headers, title="Pour les PME", audience="pme")
    _published_course(client, admin_headers, title="Pour tous", audience="tous")
    _published_course(
        client, admin_headers, title="PME payant", audience="pme",
        is_free=False, price_usd="40.00",
    )

    def titles(query):
        return {course["title"] for course in client.get(f"/courses{query}").json()}

    assert titles("?audience=pme") == {"Pour les PME", "Pour tous", "PME payant"}
    assert titles("?audience=jeune_diplome") == {"Pour les jeunes", "Pour tous"}
    assert titles("?is_free=false") == {"PME payant"}
    assert titles("?audience=pme&is_free=true") == {"Pour les PME", "Pour tous"}


def test_invalid_block_is_refused_with_details(client, admin_headers):
    course = _create_course(client, admin_headers)
    _, lesson = _add_lesson(client, admin_headers, course["id"])
    unknown = client.post(
        f"/admin/lessons/{lesson['id']}/blocks",
        json={"type": "hologramme", "data": {}},
        headers=admin_headers,
    )
    assert unknown.status_code == 422
    invalid = client.post(
        f"/admin/lessons/{lesson['id']}/blocks",
        json={"type": "video", "data": {"url": "http://exemple.cd/video"}},
        headers=admin_headers,
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["erreurs"]


def test_blocks_can_be_edited_reordered_and_deleted(client, admin_headers):
    course = _create_course(client, admin_headers)
    _, lesson = _add_lesson(client, admin_headers, course["id"])
    text = _add_block(client, admin_headers, lesson["id"], "text", {"markdown": "Un"})
    video = _add_block(
        client, admin_headers, lesson["id"], "video", {"url": "https://exemple.cd/v"}
    )
    quiz = _add_block(client, admin_headers, lesson["id"], "quiz", QUIZ)
    assert [text["position"], video["position"], quiz["position"]] == [1, 2, 3]

    edited = client.put(
        f"/admin/blocks/{text['id']}", json={"data": {"markdown": "Deux"}},
        headers=admin_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["data"] == {"markdown": "Deux"}

    reordered = client.post(
        f"/admin/lessons/{lesson['id']}/blocks/reorder",
        json={"ids": [quiz["id"], text["id"], video["id"]]},
        headers=admin_headers,
    )
    assert reordered.status_code == 200, reordered.text
    assert [block["type"] for block in reordered.json()["blocks"]] == ["quiz", "text", "video"]

    incomplete = client.post(
        f"/admin/lessons/{lesson['id']}/blocks/reorder",
        json={"ids": [quiz["id"], text["id"]]},
        headers=admin_headers,
    )
    assert incomplete.status_code == 422

    deleted = client.delete(f"/admin/blocks/{video['id']}", headers=admin_headers)
    assert deleted.status_code == 204
    remaining = client.get(f"/admin/lessons/{lesson['id']}", headers=admin_headers)
    assert [block["type"] for block in remaining.json()["blocks"]] == ["quiz", "text"]


def test_lesson_access_enrollment_and_progress(client, admin_headers, learner_headers):
    course = _create_course(client, admin_headers)
    module, first = _add_lesson(client, admin_headers, course["id"], "Aperçu", is_preview=True)
    second = client.post(
        f"/admin/modules/{module['id']}/lessons",
        json={"title": "Suite"},
        headers=admin_headers,
    ).json()
    _add_block(client, admin_headers, second["id"], "quiz", QUIZ)
    client.post(f"/admin/courses/{course['id']}/publish", headers=admin_headers)
    slug = course["slug"]

    # La leçon en aperçu est ouverte à tous ; l'autre demande une inscription.
    assert client.get(f"/courses/{slug}/lessons/{first['id']}").status_code == 200
    assert client.get(f"/courses/{slug}/lessons/{second['id']}").status_code == 401
    not_enrolled = client.get(
        f"/courses/{slug}/lessons/{second['id']}", headers=learner_headers
    )
    assert not_enrolled.status_code == 403

    enrolled = client.post(f"/courses/{slug}/enroll", headers=learner_headers)
    assert enrolled.status_code == 201, enrolled.text
    again = client.post(f"/courses/{slug}/enroll", headers=learner_headers)
    assert again.status_code == 409

    # L'apprenant voit le quiz, sans les réponses ni les explications.
    lesson = client.get(f"/courses/{slug}/lessons/{second['id']}", headers=learner_headers)
    assert lesson.status_code == 200
    question = lesson.json()["blocks"][0]["data"]["questions"][0]
    assert "explanation" not in question
    assert all("correct" not in option for option in question["options"])

    # L'administrateur, lui, retrouve les réponses dans la console.
    in_console = client.get(f"/admin/lessons/{second['id']}", headers=admin_headers)
    stored = in_console.json()["blocks"][0]["data"]["questions"][0]
    assert stored["options"][0]["correct"] is True

    half = client.post(
        f"/courses/{slug}/lessons/{first['id']}/complete", headers=learner_headers
    )
    assert half.json() == {"completed_lessons": 1, "total_lessons": 2, "percent": 50}
    repeated = client.post(
        f"/courses/{slug}/lessons/{first['id']}/complete", headers=learner_headers
    )
    assert repeated.json()["completed_lessons"] == 1
    done = client.post(
        f"/courses/{slug}/lessons/{second['id']}/complete", headers=learner_headers
    )
    assert done.json()["percent"] == 100
    progress = client.get(f"/courses/{slug}/progress", headers=learner_headers)
    assert progress.json()["percent"] == 100


def test_paid_course_cannot_be_joined_without_payment(client, admin_headers, learner_headers):
    course, lesson = _published_course(
        client, admin_headers, title="Cours payant", is_free=False, price_usd="30.00"
    )
    refused = client.post(f"/courses/{course['slug']}/enroll", headers=learner_headers)
    assert refused.status_code == 402
    locked = client.get(
        f"/courses/{course['slug']}/lessons/{lesson['id']}", headers=learner_headers
    )
    assert locked.status_code == 403


def test_modules_and_lessons_can_be_reordered_and_deleted(client, admin_headers):
    course = _create_course(client, admin_headers)
    first, lesson = _add_lesson(client, admin_headers, course["id"])
    second = client.post(
        f"/admin/courses/{course['id']}/modules",
        json={"title": "Module 2"},
        headers=admin_headers,
    ).json()
    assert [first["position"], second["position"]] == [1, 2]

    swapped = client.post(
        f"/admin/courses/{course['id']}/modules/reorder",
        json={"ids": [second["id"], first["id"]]},
        headers=admin_headers,
    )
    assert swapped.status_code == 200, swapped.text
    assert [module["title"] for module in swapped.json()["modules"]] == ["Module 2", "Module 1"]

    assert client.delete(f"/admin/lessons/{lesson['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/admin/lessons/{lesson['id']}", headers=admin_headers).status_code == 404
    assert client.delete(f"/admin/modules/{first['id']}", headers=admin_headers).status_code == 204
    tree = client.get(f"/admin/courses/{course['id']}", headers=admin_headers).json()
    assert [module["title"] for module in tree["modules"]] == ["Module 2"]
