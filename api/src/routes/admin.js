// Centre de contrôle : création et édition des cours, statistiques.

import { requireAdmin } from "../auth.js";
import { blockTypesCatalog, validateBlock, validateQuestions } from "../blocks.js";
import { newId, now } from "../db.js";
import { conflict, HttpError, json, noContent, notFound, readJson } from "../http.js";
import { blockOut, courseFull, courseSummary, lessonFull, slugify } from "../model.js";
import { arr, bool, int, isUuid, oneOf, parseObject, slug, str, any } from "../validate.js";

const AUDIENCES = ["jeune_diplome", "entrepreneur", "pme", "tous"];
const PARCOURS = ["tronc-commun", "carriere", "entrepreneuriat", "organisations"];
const LEVELS = ["debutant", "intermediaire", "avance"];
const FORMATS = ["self_paced", "cohort", "hybrid"];

// Champs d'un cours : règle et valeur par défaut à la création.
const COURSE_FIELDS = {
  title: [(o) => str({ min: 3, max: 200, ...o })],
  summary: [(o) => str({ max: 500, ...o }), ""],
  description: [(o) => str({ max: 20_000, ...o }), ""],
  audience: [(o) => oneOf(AUDIENCES, o), "tous"],
  parcours: [(o) => oneOf(PARCOURS, o), "tronc-commun"],
  level: [(o) => oneOf(LEVELS, o), "debutant"],
  format: [(o) => oneOf(FORMATS, o), "self_paced"],
  duration_minutes: [(o) => int({ min: 5, max: 6000, ...o }), 60],
  objectives: [(o) => arr(str({ max: 500 }), { max: 12, ...o }), []],
  skills: [(o) => arr(str({ max: 200 }), { max: 8, ...o }), []],
  prerequisites: [(o) => str({ max: 500, ...o }), "Aucun"],
  trainer: [(o) => str({ max: 200, ...o }), "Équipe Intellia Kin"],
  cover_image: [(o) => str({ max: 500, ...o }), null],
  position: [(o) => int({ min: 0, max: 10_000, ...o }), 100],
  exam_pass_score: [(o) => int({ min: 0, max: 100, ...o }), 70],
  exam_distinction_score: [(o) => int({ min: 0, max: 100, ...o }), 90],
  is_template: [(o) => bool(o), false],
};

const createSchema = {
  slug: slug({ default: null }),
  ...Object.fromEntries(
    Object.entries(COURSE_FIELDS).map(([k, [rule, def]]) => [k, k === "title" ? rule() : rule({ default: def })]),
  ),
};
const updateSchema = {
  slug: slug({ optional: true, nullable: true }),
  ...Object.fromEntries(Object.entries(COURSE_FIELDS).map(([k, [rule]]) => [k, rule({ optional: true, nullable: true })])),
};
const reorderSchema = { ids: arr(str({ min: 36, max: 36 }), { min: 1, max: 1000 }) };
const lessonFields = {
  title: (o) => str({ min: 1, max: 200, ...o }),
  objective: (o) => str({ max: 500, ...o }),
  duration_minutes: (o) => int({ min: 1, max: 600, ...o }),
  is_preview: (o) => bool(o),
};

async function getCourse(db, id) {
  const course = isUuid(id) ? await db.first(`SELECT * FROM courses WHERE id = ?`, id) : null;
  if (!course) throw notFound("Cours introuvable.");
  return course;
}

/** Cours d'un module, d'une leçon ou d'un bloc, avec l'élément lui-même. */
async function locate(db, kind, id) {
  const label = { module: "Module", lesson: "Leçon", block: "Bloc" }[kind];
  if (!isUuid(id)) throw notFound(`${label} introuvable.`);
  const sql = {
    module: `SELECT x.*, c.id AS c_id, c.title AS c_title, c.source AS c_source
             FROM modules x JOIN courses c ON c.id = x.course_id WHERE x.id = ?`,
    lesson: `SELECT x.*, c.id AS c_id, c.title AS c_title, c.source AS c_source
             FROM lessons x JOIN modules m ON m.id = x.module_id JOIN courses c ON c.id = m.course_id WHERE x.id = ?`,
    block: `SELECT x.*, c.id AS c_id, c.title AS c_title, c.source AS c_source
            FROM blocks x JOIN lessons l ON l.id = x.lesson_id JOIN modules m ON m.id = l.module_id
            JOIN courses c ON c.id = m.course_id WHERE x.id = ?`,
  }[kind];
  const row = await db.first(sql, id);
  if (!row) throw notFound(`${label} introuvable.`);
  return row;
}

function ensureEditable(source) {
  if (source === "depot") {
    throw conflict("Ce cours est rédigé dans le dépôt GitHub (dossier contenu/cours) : modifiez-le là-bas.");
  }
}

async function editableCourse(db, id) {
  const course = await getCourse(db, id);
  ensureEditable(course.source);
  return course;
}

async function editable(db, kind, id) {
  const row = await locate(db, kind, id);
  ensureEditable(row.c_source);
  return row;
}

async function slugTaken(db, value, exceptId = null) {
  return Boolean(await db.first(`SELECT id FROM courses WHERE slug = ? AND id IS NOT ?`, value, exceptId));
}

async function nextPosition(db, table, column, parentId) {
  const last = await db.value(`SELECT MAX(position) FROM ${table} WHERE ${column} = ?`, parentId);
  return (last || 0) + 1;
}

async function reorder(ctx, table, column, parentId) {
  const { ids } = parseObject(reorderSchema, await readJson(ctx.request));
  const existing = (await ctx.db.all(`SELECT id FROM ${table} WHERE ${column} = ?`, parentId)).map((r) => r.id);
  const wanted = new Set(ids);
  if (wanted.size !== ids.length || wanted.size !== existing.length || !existing.every((id) => wanted.has(id))) {
    throw new HttpError(422, "La liste doit contenir chaque élément une fois, et aucun autre.");
  }
  await ctx.db.batch(ids.map((id, i) => ctx.db.stmt(`UPDATE ${table} SET position = ? WHERE id = ?`, i + 1, id)));
}

const fullCourse = async (db, id) => json(await courseFull(db, await getCourse(db, id)));

async function moduleFull(db, id) {
  const m = await db.first(`SELECT * FROM modules WHERE id = ?`, id);
  const lessons = await db.all(`SELECT * FROM lessons WHERE module_id = ? ORDER BY position, rowid`, id);
  return {
    id: m.id,
    title: m.title,
    position: m.position,
    lessons: await Promise.all(lessons.map((l) => lessonFull(db, l))),
  };
}

const lessonById = async (db, id) => lessonFull(db, await db.first(`SELECT * FROM lessons WHERE id = ?`, id));

function blockData(type, data) {
  return validateBlock(type, data);
}

export function adminRoutes(router) {
  router.get("/admin/block-types", async (ctx) => {
    await requireAdmin(ctx);
    return json(blockTypesCatalog());
  });

  // --- Cours -------------------------------------------------------------------
  router.get("/admin/courses", async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.all(`SELECT * FROM courses ORDER BY created_at DESC, position`);
    return json(rows.map(courseSummary));
  });

  router.post("/admin/courses", async (ctx) => {
    await requireAdmin(ctx);
    const data = parseObject(createSchema, await readJson(ctx.request));
    let value = data.slug;
    if (value) {
      if (await slugTaken(ctx.db, value)) throw conflict("Cette adresse de cours est déjà prise.");
    } else {
      const base = slugify(data.title);
      value = base;
      for (let n = 2; await slugTaken(ctx.db, value); n++) value = `${base}-${n}`;
    }
    const id = newId();
    const fields = Object.keys(COURSE_FIELDS);
    await ctx.db.run(
      `INSERT INTO courses (id, slug, status, source, created_at, ${fields.join(", ")})
       VALUES (?, ?, 'draft', 'console', ?, ${fields.map(() => "?").join(", ")})`,
      id, value, now(), ...fields.map((f) => data[f]),
    );
    const response = await fullCourse(ctx.db, id);
    return new Response(response.body, { status: 201, headers: response.headers });
  });

  router.get("/admin/courses/:id", async (ctx) => {
    await requireAdmin(ctx);
    return fullCourse(ctx.db, ctx.params.id);
  });

  router.patch("/admin/courses/:id", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    const changes = parseObject(updateSchema, await readJson(ctx.request));
    if (changes.slug && (await slugTaken(ctx.db, changes.slug, course.id))) {
      throw conflict("Cette adresse de cours est déjà prise.");
    }
    // Seule l'image de couverture peut être vidée ; les autres champs à null sont ignorés.
    const entries = Object.entries(changes).filter(([k, v]) => v !== null || k === "cover_image");
    if (entries.length) {
      await ctx.db.run(
        `UPDATE courses SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`,
        ...entries.map(([, v]) => v), course.id,
      );
    }
    return fullCourse(ctx.db, course.id);
  });

  router.post("/admin/courses/:id/publish", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    if (course.is_template) throw conflict("Un gabarit ne se publie pas. Créez un cours à partir de lui.");
    const lessons = await ctx.db.value(
      `SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?`,
      course.id,
    );
    if (!lessons) throw conflict("Ajoutez au moins une leçon avant de publier ce cours.");
    await ctx.db.run(
      `UPDATE courses SET status = 'published', published_at = COALESCE(published_at, ?) WHERE id = ?`,
      now(), course.id,
    );
    return fullCourse(ctx.db, course.id);
  });

  for (const [action, status] of [["unpublish", "draft"], ["archive", "archived"]]) {
    router.post(`/admin/courses/:id/${action}`, async (ctx) => {
      await requireAdmin(ctx);
      const course = await editableCourse(ctx.db, ctx.params.id);
      await ctx.db.run(`UPDATE courses SET status = ? WHERE id = ?`, status, course.id);
      return fullCourse(ctx.db, course.id);
    });
  }

  router.delete("/admin/courses/:id", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    if (await ctx.db.value(`SELECT COUNT(*) FROM enrollments WHERE course_id = ?`, course.id)) {
      throw conflict("Des apprenants suivent ce cours : archivez-le plutôt.");
    }
    await ctx.db.run(`DELETE FROM courses WHERE id = ?`, course.id);
    return noContent();
  });

  router.put("/admin/courses/:id/exam", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    const { questions } = parseObject({ questions: arr(any(), { min: 1, max: 100 }) }, await readJson(ctx.request));
    await ctx.db.run(`UPDATE courses SET exam = ? WHERE id = ?`, { questions: validateQuestions(questions) }, course.id);
    return fullCourse(ctx.db, course.id);
  });

  router.post("/admin/courses/:id/modules/reorder", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    await reorder(ctx, "modules", "course_id", course.id);
    return fullCourse(ctx.db, course.id);
  });

  // --- Modules -----------------------------------------------------------------
  router.post("/admin/courses/:id/modules", async (ctx) => {
    await requireAdmin(ctx);
    const course = await editableCourse(ctx.db, ctx.params.id);
    const { title } = parseObject({ title: str({ min: 1, max: 200 }) }, await readJson(ctx.request));
    const id = newId();
    await ctx.db.run(
      `INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)`,
      id, course.id, title, await nextPosition(ctx.db, "modules", "course_id", course.id),
    );
    return json(await moduleFull(ctx.db, id), 201);
  });

  router.patch("/admin/modules/:id", async (ctx) => {
    await requireAdmin(ctx);
    const m = await editable(ctx.db, "module", ctx.params.id);
    const { title } = parseObject({ title: str({ min: 1, max: 200 }) }, await readJson(ctx.request));
    await ctx.db.run(`UPDATE modules SET title = ? WHERE id = ?`, title, m.id);
    return json(await moduleFull(ctx.db, m.id));
  });

  router.delete("/admin/modules/:id", async (ctx) => {
    await requireAdmin(ctx);
    const m = await editable(ctx.db, "module", ctx.params.id);
    await ctx.db.run(`DELETE FROM modules WHERE id = ?`, m.id);
    return noContent();
  });

  router.post("/admin/modules/:id/lessons/reorder", async (ctx) => {
    await requireAdmin(ctx);
    const m = await editable(ctx.db, "module", ctx.params.id);
    await reorder(ctx, "lessons", "module_id", m.id);
    return json(await moduleFull(ctx.db, m.id));
  });

  // --- Leçons -------------------------------------------------------------------
  router.post("/admin/modules/:id/lessons", async (ctx) => {
    await requireAdmin(ctx);
    const m = await editable(ctx.db, "module", ctx.params.id);
    const data = parseObject(
      {
        title: lessonFields.title(),
        objective: lessonFields.objective({ default: "" }),
        duration_minutes: lessonFields.duration_minutes({ default: 10 }),
        is_preview: lessonFields.is_preview({ default: false }),
      },
      await readJson(ctx.request),
    );
    const id = newId();
    await ctx.db.run(
      `INSERT INTO lessons (id, module_id, title, objective, duration_minutes, is_preview, position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, m.id, data.title, data.objective, data.duration_minutes, data.is_preview,
      await nextPosition(ctx.db, "lessons", "module_id", m.id),
    );
    return json(await lessonById(ctx.db, id), 201);
  });

  router.get("/admin/lessons/:id", async (ctx) => {
    await requireAdmin(ctx);
    const l = await locate(ctx.db, "lesson", ctx.params.id);
    return json({ ...(await lessonById(ctx.db, l.id)), course_id: l.c_id, course_title: l.c_title, course_source: l.c_source });
  });

  router.patch("/admin/lessons/:id", async (ctx) => {
    await requireAdmin(ctx);
    const l = await editable(ctx.db, "lesson", ctx.params.id);
    const changes = parseObject(
      Object.fromEntries(Object.entries(lessonFields).map(([k, rule]) => [k, rule({ optional: true, nullable: true })])),
      await readJson(ctx.request),
    );
    const entries = Object.entries(changes).filter(([, v]) => v !== null);
    if (entries.length) {
      await ctx.db.run(`UPDATE lessons SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, ...entries.map(([, v]) => v), l.id);
    }
    return json(await lessonById(ctx.db, l.id));
  });

  router.delete("/admin/lessons/:id", async (ctx) => {
    await requireAdmin(ctx);
    const l = await editable(ctx.db, "lesson", ctx.params.id);
    await ctx.db.run(`DELETE FROM lessons WHERE id = ?`, l.id);
    return noContent();
  });

  router.post("/admin/lessons/:id/blocks/reorder", async (ctx) => {
    await requireAdmin(ctx);
    const l = await editable(ctx.db, "lesson", ctx.params.id);
    await reorder(ctx, "blocks", "lesson_id", l.id);
    return json(await lessonById(ctx.db, l.id));
  });

  // --- Blocs ---------------------------------------------------------------------
  router.post("/admin/lessons/:id/blocks", async (ctx) => {
    await requireAdmin(ctx);
    const l = await editable(ctx.db, "lesson", ctx.params.id);
    const payload = parseObject({ type: str({ min: 1, max: 40 }), data: any({ default: () => ({}) }) }, await readJson(ctx.request));
    const data = blockData(payload.type, payload.data);
    const id = newId();
    await ctx.db.run(
      `INSERT INTO blocks (id, lesson_id, type, position, data) VALUES (?, ?, ?, ?, ?)`,
      id, l.id, payload.type, await nextPosition(ctx.db, "blocks", "lesson_id", l.id), data,
    );
    return json(blockOut(await ctx.db.first(`SELECT * FROM blocks WHERE id = ?`, id)), 201);
  });

  router.put("/admin/blocks/:id", async (ctx) => {
    await requireAdmin(ctx);
    const b = await editable(ctx.db, "block", ctx.params.id);
    const payload = parseObject({ data: any() }, await readJson(ctx.request));
    await ctx.db.run(`UPDATE blocks SET data = ? WHERE id = ?`, blockData(b.type, payload.data), b.id);
    return json(blockOut(await ctx.db.first(`SELECT * FROM blocks WHERE id = ?`, b.id)));
  });

  router.delete("/admin/blocks/:id", async (ctx) => {
    await requireAdmin(ctx);
    const b = await editable(ctx.db, "block", ctx.params.id);
    await ctx.db.run(`DELETE FROM blocks WHERE id = ?`, b.id);
    return noContent();
  });

  // --- Statistiques ---------------------------------------------------------------
  router.get("/admin/stats", async (ctx) => {
    await requireAdmin(ctx);
    const courses = await ctx.db.all(
      `SELECT c.slug, c.title,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollments,
              (SELECT COUNT(*) FROM certificates k WHERE k.course_id = c.id) AS certificates
       FROM courses c ORDER BY c.position, c.title`,
    );
    return json({
      users: await ctx.db.value(`SELECT COUNT(*) FROM users`),
      enrollments: await ctx.db.value(`SELECT COUNT(*) FROM enrollments`),
      certificates: await ctx.db.value(`SELECT COUNT(*) FROM certificates`),
      courses,
    });
  });
}
