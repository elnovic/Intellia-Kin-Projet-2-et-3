"""Parcours complet : leçons, quiz, examen final, attestation."""

from tests.test_courses import QUIZ, _add_block, _add_lesson, _create_course

EXAM = {
    "questions": [
        {
            "prompt": f"Question {i}",
            "options": [{"text": "Bonne", "correct": True}, {"text": "Mauvaise"}],
        }
        for i in range(1, 11)
    ]
}


def _ready_course(client, admin_headers):
    course = _create_course(client, admin_headers, title="Cours avec examen")
    _, lesson = _add_lesson(client, admin_headers, course["id"])
    quiz = _add_block(client, admin_headers, lesson["id"], "quiz", QUIZ)
    assert client.put(
        f"/admin/courses/{course['id']}/exam", json=EXAM, headers=admin_headers
    ).status_code == 200
    assert client.post(f"/admin/courses/{course['id']}/publish", headers=admin_headers).status_code == 200
    return course, lesson, quiz


def _answers(correct: int, total: int = 10):
    return {"answers": [[0]] * correct + [[1]] * (total - correct)}


def test_exam_rejects_invalid_questions(client, admin_headers):
    course = _create_course(client, admin_headers)
    bad = {"questions": [{"prompt": "?", "options": [{"text": "a"}, {"text": "b"}]}]}
    response = client.put(f"/admin/courses/{course['id']}/exam", json=bad, headers=admin_headers)
    assert response.status_code == 422


def test_quiz_check_gives_feedback(client, admin_headers, learner_headers):
    course, lesson, quiz = _ready_course(client, admin_headers)
    client.post(f"/courses/{course['slug']}/enroll", headers=learner_headers)
    url = f"/courses/{course['slug']}/lessons/{lesson['id']}/blocks/{quiz['id']}/check"
    response = client.post(url, json={"answers": [[1]]}, headers=learner_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["score"] == 0
    assert body["results"][0]["correct"] is False
    assert body["results"][0]["correct_options"] == [0]
    assert body["results"][0]["explanation"]


def test_full_path_to_certificate(client, admin_headers, learner_headers):
    course, lesson, _ = _ready_course(client, admin_headers)
    slug = course["slug"]
    client.post(f"/courses/{slug}/enroll", headers=learner_headers)

    # L'examen est fermé tant que les leçons ne sont pas terminées.
    assert client.get(f"/courses/{slug}/exam", headers=learner_headers).status_code == 409
    client.post(f"/courses/{slug}/lessons/{lesson['id']}/complete", headers=learner_headers)

    exam = client.get(f"/courses/{slug}/exam", headers=learner_headers)
    assert exam.status_code == 200
    assert exam.json()["attempts_left"] == 3
    assert all("correct" not in o for q in exam.json()["questions"] for o in q["options"])

    # Pas d'attestation sans examen réussi.
    early = client.post(f"/courses/{slug}/certificate", json={"full_name": "Grâce Mbuyi"}, headers=learner_headers)
    assert early.status_code == 409

    failed = client.post(f"/courses/{slug}/exam", json=_answers(6), headers=learner_headers)
    assert failed.json()["passed"] is False
    assert failed.json()["score"] == 60
    assert "correct_options" not in failed.json()["results"][0]

    passed = client.post(f"/courses/{slug}/exam", json=_answers(10), headers=learner_headers)
    assert passed.json() | {"results": None} == {
        "score": 100, "passed": True, "distinction": True, "results": None, "attempts_left": 1,
    }

    certificate = client.post(
        f"/courses/{slug}/certificate", json={"full_name": "  Grâce   Mbuyi "}, headers=learner_headers
    )
    assert certificate.status_code == 200, certificate.text
    body = certificate.json()
    assert body["full_name"] == "Grâce Mbuyi"
    assert body["number"].startswith("IK-") and body["number"].endswith("000001")
    assert body["distinction"] is True
    assert body["signatory_name"] == "Elnovic NTEDIKA"

    # Le nom ne change plus après délivrance.
    again = client.post(f"/courses/{slug}/certificate", json={"full_name": "Autre Nom"}, headers=learner_headers)
    assert again.json()["full_name"] == "Grâce Mbuyi"

    # Vérification publique, puis correction par un administrateur.
    public = client.get(f"/certificates/{body['number'].lower()}")
    assert public.status_code == 200
    assert public.json()["course_title"] == "Cours avec examen"
    fixed = client.patch(
        f"/admin/certificates/{body['number']}", json={"full_name": "Grâce Mbuyi Kalala"}, headers=admin_headers
    )
    assert fixed.status_code == 200
    assert client.get(f"/certificates/{body['number']}").json()["full_name"] == "Grâce Mbuyi Kalala"

    mine = client.get("/me/certificates", headers=learner_headers).json()
    assert [c["number"] for c in mine] == [body["number"]]
    my_courses = client.get("/me/courses", headers=learner_headers).json()
    assert my_courses[0]["progress"]["certificate_number"] == body["number"]

    stats = client.get("/admin/stats", headers=admin_headers).json()
    assert stats["certificates"] == 1


def test_three_attempts_per_day(client, admin_headers, learner_headers):
    course, lesson, _ = _ready_course(client, admin_headers)
    slug = course["slug"]
    client.post(f"/courses/{slug}/enroll", headers=learner_headers)
    client.post(f"/courses/{slug}/lessons/{lesson['id']}/complete", headers=learner_headers)
    for _ in range(3):
        assert client.post(f"/courses/{slug}/exam", json=_answers(2), headers=learner_headers).status_code == 200
    blocked = client.post(f"/courses/{slug}/exam", json=_answers(10), headers=learner_headers)
    assert blocked.status_code == 429
    assert client.get(f"/courses/{slug}/exam", headers=learner_headers).json()["retry_at"]


def test_unknown_certificate(client):
    assert client.get("/certificates/IK-2026-999999").status_code == 404
