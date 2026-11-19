import pytest

from app.blocks import (
    BLOCK_CLASSES,
    BlockError,
    block_types_catalog,
    public_view,
    validate_block,
)

QUESTION = {
    "prompt": "Que signifie IA ?",
    "kind": "single",
    "options": [
        {"text": "Intelligence artificielle", "correct": True},
        {"text": "Internet avancé"},
    ],
    "explanation": "IA est l'abréviation d'intelligence artificielle.",
}

VALID = {
    "text": {"markdown": "# Bienvenue"},
    "image": {"url": "/media/schema.png", "alt": "Schéma"},
    "gallery": {"images": [{"url": "https://exemple.cd/a.png", "alt": "A"}]},
    "callout": {"variant": "tip", "markdown": "Astuce"},
    "table": {"headers": ["Outil", "Usage"], "rows": [["Rédaction", "E-mails"]]},
    "code": {"language": "text", "code": "Rédige un e-mail de relance."},
    "video": {"source": "link", "url": "https://exemple.cd/video"},
    "audio": {"url": "/media/intro.mp3"},
    "pdf": {"url": "/media/support.pdf", "title": "Support"},
    "slides": {"url": "/media/diapos.pdf", "title": "Diapositives"},
    "file": {"url": "/media/modele.xlsx", "filename": "modele.xlsx"},
    "embed": {"url": "https://exemple.cd/embed", "title": "Démo"},
    "quiz": {"questions": [QUESTION]},
    "open_question": {"prompt": "Décrivez un usage de l'IA dans votre métier."},
    "assignment": {"title": "Devoir 1", "instructions": "Rédigez trois prompts."},
    "exam": {
        "title": "Examen final",
        "questions": [QUESTION],
        "duration_minutes": 30,
        "pass_score": 70,
    },
    "tool_exercise": {"tool_slug": "assistant-redaction", "instructions": "Essayez."},
    "case_study": {"title": "Cas", "markdown": "Une PME de Kinshasa..."},
    "live_session": {
        "title": "Séance 1",
        "starts_at": "2027-01-15T14:00:00+01:00",
        "duration_minutes": 90,
        "join_url": "https://exemple.cd/visio",
    },
}


def test_every_block_type_has_a_valid_example():
    assert set(VALID) == set(BLOCK_CLASSES)


@pytest.mark.parametrize("block_type", sorted(VALID))
def test_valid_examples_are_accepted(block_type):
    normalized = validate_block(block_type, VALID[block_type])
    assert "type" not in normalized
    # Une donnée déjà normalisée reste valide et inchangée.
    assert validate_block(block_type, normalized) == normalized


def test_unknown_type_is_rejected():
    with pytest.raises(BlockError):
        validate_block("hologramme", {})


def test_unknown_field_is_rejected():
    with pytest.raises(BlockError) as info:
        validate_block("text", {"markdown": "ok", "couleur": "rouge"})
    assert info.value.errors


def test_http_url_is_rejected():
    with pytest.raises(BlockError):
        validate_block("pdf", {"url": "http://exemple.cd/a.pdf", "title": "A"})


def test_uploaded_video_must_be_internal():
    with pytest.raises(BlockError):
        validate_block("video", {"source": "upload", "url": "https://exemple.cd/v"})


def test_table_rows_must_match_headers():
    with pytest.raises(BlockError):
        validate_block("table", {"headers": ["A", "B"], "rows": [["seule"]]})


def test_single_choice_needs_exactly_one_answer():
    two_answers = {
        "prompt": "?",
        "kind": "single",
        "options": [{"text": "a", "correct": True}, {"text": "b", "correct": True}],
    }
    with pytest.raises(BlockError):
        validate_block("quiz", {"questions": [two_answers]})


def test_multiple_choice_needs_an_answer():
    no_answer = {
        "prompt": "?",
        "kind": "multiple",
        "options": [{"text": "a"}, {"text": "b"}],
    }
    with pytest.raises(BlockError):
        validate_block("quiz", {"questions": [no_answer]})


def test_true_false_needs_two_options():
    three_options = {
        "prompt": "?",
        "kind": "true_false",
        "options": [{"text": "Vrai", "correct": True}, {"text": "Faux"}, {"text": "?"}],
    }
    with pytest.raises(BlockError):
        validate_block("quiz", {"questions": [three_options]})


def test_live_session_needs_a_link_or_a_place():
    with pytest.raises(BlockError):
        validate_block(
            "live_session",
            {"title": "S", "starts_at": "2027-01-15T14:00:00Z", "duration_minutes": 60},
        )


@pytest.mark.parametrize("block_type", ["quiz", "exam"])
def test_learners_never_see_answers(block_type):
    stored = validate_block(block_type, VALID[block_type])
    visible = public_view(block_type, stored)
    question = visible["questions"][0]
    assert "explanation" not in question
    assert all("correct" not in option for option in question["options"])
    assert [option["text"] for option in question["options"]] == [
        "Intelligence artificielle",
        "Internet avancé",
    ]
    # La donnée stockée n'est pas modifiée.
    assert stored["questions"][0]["options"][0]["correct"] is True
    assert stored["questions"][0]["explanation"]


def test_other_blocks_are_sent_unchanged():
    stored = validate_block("text", VALID["text"])
    assert public_view("text", stored) == stored


def test_catalog_lists_every_type_with_a_schema():
    catalog = block_types_catalog()
    assert {entry["type"] for entry in catalog} == set(BLOCK_CLASSES)
    for entry in catalog:
        assert entry["label"] and entry["family"]
        assert entry["schema"]["type"] == "object"
