// Plan du site de l'Académie (web/sitemap.xml), pour Google et les autres moteurs.
//
// Pages publiques : accueil, catalogue, chaque cours, outils, annonces.
// Les leçons, examens et espaces personnels demandent un compte : ils n'y sont pas.
//
//   node scripts/build-sitemap.mjs          écrit web/sitemap.xml
//   node scripts/build-sitemap.mjs --check  vérifie qu'il est à jour (intégration continue)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = "https://academie.intelliakin.com";
const out = join(root, "web", "sitemap.xml");

const courses = readdirSync(join(root, "contenu", "cours"))
  .filter((slug) => existsSync(join(root, "contenu", "cours", slug, "cours.json")))
  .sort();
const toolsSource = readFileSync(join(root, "web", "js", "pages-tools.js"), "utf8");
const tools = [...toolsSource.matchAll(/^\s*\{ slug: "([a-z0-9-]+)", title:/gm)].map((m) => m[1]);
if (tools.length < 10) throw new Error(`Outils introuvables dans pages-tools.js (${tools.length}).`);

const pages = [
  ["/", "1.0", "weekly"],
  ["/cours", "0.9", "weekly"],
  ...courses.map((slug) => [`/cours/${slug}`, "0.8", "monthly"]),
  ["/outils", "0.8", "monthly"],
  ...tools.map((slug) => [`/outils/${slug}`, "0.7", "monthly"]),
  ["/annonces", "0.6", "daily"],
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Généré par api/scripts/build-sitemap.mjs : ne pas modifier à la main. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([path, priority, freq]) => `  <url><loc>${SITE}${path}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join("\n")}
</urlset>
`;

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== xml) {
    console.error("web/sitemap.xml n'est pas à jour : lancez node scripts/build-sitemap.mjs");
    process.exit(1);
  }
  console.log(`Plan du site à jour (${pages.length} pages).`);
} else {
  writeFileSync(out, xml);
  console.log(`web/sitemap.xml écrit (${pages.length} pages : ${courses.length} cours, ${tools.length} outils).`);
}
