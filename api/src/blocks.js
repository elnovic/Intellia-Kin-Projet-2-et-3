// Types de blocs de contenu des leçons.
//
// Une leçon est une pile de blocs. Chaque bloc a un type et un contenu (`data`).
// Ce module définit les types acceptés, valide le contenu saisi dans le centre
// de contrôle et prépare la version envoyée aux apprenants (sans les réponses).

import { arr, bool, datetime, int, obj, oneOf, str, url, ValidationError } from "./validate.js";

export class BlockError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

const text = (o = {}) => str({ min: 1, max: 50_000, ...o });
const short = (o = {}) => str({ min: 1, max: 300, ...o });
const nullable = (rule) => rule;
const opt = (max) => str({ max, default: null });
const media = (o = {}) => url({ media: true, ...o });
const https = (o = {}) => url(o);

const option = obj({ text: short(), correct: bool({ default: false }) }, { strict: true });

export const questionRule = obj(
  {
    prompt: str({ min: 1, max: 2000 }),
    kind: oneOf(["single", "multiple", "true_false"], { default: "single" }),
    options: arr(option, { min: 2, max: 10 }),
    explanation: opt(2000),
    points: int({ min: 1, max: 100, default: 1 }),
  },
  {
    strict: true,
    check(q) {
      const correct = (q.options || []).filter((o) => o && o.correct).length;
      if (q.kind === "single" && correct !== 1) return "une question à choix unique a exactement une bonne réponse";
      if (q.kind === "multiple" && correct < 1) return "une question à choix multiple a au moins une bonne réponse";
      if (q.kind === "true_false" && (q.options.length !== 2 || correct !== 1)) {
        return "une question vrai ou faux a deux options, dont une seule correcte";
      }
      return null;
    },
  },
);

const imageItem = obj({ url: media(), alt: short(), caption: opt(300) }, { strict: true });

// type -> [libellé, famille, schéma, vérification complémentaire]
const TYPES = {
  text: ["Texte", "Lecture", { markdown: text() }],
  image: ["Image", "Lecture", { url: media(), alt: short(), caption: opt(300) }],
  gallery: ["Galerie d'images", "Lecture", { images: arr(imageItem, { min: 1, max: 30 }) }],
  callout: [
    "Encadré",
    "Lecture",
    { variant: oneOf(["info", "tip", "warning", "exercise"], { default: "info" }), title: opt(120), markdown: text() },
  ],
  table: [
    "Tableau",
    "Lecture",
    {
      headers: arr(short(), { min: 1, max: 12 }),
      rows: arr(arr(str({ max: 5000 })), { min: 1, max: 200 }),
      caption: opt(300),
    },
    (d) => {
      const width = d.headers.length;
      for (let i = 0; i < d.rows.length; i++) {
        if (d.rows[i].length !== width) return `la ligne ${i + 1} a ${d.rows[i].length} cellules, il en faut ${width}`;
      }
      return null;
    },
  ],
  code: ["Code ou prompt", "Lecture", { language: str({ max: 40, default: "text" }), code: text() }],
  video: [
    "Vidéo",
    "Média",
    {
      source: oneOf(["upload", "link"], { default: "link" }),
      url: media(),
      title: opt(300),
      duration_seconds: int({ min: 1, max: 6 * 3600, default: null }),
    },
    (d) => {
      if (d.source === "upload" && !d.url.startsWith("/media/")) return "une vidéo téléversée doit avoir une adresse en /media/";
      if (d.source === "link" && !d.url.startsWith("https://")) return "un lien vidéo doit commencer par https://";
      return null;
    },
  ],
  audio: ["Audio", "Média", { url: media(), title: opt(300) }],
  pdf: ["Document PDF", "Média", { url: media(), title: short() }],
  slides: ["Diaporama", "Média", { url: media(), title: short() }],
  file: ["Fichier à télécharger", "Média", { url: media(), filename: short(), size_bytes: int({ min: 0, default: null }) }],
  embed: ["Contenu intégré", "Média", { url: https(), title: short() }],
  quiz: [
    "Quiz",
    "Évaluation",
    { title: opt(300), questions: arr(questionRule, { min: 1, max: 100 }), pass_score: int({ min: 0, max: 100, default: null }) },
  ],
  open_question: [
    "Réponse libre",
    "Évaluation",
    { prompt: str({ min: 1, max: 2000 }), guidance: opt(2000), max_words: int({ min: 10, max: 5000, default: null }) },
  ],
  assignment: [
    "Devoir à rendre",
    "Évaluation",
    {
      title: short(),
      instructions: text(),
      due_days: int({ min: 1, max: 365, default: null }),
      accepted_formats: arr(str({ max: 20 }), { max: 10, default: () => ["pdf", "docx"] }),
    },
  ],
  exam: [
    "Examen final",
    "Évaluation",
    {
      title: short(),
      questions: arr(questionRule, { min: 1, max: 200 }),
      duration_minutes: int({ min: 1, max: 480 }),
      pass_score: int({ min: 0, max: 100 }),
      max_attempts: int({ min: 1, max: 20, default: 3 }),
    },
  ],
  tool_exercise: [
    "Exercice avec un outil IA",
    "Pratique",
    { tool_slug: str({ max: 80, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }), instructions: text() },
  ],
  case_study: [
    "Étude de cas",
    "Pratique",
    { title: short(), markdown: text(), questions: arr(str({ min: 1, max: 2000 }), { max: 30, default: () => [] }) },
  ],
  live_session: [
    "Séance en direct",
    "En direct",
    {
      title: short(),
      starts_at: datetime(),
      duration_minutes: int({ min: 5, max: 600 }),
      join_url: nullable(https({ default: null })),
      location: opt(300),
    },
    (d) => (!d.join_url && !d.location ? "indiquer un lien de visioconférence ou un lieu" : null),
  ],
};

export const BLOCK_TYPES = Object.keys(TYPES);
const GRADED = new Set(["quiz", "exam"]);

/** Valide le contenu d'un bloc et renvoie sa forme normalisée, sans le type. */
export function validateBlock(type, data) {
  const spec = TYPES[type];
  if (!spec) throw new BlockError(`Type de bloc inconnu : « ${type} ».`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BlockError("Le contenu d'un bloc doit être un objet.");
  }
  const [label, , schema, check] = spec;
  const payload = { ...data };
  delete payload.type;
  try {
    return parseStrict(schema, payload, check);
  } catch (err) {
    if (err instanceof ValidationError) throw new BlockError(`Contenu invalide pour un bloc « ${label} ».`, err.errors);
    throw err;
  }
}

function parseStrict(schema, payload, check) {
  const errors = [];
  const out = obj(schema, { strict: true, check })(payload, "", errors);
  if (errors.length) throw new ValidationError(errors);
  return out;
}

/** Version d'un bloc envoyée à un apprenant : sans bonnes réponses ni explications. */
export function publicView(type, data) {
  if (!GRADED.has(type)) return data;
  const visible = structuredClone(data);
  for (const q of visible.questions || []) {
    delete q.explanation;
    for (const o of q.options || []) delete o.correct;
  }
  return visible;
}

export function blockTypesCatalog() {
  return Object.entries(TYPES).map(([type, [label, family, schema]]) => ({
    type,
    label,
    family,
    fields: Object.keys(schema),
  }));
}

/** Valide la liste des questions d'un examen final. */
export function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new BlockError("L'examen doit contenir au moins une question.");
  }
  return questions.map((raw, i) => {
    const errors = [];
    const q = questionRule(raw, "", errors);
    if (errors.length) {
      throw new BlockError(
        `Question ${i + 1} invalide.`,
        errors.map((e) => ({ champ: `question ${i + 1}.${e.champ}`, message: e.message })),
      );
    }
    return q;
  });
}

export function publicQuestions(questions) {
  return publicView("quiz", { questions }).questions;
}

/** `answers[i]` : indices cochés pour la question i. Juste si l'ensemble est exact. */
export function grade(questions, answers) {
  return questions.map((q, i) => {
    const expected = new Set(q.options.map((o, j) => (o.correct ? j : -1)).filter((j) => j >= 0));
    const given = new Set(Array.isArray(answers[i]) ? answers[i] : []);
    const ok = expected.size === given.size && [...expected].every((j) => given.has(j));
    const max = q.points ?? 1;
    return { correct: ok, points: ok ? max : 0, max_points: max };
  });
}

export function scorePercent(results) {
  const total = results.reduce((s, r) => s + r.max_points, 0);
  const earned = results.reduce((s, r) => s + r.points, 0);
  return total ? Math.round((100 * earned) / total) : 0;
}
