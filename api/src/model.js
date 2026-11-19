// Mise en forme des lignes de la base pour les réponses de l'API.

import { publicView } from "./blocks.js";

const parse = (text, fallback) => {
  if (text === null || text === undefined) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

export function courseSummary(c) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    audience: c.audience,
    parcours: c.parcours,
    level: c.level,
    format: c.format,
    duration_minutes: c.duration_minutes,
    cover_image: c.cover_image ?? null,
    position: c.position,
    status: c.status,
    source: c.source,
    published_at: c.published_at ?? null,
  };
}

export const courseExam = (c) => parse(c.exam, {}) || {};

function lessonOutline(l) {
  return {
    id: l.id,
    title: l.title,
    objective: l.objective,
    duration_minutes: l.duration_minutes,
    position: l.position,
    is_preview: Boolean(l.is_preview),
  };
}

export function blockOut(b, learner = false) {
  const data = parse(b.data, {});
  return { id: b.id, type: b.type, position: b.position, data: learner ? publicView(b.type, data) : data };
}

/** Modules et leçons d'un cours, dans l'ordre. Avec `blocks`, les blocs complets. */
export async function courseTree(db, courseId, { blocks = false } = {}) {
  const modules = await db.all(`SELECT * FROM modules WHERE course_id = ? ORDER BY position, rowid`, courseId);
  const lessons = await db.all(
    `SELECT l.* FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY l.position, l.rowid`,
    courseId,
  );
  let blocksByLesson = new Map();
  if (blocks) {
    const rows = await db.all(
      `SELECT b.* FROM blocks b JOIN lessons l ON l.id = b.lesson_id JOIN modules m ON m.id = l.module_id
       WHERE m.course_id = ? ORDER BY b.position, b.rowid`,
      courseId,
    );
    for (const b of rows) {
      if (!blocksByLesson.has(b.lesson_id)) blocksByLesson.set(b.lesson_id, []);
      blocksByLesson.get(b.lesson_id).push(blockOut(b));
    }
  }
  return modules.map((m) => ({
    id: m.id,
    title: m.title,
    position: m.position,
    lessons: lessons
      .filter((l) => l.module_id === m.id)
      .map((l) => (blocks ? { ...lessonOutline(l), blocks: blocksByLesson.get(l.id) || [] } : lessonOutline(l))),
  }));
}

export async function courseDetail(db, c) {
  return {
    ...courseSummary(c),
    description: c.description,
    objectives: parse(c.objectives, []),
    skills: parse(c.skills, []),
    prerequisites: c.prerequisites,
    trainer: c.trainer,
    exam_pass_score: c.exam_pass_score,
    exam_question_count: (courseExam(c).questions || []).length,
    modules: await courseTree(db, c.id),
  };
}

export async function courseFull(db, c) {
  return {
    ...courseSummary(c),
    description: c.description,
    objectives: parse(c.objectives, []),
    skills: parse(c.skills, []),
    prerequisites: c.prerequisites,
    trainer: c.trainer,
    exam: courseExam(c),
    exam_pass_score: c.exam_pass_score,
    exam_distinction_score: c.exam_distinction_score,
    is_template: Boolean(c.is_template),
    created_at: c.created_at,
    modules: await courseTree(db, c.id, { blocks: true }),
  };
}

export async function lessonFull(db, l, learner = false) {
  const rows = await db.all(`SELECT * FROM blocks WHERE lesson_id = ? ORDER BY position, rowid`, l.id);
  return { ...lessonOutline(l), blocks: rows.map((b) => blockOut(b, learner)) };
}

export function certificateOut(cert, course) {
  return {
    number: cert.number,
    full_name: cert.full_name,
    course_slug: course.slug,
    course_title: course.title,
    level: course.level,
    duration_minutes: course.duration_minutes,
    skills: parse(course.skills, []),
    score: cert.score,
    distinction: Boolean(cert.distinction),
    issued_at: cert.issued_at,
    signatory_name: "Elnovic NTEDIKA",
    signatory_title: "COO, Intellia Kin",
  };
}

export function slugify(text) {
  const ascii = String(text).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "");
  const s = ascii.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return s.slice(0, 100).replace(/-+$/g, "") || "cours";
}
