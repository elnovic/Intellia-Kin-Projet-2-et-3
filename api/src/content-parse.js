// Transformation des cours rédigés dans le dépôt (dossier contenu/cours) en
// données prêtes à importer. Utilisé au moment de la construction, par
// scripts/build-content.mjs : le Worker ne reçoit que le résultat.
//
// Dans une leçon, les encadrés s'écrivent ainsi :
//
//     ::: a-retenir
//     Texte de l'encadré.
//     :::
//
// Variantes : a-retenir, a-savoir, attention, a-vous (exercice). Un titre
// facultatif suit la variante : « ::: a-vous Votre premier prompt ».
// Les images s'écrivent ![description](images/schema.svg).

import { BlockError, validateBlock, validateQuestions } from "./blocks.js";

export class ContentError extends Error {}

export const IMAGE_TYPES = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const CALLOUTS = {
  "a-retenir": ["tip", "À retenir"],
  "a-savoir": ["info", "À savoir"],
  attention: ["warning", "Attention"],
  "a-vous": ["exercise", "À vous de jouer"],
};
const OPEN = /^:::\s*([a-z-]+)\s*(.*)$/;
const IMAGE = /!\[([^\]]*)\]\((?:\.\/)?images\/([^)\s]+)\)/g;

export function mediaUrl(slug, filename) {
  return `/media/cours/${slug}/images/${filename}`;
}

/** Découpe une leçon en blocs : texte et encadrés. */
export function lessonBlocks(slug, markdown) {
  const source = markdown.replace(IMAGE, (_, alt, file) => `![${alt}](${mediaUrl(slug, file)})`);
  const blocks = [];
  let buffer = [];
  let callout = null;

  const flush = () => {
    const content = buffer.join("\n").trim();
    buffer = [];
    if (!content) return;
    if (callout === null) blocks.push({ type: "text", data: { markdown: content } });
    else blocks.push({ type: "callout", data: { variant: callout[0], title: callout[1], markdown: content } });
  };

  for (const line of source.split(/\r?\n/)) {
    const stripped = line.trim();
    const match = OPEN.exec(stripped);
    if (callout === null && match && CALLOUTS[match[1]]) {
      flush();
      const [variant, defaultTitle] = CALLOUTS[match[1]];
      callout = [variant, match[2].trim() || defaultTitle];
    } else if (callout !== null && stripped === ":::") {
      flush();
      callout = null;
    } else {
      buffer.push(line);
    }
  }
  if (callout !== null) throw new ContentError("Un encadré « ::: » n'est pas refermé.");
  flush();
  return blocks;
}

const COURSE_FIELDS = [
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
];

/**
 * Prépare un cours à partir de sa fiche (cours.json) et de ses leçons.
 * `readLesson(fichier)` renvoie le texte Markdown d'une leçon.
 */
export function buildCourse(folderName, spec, readLesson) {
  const slug = spec.slug || folderName;
  if (slug !== folderName) {
    throw new ContentError(`Le slug « ${slug} » doit être le nom du dossier « ${folderName} ».`);
  }
  const course = { slug };
  for (const field of COURSE_FIELDS) if (field in spec) course[field] = spec[field];
  course.cover_image = spec.cover_image ? mediaUrl(slug, spec.cover_image.split("/").pop()) : null;
  course.status = spec.status || "published";

  const keys = new Set();
  course.modules = (spec.modules || []).map((m) => ({
    title: m.title,
    lessons: (m.lessons || []).map((l) => {
      if (!l.key) throw new ContentError(`Une leçon de « ${m.title} » n'a pas de clé.`);
      if (keys.has(l.key)) throw new ContentError(`Clé de leçon en double : ${l.key}`);
      keys.add(l.key);
      const raw = lessonBlocks(slug, readLesson(l.file));
      if (l.quiz && l.quiz.length) raw.push({ type: "quiz", data: { questions: l.quiz } });
      const blocks = raw.map((b) => {
        try {
          return { type: b.type, data: validateBlock(b.type, b.data) };
        } catch (err) {
          if (err instanceof BlockError) {
            throw new ContentError(`${l.file} : ${err.message} ${JSON.stringify(err.errors)}`);
          }
          throw err;
        }
      });
      return {
        key: l.key,
        title: l.title,
        objective: l.objective || "",
        duration_minutes: l.duration_minutes ?? 10,
        is_preview: Boolean(l.is_preview),
        blocks,
      };
    }),
  }));

  const exam = spec.exam || {};
  let questions = [];
  if (exam.questions && exam.questions.length) {
    try {
      questions = validateQuestions(exam.questions);
    } catch (err) {
      if (err instanceof BlockError) throw new ContentError(`${slug} examen : ${err.message} ${JSON.stringify(err.errors)}`);
      throw err;
    }
  }
  course.exam = { questions };
  course.exam_pass_score = exam.pass_score ?? 70;
  course.exam_distinction_score = exam.distinction_score ?? 90;
  return course;
}
