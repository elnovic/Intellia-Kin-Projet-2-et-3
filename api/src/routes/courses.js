// Catalogue, leçons, progression, examen final, attestations et espace personnel.

import { currentUser, optionalUser } from "../auth.js";
import { grade, publicQuestions, scorePercent } from "../blocks.js";
import { isUniqueError, newId, now } from "../db.js";
import { conflict, HttpError, json, notFound, readJson } from "../http.js";
import { certificateOut, courseDetail, courseExam, courseSummary, lessonFull } from "../model.js";
import { arr, int, isUuid, oneOf, parseObject, str } from "../validate.js";

const MAX_ATTEMPTS = 3;
const WINDOW_MS = 24 * 3600 * 1000;
const AUDIENCES = ["jeune_diplome", "entrepreneur", "pme", "tous"];
const PARCOURS = ["tronc-commun", "carriere", "entrepreneuriat", "organisations"];

const answersSchema = { answers: arr(arr(int({ min: 0, max: 100 }), { max: 20 }), { max: 200 }) };

async function publishedCourse(db, slug) {
  const course = await db.first(`SELECT * FROM courses WHERE slug = ? AND status = 'published'`, slug);
  if (!course) throw notFound("Cours introuvable.");
  return course;
}

async function lessonOf(db, course, lessonId) {
  if (!isUuid(lessonId)) throw notFound("Leçon introuvable.");
  const lesson = await db.first(
    `SELECT l.* FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ? AND m.course_id = ?`,
    lessonId,
    course.id,
  );
  if (!lesson) throw notFound("Leçon introuvable.");
  return lesson;
}

const enrollmentOf = (db, user, course) =>
  db.first(`SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?`, user.id, course.id);

async function requiredEnrollment(db, user, course) {
  const enrollment = await enrollmentOf(db, user, course);
  if (!enrollment) throw new HttpError(403, "Inscrivez-vous à ce cours pour y accéder.");
  return enrollment;
}

/** Un compte est toujours requis. Une leçon d'aperçu se lit sans inscription au cours. */
async function checkLessonAccess(ctx, course, lesson) {
  const user = await optionalUser(ctx);
  if (!user) throw new HttpError(401, "Connectez-vous pour lire cette leçon.", { "WWW-Authenticate": "Bearer" });
  if (user.role !== "admin" && !lesson.is_preview) await requiredEnrollment(ctx.db, user, course);
  return user;
}

const attemptsOf = (db, enrollment) =>
  db.all(`SELECT * FROM exam_attempts WHERE enrollment_id = ? ORDER BY created_at`, enrollment.id);

export async function progressOf(db, course, enrollment) {
  const lessonIds = (
    await db.all(`SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?`, course.id)
  ).map((r) => r.id);
  const known = new Set(lessonIds);
  const done = (await db.all(`SELECT lesson_id FROM lesson_progress WHERE enrollment_id = ?`, enrollment.id))
    .map((r) => r.lesson_id)
    .filter((id) => known.has(id));
  const attempts = await attemptsOf(db, enrollment);
  const certificate = await db.value(
    `SELECT number FROM certificates WHERE user_id = ? AND course_id = ?`,
    enrollment.user_id,
    course.id,
  );
  const total = lessonIds.length;
  return {
    completed_lessons: done.length,
    total_lessons: total,
    percent: total ? Math.round((100 * done.length) / total) : 0,
    completed_lesson_ids: done,
    exam_passed: attempts.some((a) => a.passed),
    best_score: attempts.length ? Math.max(...attempts.map((a) => a.score)) : null,
    certificate_number: certificate,
  };
}

function attemptWindow(attempts) {
  const limit = Date.now() - WINDOW_MS;
  const recent = attempts.map((a) => Date.parse(a.created_at)).filter((t) => t > limit);
  const left = Math.max(0, MAX_ATTEMPTS - recent.length);
  const retryAt = left === 0 ? new Date(Math.min(...recent) + WINDOW_MS).toISOString() : null;
  return { left, retryAt };
}

async function examReady(db, course, user) {
  const enrollment = await requiredEnrollment(db, user, course);
  const progress = await progressOf(db, course, enrollment);
  if (!(courseExam(course).questions || []).length) throw notFound("Ce cours n'a pas d'examen final.");
  if (progress.completed_lessons < progress.total_lessons) {
    throw conflict("Terminez toutes les leçons avant de passer l'examen.");
  }
  return { enrollment, progress };
}

async function nextNumber(db) {
  const prefix = `IK-${new Date().getUTCFullYear()}-`;
  const last = await db.value(
    `SELECT number FROM certificates WHERE number LIKE ? ORDER BY number DESC LIMIT 1`,
    `${prefix}%`,
  );
  const sequence = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

function formatUtc(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} à ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function courseRoutes(router) {
  // --- Catalogue -------------------------------------------------------------
  router.get("/courses", async (ctx) => {
    const filters = parseObject(
      { audience: oneOf(AUDIENCES, { optional: true }), parcours: oneOf(PARCOURS, { optional: true }) },
      Object.fromEntries(ctx.url.searchParams),
    );
    let sql = `SELECT * FROM courses WHERE status = 'published' AND is_template = 0`;
    const params = [];
    if (filters.audience && filters.audience !== "tous") {
      sql += ` AND audience IN (?, 'tous')`;
      params.push(filters.audience);
    }
    if (filters.parcours) {
      sql += ` AND parcours = ?`;
      params.push(filters.parcours);
    }
    const rows = await ctx.db.all(`${sql} ORDER BY position, title`, ...params);
    return json(rows.map(courseSummary));
  });

  router.get("/courses/:slug", async (ctx) => {
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    return json(await courseDetail(ctx.db, course));
  });

  // --- Leçons ---------------------------------------------------------------
  router.get("/courses/:slug/lessons/:lessonId", async (ctx) => {
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const lesson = await lessonOf(ctx.db, course, ctx.params.lessonId);
    await checkLessonAccess(ctx, course, lesson);
    return json(await lessonFull(ctx.db, lesson, true));
  });

  router.post("/courses/:slug/lessons/:lessonId/blocks/:blockId/check", async (ctx) => {
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const lesson = await lessonOf(ctx.db, course, ctx.params.lessonId);
    await checkLessonAccess(ctx, course, lesson);
    const payload = parseObject(answersSchema, await readJson(ctx.request));
    const block = await ctx.db.first(`SELECT * FROM blocks WHERE id = ?`, ctx.params.blockId);
    if (!block || block.lesson_id !== lesson.id || block.type !== "quiz") throw notFound("Quiz introuvable.");
    const questions = JSON.parse(block.data).questions;
    const results = grade(questions, payload.answers).map((r, i) => ({
      ...r,
      correct_options: questions[i].options.map((o, j) => (o.correct ? j : -1)).filter((j) => j >= 0),
      explanation: questions[i].explanation ?? null,
    }));
    return json({ results, score: scorePercent(results) });
  });

  // --- Inscription et progression ----------------------------------------------
  router.post("/courses/:slug/enroll", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    if (await enrollmentOf(ctx.db, user, course)) throw conflict("Vous êtes déjà inscrit à ce cours.");
    const enrollment = { id: newId(), course_id: course.id, status: "active", created_at: now(), completed_at: null };
    try {
      await ctx.db.run(
        `INSERT INTO enrollments (id, user_id, course_id, status, created_at) VALUES (?, ?, ?, 'active', ?)`,
        enrollment.id, user.id, course.id, enrollment.created_at,
      );
    } catch (err) {
      if (isUniqueError(err)) throw conflict("Vous êtes déjà inscrit à ce cours.");
      throw err;
    }
    return json(enrollment, 201);
  });

  router.post("/courses/:slug/lessons/:lessonId/complete", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const lesson = await lessonOf(ctx.db, course, ctx.params.lessonId);
    const enrollment = await requiredEnrollment(ctx.db, user, course);
    await ctx.db.run(
      `INSERT INTO lesson_progress (id, enrollment_id, lesson_id, completed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (enrollment_id, lesson_id) DO NOTHING`,
      newId(), enrollment.id, lesson.id, now(),
    );
    return json(await progressOf(ctx.db, course, enrollment));
  });

  router.get("/courses/:slug/progress", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    return json(await progressOf(ctx.db, course, await requiredEnrollment(ctx.db, user, course)));
  });

  // --- Examen final --------------------------------------------------------------
  router.get("/courses/:slug/exam", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const { enrollment, progress } = await examReady(ctx.db, course, user);
    const { left, retryAt } = attemptWindow(await attemptsOf(ctx.db, enrollment));
    return json({
      questions: publicQuestions(courseExam(course).questions),
      pass_score: course.exam_pass_score,
      attempts_left: left,
      retry_at: retryAt,
      best_score: progress.best_score,
      passed: progress.exam_passed,
    });
  });

  router.post("/courses/:slug/exam", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const payload = parseObject(answersSchema, await readJson(ctx.request));
    const { enrollment } = await examReady(ctx.db, course, user);
    const { left, retryAt } = attemptWindow(await attemptsOf(ctx.db, enrollment));
    if (left === 0) {
      throw new HttpError(429, `Trois tentatives en 24 heures : nouvel essai possible après ${formatUtc(retryAt)} (UTC).`);
    }
    const results = grade(courseExam(course).questions, payload.answers);
    const score = scorePercent(results);
    const passed = score >= course.exam_pass_score;
    const statements = [
      ctx.db.stmt(
        `INSERT INTO exam_attempts (id, enrollment_id, score, passed, created_at) VALUES (?, ?, ?, ?, ?)`,
        newId(), enrollment.id, score, passed, now(),
      ),
    ];
    if (passed && !enrollment.completed_at) {
      statements.push(
        ctx.db.stmt(`UPDATE enrollments SET status = 'completed', completed_at = ? WHERE id = ?`, now(), enrollment.id),
      );
    }
    await ctx.db.batch(statements);
    return json({
      score,
      passed,
      distinction: passed && score >= course.exam_distinction_score,
      results: results.map((r) => ({ correct: r.correct })),
      attempts_left: left - 1,
    });
  });

  // --- Attestations ---------------------------------------------------------------
  router.post("/courses/:slug/certificate", async (ctx) => {
    const user = await currentUser(ctx);
    const course = await publishedCourse(ctx.db, ctx.params.slug);
    const payload = parseObject({ full_name: str({ min: 3, max: 120 }) }, await readJson(ctx.request));
    const enrollment = await requiredEnrollment(ctx.db, user, course);
    const existing = await ctx.db.first(
      `SELECT * FROM certificates WHERE user_id = ? AND course_id = ?`,
      user.id,
      course.id,
    );
    // Une attestation déjà délivrée est renvoyée telle quelle : le nom ne change plus.
    if (existing) return json(certificateOut(existing, course));
    const progress = await progressOf(ctx.db, course, enrollment);
    if (progress.completed_lessons < progress.total_lessons || !progress.exam_passed) {
      throw conflict("Terminez toutes les leçons et réussissez l'examen final pour obtenir l'attestation.");
    }
    const score = progress.best_score || 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cert = {
        id: newId(),
        number: await nextNumber(ctx.db),
        full_name: payload.full_name.split(/\s+/).join(" "),
        score,
        distinction: score >= course.exam_distinction_score ? 1 : 0,
        issued_at: now(),
      };
      try {
        await ctx.db.run(
          `INSERT INTO certificates (id, number, user_id, course_id, full_name, score, distinction, issued_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          cert.id, cert.number, user.id, course.id, cert.full_name, cert.score, cert.distinction, cert.issued_at,
        );
        return json(certificateOut(cert, course));
      } catch (err) {
        if (!isUniqueError(err)) throw err;
        const raced = await ctx.db.first(`SELECT * FROM certificates WHERE user_id = ? AND course_id = ?`, user.id, course.id);
        if (raced) return json(certificateOut(raced, course));
      }
    }
    throw conflict("Réessayez dans un instant.");
  });

  router.get("/certificates/:number", async (ctx) => {
    const cert = await ctx.db.first(`SELECT * FROM certificates WHERE number = ?`, ctx.params.number.toUpperCase());
    if (!cert) throw notFound("Aucune attestation ne porte ce numéro.");
    const course = await ctx.db.first(`SELECT * FROM courses WHERE id = ?`, cert.course_id);
    return json(certificateOut(cert, course));
  });

  // --- Mon espace -------------------------------------------------------------------
  router.get("/me/courses", async (ctx) => {
    const user = await currentUser(ctx);
    // Quelques requêtes groupées, quel que soit le nombre de cours suivis.
    const rows = await ctx.db.all(
      `SELECT e.id AS e_id, e.user_id AS e_user, c.* FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? AND c.status = 'published' ORDER BY e.created_at DESC`,
      user.id,
    );
    const lessons = await ctx.db.all(
      `SELECT l.id, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id
       WHERE m.course_id IN (SELECT course_id FROM enrollments WHERE user_id = ?)`,
      user.id,
    );
    const done = await ctx.db.all(
      `SELECT p.enrollment_id, p.lesson_id FROM lesson_progress p JOIN enrollments e ON e.id = p.enrollment_id WHERE e.user_id = ?`,
      user.id,
    );
    const attempts = await ctx.db.all(
      `SELECT a.enrollment_id, MAX(a.score) AS best, MAX(a.passed) AS passed FROM exam_attempts a
       JOIN enrollments e ON e.id = a.enrollment_id WHERE e.user_id = ? GROUP BY a.enrollment_id`,
      user.id,
    );
    const certificates = new Map(
      (await ctx.db.all(`SELECT course_id, number FROM certificates WHERE user_id = ?`, user.id)).map((c) => [c.course_id, c.number]),
    );
    const byCourse = new Map();
    for (const l of lessons) {
      if (!byCourse.has(l.course_id)) byCourse.set(l.course_id, new Set());
      byCourse.get(l.course_id).add(l.id);
    }
    const attemptsOfEnrollment = new Map(attempts.map((a) => [a.enrollment_id, a]));
    return json(
      rows.map((row) => {
        const ids = byCourse.get(row.id) || new Set();
        const completed = done.filter((d) => d.enrollment_id === row.e_id && ids.has(d.lesson_id)).map((d) => d.lesson_id);
        const a = attemptsOfEnrollment.get(row.e_id);
        return {
          course: courseSummary(row),
          progress: {
            completed_lessons: completed.length,
            total_lessons: ids.size,
            percent: ids.size ? Math.round((100 * completed.length) / ids.size) : 0,
            completed_lesson_ids: completed,
            exam_passed: Boolean(a && a.passed),
            best_score: a ? a.best : null,
            certificate_number: certificates.get(row.id) ?? null,
          },
        };
      }),
    );
  });

  router.get("/me/certificates", async (ctx) => {
    const user = await currentUser(ctx);
    const rows = await ctx.db.all(
      `SELECT c.*, co.slug AS co_slug, co.title AS co_title, co.level AS co_level,
              co.duration_minutes AS co_duration, co.skills AS co_skills
       FROM certificates c JOIN courses co ON co.id = c.course_id
       WHERE c.user_id = ? ORDER BY c.issued_at DESC`,
      user.id,
    );
    return json(
      rows.map((r) =>
        certificateOut(r, { slug: r.co_slug, title: r.co_title, level: r.co_level, duration_minutes: r.co_duration, skills: r.co_skills }),
      ),
    );
  });

  router.get("/me/stats", async (ctx) => {
    const user = await currentUser(ctx);
    return json({
      courses: await ctx.db.value(`SELECT COUNT(*) FROM enrollments WHERE user_id = ?`, user.id),
      certificates: await ctx.db.value(`SELECT COUNT(*) FROM certificates WHERE user_id = ?`, user.id),
    });
  });
}
