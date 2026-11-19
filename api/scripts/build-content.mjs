// Prépare les cours du dépôt (dossier contenu/cours) pour le Worker.
//
//   node scripts/build-content.mjs           écrit src/generated/content.js
//   node scripts/build-content.mjs --check   vérifie seulement (intégration continue)
//
// Chaque cours est validé : un cours en erreur bloque la construction, pour
// qu'aucune erreur de rédaction n'arrive en ligne.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCourse, IMAGE_TYPES } from "../src/content-parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const contentArg = args.find((a) => a.startsWith("--content="));
const outArg = args.find((a) => a.startsWith("--out="));
const contentDir = contentArg ? contentArg.split("=")[1] : join(apiDir, "..", "contenu");
const outFile = outArg ? outArg.split("=")[1] : join(apiDir, "src", "generated", "content.js");

function walk(folder) {
  const files = [];
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function folderHash(folder) {
  const digest = createHash("sha256");
  for (const path of walk(folder).sort()) {
    digest.update(relative(folder, path));
    digest.update(readFileSync(path));
  }
  return digest.digest("hex");
}

const root = join(contentDir, "cours");
const courses = [];
const media = {};
const errors = [];

if (existsSync(root)) {
  for (const name of readdirSync(root).sort()) {
    const folder = join(root, name);
    if (!statSync(folder).isDirectory() || !existsSync(join(folder, "cours.json"))) continue;
    try {
      const spec = JSON.parse(readFileSync(join(folder, "cours.json"), "utf8"));
      const course = buildCourse(name, spec, (file) => readFileSync(join(folder, "lecons", file), "utf8"));
      course.content_hash = folderHash(folder);
      courses.push(course);
      const images = join(folder, "images");
      if (existsSync(images)) {
        for (const file of readdirSync(images).sort()) {
          const ext = file.split(".").pop().toLowerCase();
          if (!IMAGE_TYPES[ext] || !/^[A-Za-z0-9._-]+$/.test(file)) continue;
          const bytes = readFileSync(join(images, file));
          media[`${name}/${file}`] =
            ext === "svg"
              ? { type: IMAGE_TYPES[ext], text: bytes.toString("utf8") }
              : { type: IMAGE_TYPES[ext], base64: bytes.toString("base64") };
        }
      }
      const lessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
      console.log(`OK      ${name} : ${course.modules.length} modules, ${lessons} leçons, ${course.exam.questions.length} questions d'examen`);
    } catch (err) {
      errors.push(name);
      console.error(`ERREUR  ${name} : ${err.message}`);
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} cours en erreur : corrigez-les avant de déployer.`);
  process.exit(1);
}

const bundleHash = createHash("sha256")
  .update(courses.map((c) => `${c.slug}:${c.content_hash}`).join("|"))
  .digest("hex");

if (checkOnly) {
  console.log(`\n${courses.length} cours valides.`);
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  const bundle = { hash: bundleHash, courses, media };
  writeFileSync(
    outFile,
    "// Fichier généré par scripts/build-content.mjs : ne pas modifier à la main.\n" +
      `export default ${JSON.stringify(bundle)};\n`,
  );
  console.log(`\n${courses.length} cours préparés dans ${relative(apiDir, outFile)}.`);
}
