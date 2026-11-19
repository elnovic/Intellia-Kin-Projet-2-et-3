import json
import shutil
from pathlib import Path

import pytest

from app.content import ContentError, course_image, import_courses, lesson_blocks

FIXTURE = Path(__file__).parent / "fixtures" / "contenu"


def test_lesson_is_split_into_blocks():
    blocks = lesson_blocks("cours-test", (FIXTURE / "cours/cours-test/lecons/01.md").read_text())
    assert [b["type"] for b in blocks] == ["text", "callout", "callout"]
    assert "/media/cours/cours-test/images/couverture.svg" in blocks[0]["data"]["markdown"]
    assert blocks[1]["data"] == {"variant": "tip", "title": "À retenir", "markdown": "Point clé."}
    assert blocks[2]["data"]["variant"] == "exercise"
    assert blocks[2]["data"]["title"] == "Votre premier essai"


def test_unclosed_callout_is_an_error():
    with pytest.raises(ContentError):
        lesson_blocks("x", "::: a-retenir\nsans fin")


@pytest.fixture()
def content(tmp_path):
    target = tmp_path / "contenu"
    shutil.copytree(FIXTURE, target)
    return target


def test_import_is_idempotent_and_keeps_progress(client, session_factory, content, learner_headers):
    with session_factory() as db:
        assert import_courses(db, content) == {"cours-test": "créé"}
        assert import_courses(db, content) == {"cours-test": "inchangé"}

    detail = client.get("/courses/cours-test").json()
    assert detail["exam_question_count"] == 1
    assert detail["cover_image"] == "/media/cours/cours-test/images/couverture.svg"
    lessons = detail["modules"][0]["lessons"]
    assert [l["title"] for l in lessons] == ["Leçon 1", "Leçon 2"]
    preview = client.get(f"/courses/cours-test/lessons/{lessons[0]['id']}").json()
    assert [b["type"] for b in preview["blocks"]] == ["text", "callout", "callout", "quiz"]

    client.post("/courses/cours-test/enroll", headers=learner_headers)
    client.post(f"/courses/cours-test/lessons/{lessons[0]['id']}/complete", headers=learner_headers)

    # Modification du cours : la leçon 1 change de titre et garde son identifiant.
    spec_path = content / "cours/cours-test/cours.json"
    spec = json.loads(spec_path.read_text())
    spec["modules"][0]["lessons"][0]["title"] = "Leçon 1 revue"
    spec["modules"].append({"title": "Module 2", "lessons": [spec["modules"][0]["lessons"].pop()]})
    spec_path.write_text(json.dumps(spec))
    with session_factory() as db:
        assert import_courses(db, content) == {"cours-test": "mis à jour"}

    detail = client.get("/courses/cours-test").json()
    assert [m["title"] for m in detail["modules"]] == ["Module 1", "Module 2"]
    assert detail["modules"][0]["lessons"][0]["id"] == lessons[0]["id"]
    assert detail["modules"][1]["lessons"][0]["id"] == lessons[1]["id"]
    progress = client.get("/courses/cours-test/progress", headers=learner_headers).json()
    assert progress["completed_lessons"] == 1


def test_broken_course_is_reported(session_factory, content):
    (content / "cours/cours-test/lecons/02.md").unlink()
    with session_factory() as db:
        report = import_courses(db, content)
    assert report["cours-test"].startswith("erreur")


def test_images_are_served_safely(client, content, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "content_dir", content)
    assert client.get("/media/cours/cours-test/images/couverture.svg").status_code == 200
    assert client.get("/media/cours/cours-test/images/..%2Fcours.json").status_code == 404
    assert course_image(content, "cours-test", "cours.json") is None
    assert course_image(content, "../x", "a.svg") is None
