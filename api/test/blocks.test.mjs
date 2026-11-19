import assert from "node:assert/strict";
import { test } from "node:test";

import { BlockError, grade, publicView, scorePercent, validateBlock, validateQuestions } from "../src/blocks.js";
import { ContentError, lessonBlocks } from "../src/content-parse.js";

const question = (extra = {}) => ({
  prompt: "Q ?",
  options: [{ text: "A", correct: true }, { text: "B" }],
  ...extra,
});

test("un bloc texte est normalisé", () => {
  assert.deepEqual(validateBlock("text", { markdown: "  Bonjour  " }), { markdown: "Bonjour" });
});

test("les valeurs par défaut sont ajoutées", () => {
  assert.deepEqual(validateBlock("callout", { markdown: "x" }), { variant: "info", title: null, markdown: "x" });
  const q = validateBlock("quiz", { questions: [question()] }).questions[0];
  assert.equal(q.kind, "single");
  assert.equal(q.points, 1);
  assert.equal(q.explanation, null);
  assert.equal(q.options[1].correct, false);
});

test("type inconnu, champ inconnu et champ manquant sont refusés", () => {
  assert.throws(() => validateBlock("inconnu", {}), BlockError);
  assert.throws(() => validateBlock("text", { markdown: "x", autre: 1 }), (e) => e.errors[0].champ === "autre");
  assert.throws(() => validateBlock("image", { url: "https://a.b/c.png" }), (e) => e.errors.some((x) => x.champ === "alt"));
});

test("les adresses sont contrôlées", () => {
  assert.ok(validateBlock("image", { url: "/media/x.png", alt: "x" }));
  assert.throws(() => validateBlock("image", { url: "http://a.b/c.png", alt: "x" }), BlockError);
  assert.throws(() => validateBlock("embed", { url: "/media/x", title: "x" }), BlockError);
  assert.throws(() => validateBlock("video", { url: "/media/v.mp4" }), /Vidéo/);
  assert.ok(validateBlock("video", { source: "upload", url: "/media/v.mp4" }));
});

test("le tableau doit avoir des lignes de la bonne largeur", () => {
  assert.throws(
    () => validateBlock("table", { headers: ["A", "B"], rows: [["1"]] }),
    (e) => /la ligne 1 a 1 cellules/.test(e.errors[0].message),
  );
});

test("la séance en direct demande un lien ou un lieu", () => {
  assert.throws(() => validateBlock("live_session", { title: "S", starts_at: "2026-12-01T10:00", duration_minutes: 60 }), BlockError);
  const ok = validateBlock("live_session", { title: "S", starts_at: "2026-12-01T10:00", duration_minutes: 60, location: "Kinshasa" });
  assert.equal(ok.starts_at, "2026-12-01T10:00:00.000Z");
});

test("les règles des questions sont vérifiées", () => {
  assert.throws(() => validateQuestions([question({ options: [{ text: "A" }, { text: "B" }] })]), /Question 1/);
  assert.throws(() => validateQuestions([question({ kind: "true_false", options: [{ text: "A", correct: true }, { text: "B" }, { text: "C" }] })]));
  assert.ok(validateQuestions([question({ kind: "multiple", options: [{ text: "A", correct: true }, { text: "B", correct: true }] })]));
  assert.throws(() => validateQuestions([]), BlockError);
});

test("la vue apprenant cache les réponses", () => {
  const data = validateBlock("quiz", { questions: [question({ explanation: "Parce que." })] });
  const visible = publicView("quiz", data);
  assert.equal(visible.questions[0].explanation, undefined);
  assert.equal(visible.questions[0].options[0].correct, undefined);
  assert.equal(data.questions[0].options[0].correct, true, "l'original n'est pas modifié");
});

test("la correction compare l'ensemble des réponses", () => {
  const qs = validateQuestions([
    question(),
    question({ kind: "multiple", options: [{ text: "A", correct: true }, { text: "B", correct: true }, { text: "C" }] }),
  ]);
  const results = grade(qs, [[0], [0]]);
  assert.deepEqual(results.map((r) => r.correct), [true, false]);
  assert.equal(scorePercent(results), 50);
  assert.equal(scorePercent(grade(qs, [])), 0);
});

test("une leçon est découpée en texte et encadrés", () => {
  const blocks = lessonBlocks(
    "cours-test",
    "Intro\n\n![Schéma](images/s.svg)\n\n::: a-retenir\nPoint clé.\n:::\n\n::: a-vous Votre essai\nFaites-le.\n:::\n",
  );
  assert.deepEqual(blocks.map((b) => b.type), ["text", "callout", "callout"]);
  assert.match(blocks[0].data.markdown, /\/media\/cours\/cours-test\/images\/s\.svg/);
  assert.deepEqual(blocks[1].data, { variant: "tip", title: "À retenir", markdown: "Point clé." });
  assert.equal(blocks[2].data.title, "Votre essai");
  assert.throws(() => lessonBlocks("x", "::: a-retenir\nsans fin"), ContentError);
});
