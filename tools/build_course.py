"""Assemble cours.json à partir d'un plan en texte simple (plan.txt).

    python tools/build_course.py <slug>

Format de plan.txt :

    title: Titre du cours
    summary: Résumé
    audience: tous | jeune_diplome | entrepreneur | pme
    parcours: tronc-commun | carriere | entrepreneuriat | organisations
    level: debutant | intermediaire | avance
    duration: 75
    position: 3
    prerequisites: ...
    objective: un objectif (ligne répétable)
    skill: une compétence (ligne répétable)
    description: un paragraphe (ligne répétable)
    module: Titre du module
    lesson: clé | Titre | fichier.md | objectif | minutes [| apercu]
    ? Question du quiz de la leçon
    + bonne réponse
    - mauvaise réponse
    > explication
    exam:
    ? Question d'examen
    + ...
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "contenu" / "cours"


def finish_questions(raw):
    out = []
    for q in raw:
        good = sum(o["correct"] for o in q["options"])
        labels = sorted(o["text"].lower() for o in q["options"])
        kind = "true_false" if labels == ["faux", "vrai"] else "multiple" if good > 1 else "single"
        if not good or len(q["options"]) < 2:
            raise SystemExit(f"Question invalide : {q['prompt']}")
        out.append({**q, "kind": kind})
    return out


def build(slug):
    folder = ROOT / slug
    spec = {"slug": slug, "format": "self_paced", "objectives": [], "skills": [], "modules": [],
            "trainer": "Équipe pédagogique Intellia Kin", "cover_image": "images/couverture.svg"}
    description, exam, target, current = [], [], None, None
    for number, raw in enumerate((folder / "plan.txt").read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line[0] in "?+->" and line[1:2] == " ":
            body = line[2:].strip()
            if line[0] == "?":
                current = {"prompt": body, "options": []}
                target.append(current)
            elif line[0] in "+-":
                current["options"].append({"text": body, "correct": line[0] == "+"})
            else:
                current["explanation"] = body
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key == "module":
            spec["modules"].append({"title": value, "lessons": []})
        elif key == "lesson":
            parts = [p.strip() for p in value.split("|")]
            lesson = {"key": parts[0], "title": parts[1], "file": parts[2], "objective": parts[3],
                      "duration_minutes": int(parts[4]), "is_preview": len(parts) > 5 and parts[5] == "apercu", "quiz": []}
            spec["modules"][-1]["lessons"].append(lesson)
            target = lesson["quiz"]
        elif key == "exam":
            target = exam
        elif key == "objective":
            spec["objectives"].append(value)
        elif key == "skill":
            spec["skills"].append(value)
        elif key == "description":
            description.append(value)
        elif key in ("duration", "position"):
            spec["duration_minutes" if key == "duration" else key] = int(value)
        elif key in ("title", "summary", "audience", "parcours", "level", "prerequisites", "trainer"):
            spec[key] = value
        else:
            raise SystemExit(f"Ligne {number} non comprise : {raw}")
    spec["description"] = "\n\n".join(description)
    for module in spec["modules"]:
        for lesson in module["lessons"]:
            lesson["quiz"] = finish_questions(lesson["quiz"])
            if not (folder / "lecons" / lesson["file"]).is_file():
                raise SystemExit(f"Fichier manquant : {lesson['file']}")
    spec["exam"] = {"pass_score": 70, "distinction_score": 90, "questions": finish_questions(exam)}
    (folder / "cours.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    lessons = sum(len(m["lessons"]) for m in spec["modules"])
    print(f"{slug} : {len(spec['modules'])} modules, {lessons} leçons, {len(exam)} questions d'examen")


if __name__ == "__main__":
    for slug in sys.argv[1:]:
        build(slug)
