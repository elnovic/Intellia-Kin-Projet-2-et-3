import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { slugify } from "../src/model.js";
import { buildBundle, copyContent, FIXTURE, LEARNER, MAX_D1_CALLS, setup } from "./helpers.mjs";

const EMPTY = { hash: "vide", courses: [], media: {} };
const QUIZ = {
  questions: [
    {
      prompt: "Que signifie IA ?",
      kind: "single",
      options: [{ text: "Intelligence artificielle", correct: true }, { text: "Internet avancé" }],
      explanation: "IA est l'abréviation d'intelligence artificielle.",
    },
  ],
};
const EXAM = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    prompt: `Question ${i + 1}`,
    options: [{ text: "Bonne", correct: true }, { text: "Mauvaise" }],
  })),
};
const answers = (correct, total = 10) => ({
  answers: [...Array(correct).fill([0]), ...Array(total - correct).fill([1])],
});
const future = (days) => new Date(Date.now() + days * 86400_000).toISOString();

async function console_(t) {
  const admin = await t.admin();
  const course = async (overrides = {}) => {
    const r = await t.call("POST", "/admin/courses", {
      token: admin,
      body: { title: "Découvrir l'IA en 3 jours", audience: "jeune_diplome", ...overrides },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const lesson = async (courseId, title = "Leçon 1", isPreview = false) => {
    const m = await t.call("POST", `/admin/courses/${courseId}/modules`, { token: admin, body: { title: "Module 1" } });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    const l = await t.call("POST", `/admin/modules/${m.body.id}/lessons`, { token: admin, body: { title, is_preview: isPreview } });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    return [m.body, l.body];
  };
  const block = async (lessonId, type, data) => {
    const r = await t.call("POST", `/admin/lessons/${lessonId}/blocks`, { token: admin, body: { type, data } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const published = async (overrides = {}) => {
    const c = await course(overrides);
    const [, l] = await lesson(c.id);
    const p = await t.call("POST", `/admin/courses/${c.id}/publish`, { token: admin });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    return [p.body, l];
  };
  return { admin, course, lesson, block, published };
}

// --- Comptes ---------------------------------------------------------------------

describe("comptes", () => {
  test("santé de l'API", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("GET", "/health");
    assert.deepEqual([r.status, r.body], [200, { status: "ok" }]);
  });

  test("inscription, connexion et profil", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("POST", "/auth/register", { body: LEARNER });
    assert.equal(r.status, 201);
    assert.equal(r.body.email, LEARNER.email);
    assert.equal(r.body.role, "learner");
    assert.equal(r.body.password_hash, undefined);
    const token = await t.login(LEARNER.email, LEARNER.password);
    const me = await t.call("GET", "/auth/me", { token });
    assert.equal(me.body.full_name, "Apprenant Test");
    assert.equal(me.body.audience, "jeune_diplome");
  });

  test("l'adresse e-mail ne tient pas compte des majuscules", async () => {
    const t = await setup({ bundle: EMPTY });
    await t.call("POST", "/auth/register", { body: { ...LEARNER, email: "Grace@Example.com" } });
    assert.equal((await t.call("POST", "/auth/register", { body: { ...LEARNER, email: "grace@example.com" } })).status, 409);
    assert.ok(await t.login("GRACE@example.com", LEARNER.password));
  });

  test("le téléphone est unique et au format international", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("POST", "/auth/register", { body: { ...LEARNER, phone: "0812345678" } })).status, 422);
    assert.equal((await t.call("POST", "/auth/register", { body: { ...LEARNER, phone: "+243812345678" } })).status, 201);
    const again = await t.call("POST", "/auth/register", { body: { ...LEARNER, email: "b@example.com", phone: "+243812345678" } });
    assert.equal(again.status, 409);
  });

  test("un mot de passe trop court est refusé avec un message clair", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("POST", "/auth/register", { body: { ...LEARNER, password: "court" } });
    assert.equal(r.status, 422);
    assert.match(r.body.detail.message, /password : au moins 8 caractères/);
  });

  test("mauvais mot de passe et compte inconnu reçoivent la même réponse", async () => {
    const t = await setup({ bundle: EMPTY });
    await t.learner();
    const wrong = await t.call("POST", "/auth/login", { body: { email: LEARNER.email, password: "faux-mot-de-passe" } });
    const unknown = await t.call("POST", "/auth/login", { body: { email: "x@example.com", password: "faux-mot-de-passe" } });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });

  test("le profil exige un jeton valide", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("GET", "/auth/me")).status, 401);
    assert.equal((await t.call("GET", "/auth/me", { token: "abc.def.ghi" })).status, 401);
    const other = await setup({ bundle: EMPTY, env: { SECRET_KEY: "autre-cle" } });
    const foreign = await other.learner();
    assert.equal((await t.call("GET", "/auth/me", { token: foreign })).status, 401);
  });

  test("l'administrateur est créé au démarrage, puis mis à jour si son mot de passe change", async () => {
    const t = await setup({ bundle: EMPTY });
    const token = await t.admin();
    assert.equal((await t.call("GET", "/auth/me", { token })).body.role, "admin");
    t.env.ADMIN_PASSWORD = "nouveau-mot-de-passe";
    t.app.reset();
    await t.call("GET", "/health");
    assert.ok(await t.login("admin@intelliakin.com", "nouveau-mot-de-passe"));
  });
});

// --- Centre de contrôle : cours --------------------------------------------------

describe("centre de contrôle : cours", () => {
  test("slugify", () => {
    assert.equal(slugify("Découvrir l'IA en 3 jours"), "decouvrir-l-ia-en-3-jours");
    assert.equal(slugify("  Paie & fiscalité !  "), "paie-fiscalite");
    assert.equal(slugify("???"), "cours");
  });

  test("réservé aux administrateurs", async () => {
    const t = await setup({ bundle: EMPTY });
    const learner = await t.learner();
    assert.equal((await t.call("GET", "/admin/courses")).status, 401);
    assert.equal((await t.call("GET", "/admin/courses", { token: learner })).status, 403);
    assert.equal((await t.call("POST", "/admin/courses", { token: learner, body: { title: "Cours pirate" } })).status, 403);
  });

  test("types de blocs listés pour l'éditeur", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("GET", "/admin/block-types", { token: await t.admin() });
    const types = new Set(r.body.map((e) => e.type));
    for (const type of ["text", "video", "quiz", "exam", "live_session"]) assert.ok(types.has(type));
  });

  test("adresse générée et unique", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const first = await c.course();
    const second = await c.course();
    assert.equal(first.slug, "decouvrir-l-ia-en-3-jours");
    assert.equal(second.slug, "decouvrir-l-ia-en-3-jours-2");
    const taken = await t.call("POST", "/admin/courses", { token: c.admin, body: { title: "Autre cours", slug: first.slug } });
    assert.equal(taken.status, 409);
  });

  test("un cours a besoin d'une leçon pour être publié", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    assert.equal((await t.call("POST", `/admin/courses/${course.id}/publish`, { token: c.admin })).status, 409);
    await c.lesson(course.id);
    const ready = await t.call("POST", `/admin/courses/${course.id}/publish`, { token: c.admin });
    assert.equal(ready.body.status, "published");
    assert.ok(ready.body.published_at);
  });

  test("modification d'un cours", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    const r = await t.call("PATCH", `/admin/courses/${course.id}`, {
      token: c.admin,
      body: { title: "Nouveau titre", objectives: ["Un", "Deux"], is_template: false, cover_image: null, level: null },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.title, "Nouveau titre");
    assert.deepEqual(r.body.objectives, ["Un", "Deux"]);
    assert.equal(r.body.level, "debutant", "un champ obligatoire à null est ignoré");
  });

  test("les brouillons sont cachés du catalogue", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const draft = await c.course({ title: "Brouillon secret" });
    const [published] = await c.published({ title: "Cours ouvert" });
    const catalogue = await t.call("GET", "/courses");
    assert.deepEqual(catalogue.body.map((x) => x.slug), [published.slug]);
    assert.equal((await t.call("GET", `/courses/${draft.slug}`)).status, 404);
    const detail = await t.call("GET", `/courses/${published.slug}`);
    const lesson = detail.body.modules[0].lessons[0];
    assert.equal(lesson.title, "Leçon 1");
    assert.equal(lesson.blocks, undefined);
  });

  test("filtres du catalogue", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    await c.published({ title: "Pour les jeunes", audience: "jeune_diplome", parcours: "carriere" });
    await c.published({ title: "Pour les PME", audience: "pme", parcours: "organisations" });
    await c.published({ title: "Pour tous", audience: "tous" });
    const titles = async (q) => new Set((await t.call("GET", `/courses${q}`)).body.map((x) => x.title));
    assert.deepEqual(await titles("?audience=pme"), new Set(["Pour les PME", "Pour tous"]));
    assert.deepEqual(await titles("?audience=jeune_diplome"), new Set(["Pour les jeunes", "Pour tous"]));
    assert.deepEqual(await titles("?parcours=carriere"), new Set(["Pour les jeunes"]));
    assert.equal((await t.call("GET", "/courses?audience=inconnu")).status, 422);
  });

  test("bloc invalide refusé avec le détail", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    const [, lesson] = await c.lesson(course.id);
    const unknown = await t.call("POST", `/admin/lessons/${lesson.id}/blocks`, { token: c.admin, body: { type: "hologramme", data: {} } });
    assert.equal(unknown.status, 422);
    const invalid = await t.call("POST", `/admin/lessons/${lesson.id}/blocks`, {
      token: c.admin,
      body: { type: "video", data: { url: "http://exemple.cd/video" } },
    });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.detail.erreurs.length);
  });

  test("blocs modifiés, réordonnés et supprimés", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    const [, lesson] = await c.lesson(course.id);
    const text = await c.block(lesson.id, "text", { markdown: "Un" });
    const video = await c.block(lesson.id, "video", { url: "https://exemple.cd/v" });
    const quiz = await c.block(lesson.id, "quiz", QUIZ);
    assert.deepEqual([text.position, video.position, quiz.position], [1, 2, 3]);
    const edited = await t.call("PUT", `/admin/blocks/${text.id}`, { token: c.admin, body: { data: { markdown: "Deux" } } });
    assert.deepEqual(edited.body.data, { markdown: "Deux" });
    const reordered = await t.call("POST", `/admin/lessons/${lesson.id}/blocks/reorder`, {
      token: c.admin,
      body: { ids: [quiz.id, text.id, video.id] },
    });
    assert.equal(reordered.status, 200, JSON.stringify(reordered.body));
    assert.deepEqual(reordered.body.blocks.map((b) => b.type), ["quiz", "text", "video"]);
    const incomplete = await t.call("POST", `/admin/lessons/${lesson.id}/blocks/reorder`, {
      token: c.admin,
      body: { ids: [quiz.id, text.id] },
    });
    assert.equal(incomplete.status, 422);
    assert.equal((await t.call("DELETE", `/admin/blocks/${video.id}`, { token: c.admin })).status, 204);
    const remaining = await t.call("GET", `/admin/lessons/${lesson.id}`, { token: c.admin });
    assert.deepEqual(remaining.body.blocks.map((b) => b.type), ["quiz", "text"]);
    assert.equal(remaining.body.course_id, course.id);
    assert.equal(remaining.body.course_source, "console");
  });

  test("accès aux leçons, inscription et progression", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const learner = await t.learner();
    const course = await c.course();
    const [module, first] = await c.lesson(course.id, "Aperçu", true);
    const second = (await t.call("POST", `/admin/modules/${module.id}/lessons`, { token: c.admin, body: { title: "Suite" } })).body;
    await c.block(second.id, "quiz", QUIZ);
    await t.call("POST", `/admin/courses/${course.id}/publish`, { token: c.admin });
    const slug = course.slug;
    const url = (l) => `/courses/${slug}/lessons/${l.id}`;

    assert.equal((await t.call("GET", url(first))).status, 401);
    assert.equal((await t.call("GET", url(first), { token: learner })).status, 200);
    assert.equal((await t.call("GET", url(second))).status, 401);
    assert.equal((await t.call("GET", url(second), { token: learner })).status, 403);

    assert.equal((await t.call("POST", `/courses/${slug}/enroll`, { token: learner })).status, 201);
    assert.equal((await t.call("POST", `/courses/${slug}/enroll`, { token: learner })).status, 409);

    const lesson = await t.call("GET", url(second), { token: learner });
    const question = lesson.body.blocks[0].data.questions[0];
    assert.equal(question.explanation, undefined);
    assert.ok(question.options.every((o) => !("correct" in o)));

    const inConsole = await t.call("GET", `/admin/lessons/${second.id}`, { token: c.admin });
    assert.equal(inConsole.body.blocks[0].data.questions[0].options[0].correct, true);

    const half = await t.call("POST", `${url(first)}/complete`, { token: learner });
    assert.deepEqual([half.body.completed_lessons, half.body.total_lessons, half.body.percent], [1, 2, 50]);
    assert.deepEqual(half.body.completed_lesson_ids, [first.id]);
    assert.equal((await t.call("POST", `${url(first)}/complete`, { token: learner })).body.completed_lessons, 1);
    assert.equal((await t.call("POST", `${url(second)}/complete`, { token: learner })).body.percent, 100);
    assert.equal((await t.call("GET", `/courses/${slug}/progress`, { token: learner })).body.percent, 100);
    assert.equal((await t.call("GET", `/courses/${slug}/lessons/pas-un-id`, { token: learner })).status, 404);
  });

  test("modules et leçons réordonnés et supprimés", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    const [first, lesson] = await c.lesson(course.id);
    const second = (await t.call("POST", `/admin/courses/${course.id}/modules`, { token: c.admin, body: { title: "Module 2" } })).body;
    assert.deepEqual([first.position, second.position], [1, 2]);
    const swapped = await t.call("POST", `/admin/courses/${course.id}/modules/reorder`, {
      token: c.admin,
      body: { ids: [second.id, first.id] },
    });
    assert.deepEqual(swapped.body.modules.map((m) => m.title), ["Module 2", "Module 1"]);
    assert.equal((await t.call("DELETE", `/admin/lessons/${lesson.id}`, { token: c.admin })).status, 204);
    assert.equal((await t.call("GET", `/admin/lessons/${lesson.id}`, { token: c.admin })).status, 404);
    assert.equal((await t.call("DELETE", `/admin/modules/${first.id}`, { token: c.admin })).status, 204);
    const tree = await t.call("GET", `/admin/courses/${course.id}`, { token: c.admin });
    assert.deepEqual(tree.body.modules.map((m) => m.title), ["Module 2"]);
  });

  test("un cours se supprime tant que personne n'y est inscrit", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const learner = await t.learner();
    const [course] = await c.published({ title: "Cours éphémère" });
    const [other] = await c.published({ title: "Cours suivi" });
    await t.call("POST", `/courses/${other.slug}/enroll`, { token: learner });
    assert.equal((await t.call("DELETE", `/admin/courses/${other.id}`, { token: c.admin })).status, 409);
    assert.equal((await t.call("DELETE", `/admin/courses/${course.id}`, { token: c.admin })).status, 204);
    assert.equal((await t.call("GET", `/admin/courses/${course.id}`, { token: c.admin })).status, 404);
    const archived = await t.call("POST", `/admin/courses/${other.id}/archive`, { token: c.admin });
    assert.equal(archived.body.status, "archived");
  });
});

// --- Parcours complet ---------------------------------------------------------------

async function readyCourse(t) {
  const c = await console_(t);
  const course = await c.course({ title: "Cours avec examen" });
  const [, lesson] = await c.lesson(course.id);
  const quiz = await c.block(lesson.id, "quiz", QUIZ);
  assert.equal((await t.call("PUT", `/admin/courses/${course.id}/exam`, { token: c.admin, body: EXAM })).status, 200);
  assert.equal((await t.call("POST", `/admin/courses/${course.id}/publish`, { token: c.admin })).status, 200);
  return { c, course, lesson, quiz };
}

describe("examen et attestation", () => {
  test("un examen invalide est refusé", async () => {
    const t = await setup({ bundle: EMPTY });
    const c = await console_(t);
    const course = await c.course();
    const bad = { questions: [{ prompt: "?", options: [{ text: "a" }, { text: "b" }] }] };
    assert.equal((await t.call("PUT", `/admin/courses/${course.id}/exam`, { token: c.admin, body: bad })).status, 422);
  });

  test("le quiz de leçon donne la correction", async () => {
    const t = await setup({ bundle: EMPTY });
    const { course, lesson, quiz } = await readyCourse(t);
    const learner = await t.learner();
    await t.call("POST", `/courses/${course.slug}/enroll`, { token: learner });
    const r = await t.call("POST", `/courses/${course.slug}/lessons/${lesson.id}/blocks/${quiz.id}/check`, {
      token: learner,
      body: { answers: [[1]] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.score, 0);
    assert.equal(r.body.results[0].correct, false);
    assert.deepEqual(r.body.results[0].correct_options, [0]);
    assert.ok(r.body.results[0].explanation);
  });

  test("parcours complet jusqu'à l'attestation", async () => {
    const t = await setup({ bundle: EMPTY });
    const { c, course, lesson } = await readyCourse(t);
    const learner = await t.learner();
    const slug = course.slug;
    await t.call("POST", `/courses/${slug}/enroll`, { token: learner });

    assert.equal((await t.call("GET", `/courses/${slug}/exam`, { token: learner })).status, 409);
    await t.call("POST", `/courses/${slug}/lessons/${lesson.id}/complete`, { token: learner });

    const exam = await t.call("GET", `/courses/${slug}/exam`, { token: learner });
    assert.equal(exam.status, 200);
    assert.equal(exam.body.attempts_left, 3);
    assert.ok(exam.body.questions.every((q) => q.options.every((o) => !("correct" in o))));

    const early = await t.call("POST", `/courses/${slug}/certificate`, { token: learner, body: { full_name: "Grâce Mbuyi" } });
    assert.equal(early.status, 409);

    const failed = await t.call("POST", `/courses/${slug}/exam`, { token: learner, body: answers(6) });
    assert.equal(failed.body.passed, false);
    assert.equal(failed.body.score, 60);
    assert.equal(failed.body.results[0].correct_options, undefined);

    const passed = await t.call("POST", `/courses/${slug}/exam`, { token: learner, body: answers(10) });
    assert.deepEqual({ ...passed.body, results: null }, { score: 100, passed: true, distinction: true, results: null, attempts_left: 1 });

    const cert = await t.call("POST", `/courses/${slug}/certificate`, { token: learner, body: { full_name: "  Grâce   Mbuyi " } });
    assert.equal(cert.status, 200, JSON.stringify(cert.body));
    assert.equal(cert.body.full_name, "Grâce Mbuyi");
    assert.match(cert.body.number, /^IK-\d{4}-000001$/);
    assert.equal(cert.body.distinction, true);
    assert.equal(cert.body.signatory_name, "Elnovic NTEDIKA");

    const again = await t.call("POST", `/courses/${slug}/certificate`, { token: learner, body: { full_name: "Autre Nom" } });
    assert.equal(again.body.full_name, "Grâce Mbuyi");

    const pub = await t.call("GET", `/certificates/${cert.body.number.toLowerCase()}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.course_title, "Cours avec examen");
    assert.ok([404, 405].includes((await t.call("PATCH", `/admin/certificates/${cert.body.number}`, { token: c.admin, body: { full_name: "X" } })).status));

    const mine = await t.call("GET", "/me/certificates", { token: learner });
    assert.deepEqual(mine.body.map((x) => x.number), [cert.body.number]);
    const myCourses = await t.call("GET", "/me/courses", { token: learner });
    assert.equal(myCourses.body[0].progress.certificate_number, cert.body.number);
    assert.deepEqual((await t.call("GET", "/me/stats", { token: learner })).body, { courses: 1, certificates: 1 });

    const stats = await t.call("GET", "/admin/stats", { token: c.admin });
    assert.equal(stats.body.certificates, 1);
    assert.equal(stats.body.courses[0].certificates, 1);

    // Un deuxième apprenant reçoit le numéro suivant.
    const other = await t.learner({ email: "b@example.com" });
    await t.call("POST", `/courses/${slug}/enroll`, { token: other });
    await t.call("POST", `/courses/${slug}/lessons/${lesson.id}/complete`, { token: other });
    await t.call("POST", `/courses/${slug}/exam`, { token: other, body: answers(8) });
    const second = await t.call("POST", `/courses/${slug}/certificate`, { token: other, body: { full_name: "Moussa Diallo" } });
    assert.match(second.body.number, /000002$/);
    assert.equal(second.body.distinction, false);
  });

  test("trois tentatives par jour", async () => {
    const t = await setup({ bundle: EMPTY });
    const { course, lesson } = await readyCourse(t);
    const learner = await t.learner();
    const slug = course.slug;
    await t.call("POST", `/courses/${slug}/enroll`, { token: learner });
    await t.call("POST", `/courses/${slug}/lessons/${lesson.id}/complete`, { token: learner });
    for (let i = 0; i < 3; i++) {
      assert.equal((await t.call("POST", `/courses/${slug}/exam`, { token: learner, body: answers(2) })).status, 200);
    }
    const blocked = await t.call("POST", `/courses/${slug}/exam`, { token: learner, body: answers(10) });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.detail, /nouvel essai possible après \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}/);
    assert.ok((await t.call("GET", `/courses/${slug}/exam`, { token: learner })).body.retry_at);
  });

  test("attestation inconnue", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("GET", "/certificates/IK-2026-999999")).status, 404);
  });
});

// --- Annonces ----------------------------------------------------------------------

const EVENT = {
  kind: "evenement",
  title: "Webinaire : l'IA pour les PME",
  summary: "Une heure pour découvrir trois usages concrets de l'IA en entreprise.",
  body: "Programme détaillé...",
  registration_mode: "internal",
  capacity: 2,
};

describe("annonces", () => {
  async function create(t, admin, overrides = {}) {
    const r = await t.call("POST", "/admin/announcements", { token: admin, body: { ...EVENT, starts_at: future(7), ...overrides } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  }

  test("un événement a besoin d'une date", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("POST", "/admin/announcements", { token: await t.admin(), body: EVENT });
    assert.equal(r.status, 422);
    assert.match(r.body.detail.message, /date de début/);
  });

  test("réservé aux administrateurs", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("GET", "/admin/announcements", { token: await t.learner() })).status, 403);
  });

  test("publication, inscriptions et export", async () => {
    const t = await setup({ bundle: EMPTY });
    const admin = await t.admin();
    const event = await create(t, admin);
    assert.equal(event.slug, "webinaire-l-ia-pour-les-pme");
    assert.deepEqual((await t.call("GET", "/announcements")).body, []);
    assert.equal((await t.call("GET", `/announcements/${event.slug}`)).status, 404);

    await t.call("POST", `/admin/announcements/${event.id}/publish`, { token: admin });
    const listed = (await t.call("GET", "/announcements?kind=evenement&when=upcoming")).body;
    assert.deepEqual(listed.map((a) => a.slug), [event.slug]);
    assert.equal(listed[0].registration_open, true);

    const person = { full_name: "Moïse Kabasele", email: "moise@example.com", phone: "+243810000000" };
    const first = await t.call("POST", `/announcements/${event.slug}/register`, { body: person });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.registered_count, 1);
    assert.equal((await t.call("POST", `/announcements/${event.slug}/register`, { body: person })).status, 409);
    const second = await t.call("POST", `/announcements/${event.slug}/register`, { body: { full_name: "Aïcha Diallo", email: "aicha@example.com" } });
    assert.equal(second.body.registration_open, false);
    const full = await t.call("POST", `/announcements/${event.slug}/register`, { body: { full_name: "Tiers", email: "tiers@example.com" } });
    assert.equal(full.status, 409);

    const csv = await t.call("GET", `/admin/announcements/${event.id}/registrations.csv`, { token: admin });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("Content-Type"), /text\/csv/);
    assert.ok(csv.body.includes("Moïse Kabasele") && csv.body.includes("aicha@example.com"));
    const list = await t.call("GET", `/admin/announcements/${event.id}/registrations`, { token: admin });
    assert.equal(list.body.length, 2);
  });

  test("expirées et épinglées", async () => {
    const t = await setup({ bundle: EMPTY });
    const admin = await t.admin();
    const news = await create(t, admin, {
      kind: "actualite",
      title: "Nouveau cours en ligne",
      summary: "Le cours Introduction à l'IA est disponible gratuitement.",
      registration_mode: "internal",
    });
    assert.equal(news.registration_mode, "none");
    const old = await create(t, admin, { title: "Ancienne annonce", expires_at: future(-1) });
    const pinned = await create(t, admin, { title: "Annonce épinglée", pinned: true });
    for (const a of [news, old, pinned]) await t.call("POST", `/admin/announcements/${a.id}/publish`, { token: admin });
    const slugs = (await t.call("GET", "/announcements")).body.map((a) => a.slug);
    assert.equal(slugs[0], pinned.slug);
    assert.ok(!slugs.includes(old.slug) && slugs.includes(news.slug));
  });

  test("modification et suppression", async () => {
    const t = await setup({ bundle: EMPTY });
    const admin = await t.admin();
    const event = await create(t, admin);
    const updated = await t.call("PUT", `/admin/announcements/${event.id}`, {
      token: admin,
      body: { ...EVENT, slug: "webinaire-pme", starts_at: future(3), title: "Webinaire modifié" },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.slug, "webinaire-pme");
    assert.equal(updated.body.title, "Webinaire modifié");
    assert.equal((await t.call("DELETE", `/admin/announcements/${event.id}`, { token: admin })).status, 204);
    assert.equal((await t.call("GET", "/admin/announcements", { token: admin })).body.length, 0);
  });
});

// --- Outils IA -------------------------------------------------------------------------

function fakeGroq(behaviour = () => ({ status: 200, text: "## Résultat\nTexte généré." })) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const { status, text } = behaviour(body.model, calls.length);
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status });
  };
  return { fetch, calls };
}

const CV = { nom_complet: "Grâce Mbuyi", poste_vise: "Assistante comptable", formation: "Licence en gestion", competences: "Excel" };

describe("outils IA", () => {
  test("les outils sont listés avec leur formulaire", async () => {
    const t = await setup({ bundle: EMPTY });
    const r = await t.call("GET", "/tools");
    assert.equal(r.body.length, 6);
    const cv = r.body.find((x) => x.slug === "cv-lettre");
    assert.deepEqual(cv.fields.properties.document.enum, ["cv", "lettre", "les_deux"]);
    assert.ok(cv.fields.required.includes("nom_complet"));
    assert.equal(cv.fields.properties.annonce.maxLength, 3000);
  });

  test("un compte est nécessaire", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("POST", "/tools/cv-lettre", { body: CV })).status, 401);
    assert.equal((await t.call("GET", "/tools/quota")).status, 401);
  });

  test("formulaire invalide refusé", async () => {
    const groq = fakeGroq();
    const t = await setup({ bundle: EMPTY, env: { GROQ_API_KEY: "gsk_test" }, fetch: groq.fetch });
    const token = await t.learner();
    const r = await t.call("POST", "/tools/cv-lettre", { token, body: { nom_complet: "G" } });
    assert.equal(r.status, 422);
    assert.ok(r.body.detail.erreurs.some((e) => e.champ === "poste_vise"));
    assert.equal(groq.calls.length, 0);
  });

  test("limite quotidienne et contenu envoyé au modèle", async () => {
    const groq = fakeGroq();
    const t = await setup({ bundle: EMPTY, env: { GROQ_API_KEY: "gsk_test" }, fetch: groq.fetch });
    const token = await t.learner();
    // Les champs facultatifs vides arrivent en texte vide depuis le formulaire.
    for (let i = 0; i < 3; i++) {
      const r = await t.call("POST", "/tools/cv-lettre", { token, body: { ...CV, annonce: "", document: "cv" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.remaining_today, 2 - i);
    }
    assert.equal((await t.call("POST", "/tools/cv-lettre", { token, body: CV })).status, 429);
    const quota = await t.call("GET", "/tools/quota", { token });
    assert.deepEqual(quota.body, { daily_limit: 3, used_today: 3, remaining_today: 0, available: true });
    const sent = groq.calls[0].body;
    assert.equal(sent.model, "openai/gpt-oss-120b");
    assert.equal(sent.reasoning_effort, "low");
    assert.match(sent.messages[0].content, /Ne rédige jamais|Tu es un recruteur/);
    assert.match(sent.messages[1].content, /^Rédige le CV\.\n<donnees>\n\{/);
    assert.match(sent.messages[1].content, /"nom_complet": "Grâce Mbuyi"/);
  });

  test("un modèle indisponible n'est pas décompté, et le second prend le relais", async () => {
    const down = fakeGroq(() => ({ status: 503, text: "" }));
    const t = await setup({ bundle: EMPTY, env: { GROQ_API_KEY: "gsk_test" }, fetch: down.fetch });
    const token = await t.learner();
    assert.equal((await t.call("POST", "/tools/cv-lettre", { token, body: CV })).status, 503);
    assert.equal(down.calls.length, 2);
    assert.equal((await t.call("GET", "/tools/quota", { token })).body.used_today, 0);

    const fallback = fakeGroq((model) => (model.endsWith("120b") ? { status: 429, text: "" } : { status: 200, text: "Réponse" }));
    const t2 = await setup({ bundle: EMPTY, env: { GROQ_API_KEY: "gsk_test" }, fetch: fallback.fetch });
    const r = await t2.call("POST", "/tools/assistant-redaction", {
      token: await t2.learner(),
      body: { destinataire: "Client", objet: "Relance", points_cles: "Facture impayée" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.markdown, "Réponse");
  });

  test("sans clé, l'outil est indiqué indisponible", async () => {
    const t = await setup({ bundle: EMPTY });
    const token = await t.learner();
    assert.equal((await t.call("GET", "/tools/quota", { token })).body.available, false);
    assert.equal((await t.call("POST", "/tools/cv-lettre", { token, body: CV })).status, 503);
  });
});

// --- Cours du dépôt ----------------------------------------------------------------------

describe("cours rédigés dans le dépôt", () => {
  test("import idempotent qui conserve la progression", async () => {
    const dir = copyContent();
    const t = await setup({ bundle: await buildBundle(dir) });
    const learner = await t.learner();
    const detail = (await t.call("GET", "/courses/cours-test")).body;
    assert.equal(detail.exam_question_count, 1);
    assert.equal(detail.source, "depot");
    assert.equal(detail.cover_image, "/media/cours/cours-test/images/couverture.svg");
    const lessons = detail.modules[0].lessons;
    assert.deepEqual(lessons.map((l) => l.title), ["Leçon 1", "Leçon 2"]);
    const preview = await t.call("GET", `/courses/cours-test/lessons/${lessons[0].id}`, { token: learner });
    assert.deepEqual(preview.body.blocks.map((b) => b.type), ["text", "callout", "callout", "quiz"]);

    await t.call("POST", "/courses/cours-test/enroll", { token: learner });
    await t.call("POST", `/courses/cours-test/lessons/${lessons[0].id}/complete`, { token: learner });

    // Une nouvelle instance avec le même contenu ne réimporte rien.
    const queries = t.d1.queries;
    t.app.reset();
    await t.call("GET", "/health");
    assert.ok(t.d1.queries - queries <= 4, "rien n'est réimporté");

    // Modification : la leçon 1 change de titre et garde son identifiant ; la 2 change de module.
    const specPath = join(dir, "cours", "cours-test", "cours.json");
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    spec.modules[0].lessons[0].title = "Leçon 1 revue";
    spec.modules.push({ title: "Module 2", lessons: [spec.modules[0].lessons.pop()] });
    writeFileSync(specPath, JSON.stringify(spec));
    const app2 = await setup({ bundle: await buildBundle(dir) });
    // Même base : on remplace l'application en gardant la base D1.
    app2.env.DB = t.d1;
    const updated = (await app2.call("GET", "/courses/cours-test")).body;
    assert.deepEqual(updated.modules.map((m) => m.title), ["Module 1", "Module 2"]);
    assert.equal(updated.modules[0].lessons[0].title, "Leçon 1 revue");
    assert.equal(updated.modules[0].lessons[0].id, lessons[0].id);
    assert.equal(updated.modules[1].lessons[0].id, lessons[1].id);
    const progress = await app2.call("GET", "/courses/cours-test/progress", { token: learner });
    assert.equal(progress.body.completed_lessons, 1);
  });

  test("un cours cassé bloque la construction", async () => {
    const dir = copyContent();
    unlinkSync(join(dir, "cours", "cours-test", "lecons", "02.md"));
    await assert.rejects(buildBundle(dir));
  });

  test("les images sont servies sans risque", async () => {
    const t = await setup();
    const ok = await t.call("GET", "/media/cours/cours-test/images/couverture.svg");
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Content-Type"), "image/svg+xml");
    assert.match(ok.body, /<svg/);
    assert.equal((await t.call("GET", "/media/cours/cours-test/images/..%2Fcours.json")).status, 404);
    assert.equal((await t.call("GET", "/media/cours/cours-test/images/inconnue.svg")).status, 404);
  });

  test("les cours du dépôt ne se modifient pas dans le centre de contrôle", async () => {
    const t = await setup();
    const admin = await t.admin();
    const course = (await t.call("GET", "/admin/courses", { token: admin })).body.find((c) => c.slug === "cours-test");
    const full = (await t.call("GET", `/admin/courses/${course.id}`, { token: admin })).body;
    const lesson = full.modules[0].lessons[0];
    const block = lesson.blocks[0];
    const refused = [
      await t.call("PATCH", `/admin/courses/${course.id}`, { token: admin, body: { title: "Autre titre" } }),
      await t.call("POST", `/admin/courses/${course.id}/modules`, { token: admin, body: { title: "M" } }),
      await t.call("PATCH", `/admin/lessons/${lesson.id}`, { token: admin, body: { title: "L" } }),
      await t.call("PUT", `/admin/blocks/${block.id}`, { token: admin, body: { data: { markdown: "x" } } }),
      await t.call("DELETE", `/admin/courses/${course.id}`, { token: admin }),
    ];
    assert.deepEqual(refused.map((r) => r.status), [409, 409, 409, 409, 409]);
  });
});

// --- Technique ----------------------------------------------------------------------------

describe("technique", () => {
  test("CORS : seules les origines autorisées sont acceptées", async () => {
    const t = await setup({
      bundle: EMPTY,
      env: { ENVIRONMENT: "production", CORS_ORIGINS: '["https://academie.intelliakin.com"]' },
    });
    const allowed = await t.call("OPTIONS", "/courses", { headers: { Origin: "https://academie.intelliakin.com" } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://academie.intelliakin.com");
    const other = await t.call("GET", "/courses", { headers: { Origin: "https://pirate.example" } });
    assert.equal(other.headers.get("Access-Control-Allow-Origin"), null);
    const local = await t.call("GET", "/courses", { headers: { Origin: "http://localhost:8080" } });
    assert.equal(local.headers.get("Access-Control-Allow-Origin"), null, "pas de localhost en production");
  });

  test("la production exige une clé secrète", async () => {
    const t = await setup({ bundle: EMPTY, env: { ENVIRONMENT: "production", SECRET_KEY: "" } });
    assert.equal((await t.call("GET", "/health")).status, 500);
  });

  test("adresse et méthode inconnues", async () => {
    const t = await setup({ bundle: EMPTY });
    assert.equal((await t.call("GET", "/inconnue")).status, 404);
    assert.equal((await t.call("DELETE", "/courses")).status, 405);
    assert.equal((await t.call("POST", "/auth/login", { headers: { "Content-Type": "application/json" }, body: undefined })).status, 422);
  });
});

describe("les 20 cours de l'Académie", () => {
  test("s'importent en respectant les limites de l'offre gratuite", async () => {
    const bundle = await buildBundle(join(FIXTURE, "..", "..", "..", "..", "contenu"));
    assert.ok(bundle.courses.length >= 20);
    const t = await setup({ bundle });
    const before = t.d1.calls;
    assert.equal((await t.call("GET", "/health")).status, 200);
    assert.ok(t.d1.calls - before <= MAX_D1_CALLS);
    const catalogue = (await t.call("GET", "/courses")).body;
    assert.equal(catalogue.length, bundle.courses.length);
    const learner = await t.learner();
    for (const course of catalogue.slice(0, 12)) await t.call("POST", `/courses/${course.slug}/enroll`, { token: learner });
    const mine = await t.call("GET", "/me/courses", { token: learner });
    assert.equal(mine.body.length, 12);
    const detail = (await t.call("GET", `/courses/${catalogue[0].slug}`)).body;
    const lesson = await t.call("GET", `/courses/${catalogue[0].slug}/lessons/${detail.modules[0].lessons[0].id}`, { token: learner });
    assert.equal(lesson.status, 200);
    assert.ok(lesson.body.blocks.length > 2);
  });
});
