// Import des cours du dépôt dans la base, au démarrage du Worker.
//
// Le contenu a été préparé et validé à la construction (scripts/build-content.mjs).
// L'import est idempotent : un cours inchangé (même empreinte) n'est pas réécrit.
// La progression des apprenants est conservée, car chaque leçon garde son
// identifiant tant que sa clé (`key`) ne change pas.

import { newId, now } from "./db.js";

const FIELDS = [
  "title",
  "summary",
  "description",
  "audience",
  "parcours",
  "level",
  "format",
  "duration_minutes",
  "objectives",
  "skills",
  "prerequisites",
  "trainer",
  "position",
  "cover_image",
  "exam",
  "exam_pass_score",
  "exam_distinction_score",
  "status",
];

/**
 * Écrit un cours et son programme en un seul lot. `existing` contient la ligne
 * du cours s'il existe déjà, ses modules dans l'ordre et ses leçons par clé.
 * Renvoie « créé » ou « mis à jour ».
 */
export async function applyCourse(db, spec, existing = null) {
  const courseId = existing ? existing.id : newId();
  const statements = [];
  const present = FIELDS.filter((f) => f in spec && spec[f] !== undefined);

  if (existing) {
    statements.push(
      db.stmt(
        `UPDATE courses SET ${present.map((f) => `${f} = ?`).join(", ")}, source = 'depot',
           published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END
         WHERE id = ?`,
        ...present.map((f) => spec[f]),
        spec.status,
        now(),
        courseId,
      ),
    );
  } else {
    statements.push(
      db.stmt(
        `INSERT INTO courses (id, slug, source, created_at, published_at, ${present.join(", ")})
         VALUES (?, ?, 'depot', ?, ?, ${present.map(() => "?").join(", ")})`,
        courseId,
        spec.slug,
        now(),
        spec.status === "published" ? now() : null,
        ...present.map((f) => spec[f]),
      ),
    );
  }

  const modules = existing ? existing.modules : [];
  const lessonsByKey = existing ? existing.lessons : new Map();

  const kept = new Set();
  spec.modules.forEach((m, mi) => {
    const moduleId = modules[mi] ? modules[mi].id : newId();
    if (modules[mi]) {
      statements.push(db.stmt(`UPDATE modules SET title = ?, position = ? WHERE id = ?`, m.title, mi + 1, moduleId));
    } else {
      statements.push(
        db.stmt(`INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)`, moduleId, courseId, m.title, mi + 1),
      );
    }
    m.lessons.forEach((l, li) => {
      let lessonId = lessonsByKey.get(l.key);
      if (lessonId) {
        statements.push(
          db.stmt(
            `UPDATE lessons SET module_id = ?, title = ?, objective = ?, duration_minutes = ?, is_preview = ?, position = ? WHERE id = ?`,
            moduleId, l.title, l.objective, l.duration_minutes, l.is_preview, li + 1, lessonId,
          ),
        );
        statements.push(db.stmt(`DELETE FROM blocks WHERE lesson_id = ?`, lessonId));
      } else {
        lessonId = newId();
        statements.push(
          db.stmt(
            `INSERT INTO lessons (id, module_id, key, title, objective, duration_minutes, is_preview, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            lessonId, moduleId, l.key, l.title, l.objective, l.duration_minutes, l.is_preview, li + 1,
          ),
        );
      }
      kept.add(l.key);
      l.blocks.forEach((b, bi) => {
        statements.push(
          db.stmt(`INSERT INTO blocks (id, lesson_id, type, position, data) VALUES (?, ?, ?, ?, ?)`, newId(), lessonId, b.type, bi + 1, b.data),
        );
      });
    });
  });

  // Suppressions en dernier : les leçons déplacées ont déjà changé de module.
  for (const [key, id] of lessonsByKey) {
    if (!kept.has(key)) statements.push(db.stmt(`DELETE FROM lessons WHERE id = ?`, id));
  }
  for (const m of modules.slice(spec.modules.length)) {
    statements.push(db.stmt(`DELETE FROM modules WHERE id = ?`, m.id));
  }
  // L'empreinte en dernier : si une étape échoue, tout le lot est annulé.
  statements.push(db.stmt(`UPDATE courses SET content_hash = ? WHERE id = ?`, spec.content_hash, courseId));

  await db.batch(statements);
  return existing ? "mis à jour" : "créé";
}

/**
 * Importe les cours qui ont changé. Renvoie {slug: résultat}.
 * Trois lectures pour tout l'état existant, puis un lot par cours modifié :
 * l'offre gratuite de Cloudflare limite le nombre de requêtes par appel.
 */
export async function importCourses(db, bundle, { force = false } = {}) {
  const report = {};
  const courses = new Map((await db.all(`SELECT id, slug, content_hash FROM courses`)).map((c) => [c.slug, c]));
  const modulesByCourse = new Map();
  for (const m of await db.all(`SELECT id, course_id FROM modules ORDER BY position, rowid`)) {
    if (!modulesByCourse.has(m.course_id)) modulesByCourse.set(m.course_id, []);
    modulesByCourse.get(m.course_id).push({ id: m.id });
  }
  const lessonsByCourse = new Map();
  for (const l of await db.all(
    `SELECT l.id, l.key, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.key IS NOT NULL`,
  )) {
    if (!lessonsByCourse.has(l.course_id)) lessonsByCourse.set(l.course_id, new Map());
    lessonsByCourse.get(l.course_id).set(l.key, l.id);
  }
  for (const spec of bundle.courses) {
    const current = courses.get(spec.slug);
    if (!force && current && current.content_hash === spec.content_hash) {
      report[spec.slug] = "inchangé";
      continue;
    }
    const existing = current
      ? { id: current.id, modules: modulesByCourse.get(current.id) || [], lessons: lessonsByCourse.get(current.id) || new Map() }
      : null;
    try {
      report[spec.slug] = await applyCourse(db, spec, existing);
    } catch (err) {
      report[spec.slug] = `erreur : ${err.message}`;
      console.error(`Cours ${spec.slug} non chargé : ${err.message}`);
    }
  }
  return report;
}
