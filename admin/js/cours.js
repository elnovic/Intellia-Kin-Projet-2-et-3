// Cours : liste, création, programme (modules et leçons), contenu des leçons, examen.

import { api } from "./api.js";
import { PUBLIC_SITE, navigate, shell } from "./layout.js";
import { renderMarkdown } from "./md.js";
import { LABELS, badge, duration, esc, formData, loading, toast, withBusy } from "./ui.js";

// --- Questions au format texte ------------------------------------------------
//
//   ? Que signifie IA ?
//   + Intelligence artificielle      (bonne réponse)
//   - Internet avancé                (mauvaise réponse)
//   > Explication affichée après la réponse (facultatif)
//
// Plusieurs « + » : question à choix multiple. Options « Vrai » et « Faux » : vrai ou faux.

export function questionsToText(questions = []) {
  return questions
    .map((q) =>
      [`? ${q.prompt}`, ...q.options.map((o) => `${o.correct ? "+" : "-"} ${o.text}`), q.explanation ? `> ${q.explanation}` : ""]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

export function textToQuestions(text) {
  const questions = [];
  let current = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const mark = line[0];
    const value = line.slice(1).trim();
    if (mark === "?") {
      current = { prompt: value, options: [] };
      questions.push(current);
    } else if (!current) {
      throw new Error(`Ligne ${index + 1} : une question doit commencer par « ? ».`);
    } else if (mark === "+" || mark === "-") {
      current.options.push({ text: value, correct: mark === "+" });
    } else if (mark === ">") {
      current.explanation = value;
    } else {
      throw new Error(`Ligne ${index + 1} : commencez la ligne par ?, +, - ou >.`);
    }
  });
  return questions.map((q, i) => {
    const good = q.options.filter((o) => o.correct).length;
    if (q.options.length < 2) throw new Error(`Question ${i + 1} : il faut au moins deux réponses.`);
    if (!good) throw new Error(`Question ${i + 1} : marquez au moins une bonne réponse avec « + ».`);
    const labels = q.options.map((o) => o.text.toLowerCase());
    const kind = labels.length === 2 && labels.includes("vrai") && labels.includes("faux") ? "true_false" : good > 1 ? "multiple" : "single";
    return { ...q, kind };
  });
}

const QUESTION_HELP = `<p class="small">Une question par paragraphe : <code>?</code> la question, <code>+</code> une bonne réponse, <code>-</code> une mauvaise réponse, <code>></code> l'explication (facultative). Plusieurs <code>+</code> = choix multiple.</p>`;

function select(name, options, current) {
  return `<select name="${name}">${Object.entries(options)
    .map(([value, label]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`)
    .join("")}</select>`;
}

function readOnlyNotice(course) {
  return course.source === "depot"
    ? `<div class="notice notice-info"><p>Ce cours est rédigé dans le dépôt GitHub (dossier <code>contenu/cours/${esc(course.slug)}</code>). Il se modifie là-bas et se met à jour à chaque déploiement.</p></div>`
    : "";
}

// --- Liste des cours ------------------------------------------------------------

export async function coursesList(root) {
  const box = shell(root, "cours", "Cours", loading());
  const courses = (await api("/admin/courses")).sort((a, b) => a.position - b.position);
  const status = { published: ["Publié", "success"], draft: ["Brouillon", "neutral"], archived: ["Archivé", "neutral"] };
  box.innerHTML = `<p><a class="ik-bouton" href="#/cours/nouveau">Nouveau cours</a></p>
    <div class="md-table"><table><thead><tr><th>#</th><th>Cours</th><th>Parcours</th><th>Niveau</th><th>Statut</th><th>Source</th></tr></thead><tbody>${courses
      .map(
        (c) => `<tr><td>${c.position}</td><td><a href="#/cours/${c.id}">${esc(c.title)}</a></td><td>${esc(LABELS.parcours[c.parcours] || c.parcours)}</td><td>${esc(LABELS.level[c.level] || c.level)}</td><td>${badge(...(status[c.status] || [c.status, "neutral"]))}</td><td>${c.source === "depot" ? "Dépôt GitHub" : "Centre de contrôle"}</td></tr>`
      )
      .join("")}</tbody></table></div>`;
}

// --- Fiche du cours (création et modification) ----------------------------------

function courseFields(c = {}) {
  const lines = (list) => esc((list || []).join("\n"));
  return `<fieldset><legend>Présentation</legend>
      <label class="field"><span>Titre</span><input name="title" required minlength="3" maxlength="200" value="${esc(c.title || "")}"></label>
      <label class="field"><span>Résumé (carte du catalogue, 500 caractères max)</span><textarea name="summary" rows="2" maxlength="500">${esc(c.summary || "")}</textarea></label>
      <label class="field"><span>Présentation détaillée (Markdown)</span><textarea name="description" rows="6">${esc(c.description || "")}</textarea></label>
      <label class="field"><span>Image de couverture (adresse https, format 16:9)</span><input name="cover_image" type="url" value="${esc(c.cover_image || "")}"></label>
    </fieldset>
    <fieldset><legend>Classement</legend>
      <div class="form-grid">
        <label class="field"><span>Public</span>${select("audience", LABELS.audience, c.audience || "tous")}</label>
        <label class="field"><span>Parcours</span>${select("parcours", LABELS.parcours, c.parcours || "tronc-commun")}</label>
        <label class="field"><span>Niveau</span>${select("level", LABELS.level, c.level || "debutant")}</label>
        <label class="field"><span>Durée (minutes)</span><input name="duration_minutes" type="number" min="5" value="${c.duration_minutes || 60}"></label>
        <label class="field"><span>Ordre dans le catalogue</span><input name="position" type="number" min="0" value="${c.position ?? 100}"></label>
      </div>
    </fieldset>
    <fieldset><legend>Objectifs et attestation</legend>
      <label class="field"><span>Ce que l'apprenant va apprendre (un objectif par ligne)</span><textarea name="objectives" rows="4">${lines(c.objectives)}</textarea></label>
      <label class="field"><span>Compétences imprimées sur l'attestation (une par ligne, 3 ou 4)</span><textarea name="skills" rows="3">${lines(c.skills)}</textarea></label>
      <div class="form-grid">
        <label class="field"><span>Prérequis</span><input name="prerequisites" value="${esc(c.prerequisites || "Aucun")}"></label>
        <label class="field"><span>Formateur</span><input name="trainer" value="${esc(c.trainer || "Équipe pédagogique Intellia Kin")}"></label>
        <label class="field"><span>Note pour réussir l'examen (%)</span><input name="exam_pass_score" type="number" min="0" max="100" value="${c.exam_pass_score ?? 70}"></label>
      </div>
    </fieldset>`;
}

function coursePayload(form) {
  const raw = formData(form);
  const list = (value) => (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    ...raw,
    cover_image: raw.cover_image || null,
    duration_minutes: Number(raw.duration_minutes || 60),
    position: Number(raw.position || 100),
    exam_pass_score: Number(raw.exam_pass_score || 70),
    objectives: list(raw.objectives),
    skills: list(raw.skills),
  };
}

export async function courseForm(root) {
  const box = shell(root, "cours", "Nouveau cours", `<form data-course class="form-stack admin-form">${courseFields()}
    <div class="form-actions"><button class="ik-bouton" type="submit">Créer le cours</button></div></form>`);
  box.querySelector("[data-course]").addEventListener("submit", (event) => {
    event.preventDefault();
    withBusy(event.submitter, async () => {
      const course = await api("/admin/courses", { method: "POST", body: coursePayload(event.currentTarget) });
      toast("Cours créé. Ajoutez maintenant ses modules et ses leçons.", "success");
      navigate(`/cours/${course.id}`);
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Éditeur de cours -------------------------------------------------------------

export async function courseEditor(root, { id }) {
  const box = shell(root, "cours", "Cours", loading());
  const c = await api(`/admin/courses/${id}`);
  const locked = c.source === "depot";
  document.querySelector(".control-main h1").textContent = c.title;
  const lessonCount = c.modules.reduce((n, m) => n + m.lessons.length, 0);

  box.innerHTML = `${readOnlyNotice(c)}
    <div class="editor-bar">
      ${badge(c.status === "published" ? "Publié" : c.status === "archived" ? "Archivé" : "Brouillon", c.status === "published" ? "success" : "neutral")}
      <span class="small">${lessonCount} leçons · ${(c.exam.questions || []).length} questions d'examen · ${duration(c.duration_minutes)}</span>
      <a class="ik-bouton ik-bouton-secondaire ik-bouton-petit" href="${PUBLIC_SITE}/cours/${esc(c.slug)}" target="_blank" rel="noopener">Voir sur l'Académie ↗</a>
      ${
        locked
          ? ""
          : `${c.status === "published" ? '<button class="ik-bouton ik-bouton-secondaire ik-bouton-petit" data-do="unpublish">Repasser en brouillon</button>' : '<button class="ik-bouton ik-bouton-petit" data-do="publish">Publier</button>'}
             ${c.status !== "archived" ? '<button class="ik-bouton ik-bouton-secondaire ik-bouton-petit" data-do="archive">Archiver</button>' : ""}
             <button class="ik-bouton ik-bouton-danger ik-bouton-petit" data-do="delete">Supprimer</button>`
      }
    </div>

    <section class="panel">
      <h2>Programme</h2>
      <ol class="editor-modules">${c.modules
        .map(
          (m, mi) => `<li class="editor-module" data-module="${m.id}">
            <div class="row"><strong>Module ${mi + 1} · ${esc(m.title)}</strong>
              ${locked ? "" : `<span class="row-actions">
                <button class="icon-button" data-module-move="-1" title="Monter" ${mi === 0 ? "disabled" : ""}>↑</button>
                <button class="icon-button" data-module-move="1" title="Descendre" ${mi === c.modules.length - 1 ? "disabled" : ""}>↓</button>
                <button class="icon-button" data-module-rename title="Renommer">✎</button>
                <button class="icon-button danger" data-module-delete title="Supprimer">✕</button></span>`}
            </div>
            <ol class="editor-lessons">${m.lessons
              .map(
                (l, li) => `<li data-lesson="${l.id}"><a href="#/lecons/${l.id}">${esc(l.title)}</a>
                  <span class="small">${l.blocks.length} bloc(s) · ${l.duration_minutes} min${l.is_preview ? " · aperçu" : ""}</span>
                  ${locked ? "" : `<span class="row-actions">
                    <button class="icon-button" data-lesson-move="-1" ${li === 0 ? "disabled" : ""}>↑</button>
                    <button class="icon-button" data-lesson-move="1" ${li === m.lessons.length - 1 ? "disabled" : ""}>↓</button>
                    <button class="icon-button danger" data-lesson-delete>✕</button></span>`}
                </li>`
              )
              .join("")}</ol>
            ${locked ? "" : `<form class="inline-form" data-add-lesson><input name="title" placeholder="Titre de la nouvelle leçon" required><button class="ik-bouton ik-bouton-secondaire ik-bouton-petit">Ajouter la leçon</button></form>`}
          </li>`
        )
        .join("")}</ol>
      ${locked ? "" : `<form class="inline-form" data-add-module><input name="title" placeholder="Titre du nouveau module" required><button class="ik-bouton ik-bouton-petit">Ajouter le module</button></form>`}
    </section>

    <section class="panel">
      <h2>Examen final</h2>
      ${QUESTION_HELP}
      <form data-exam class="form-stack">
        <textarea name="questions" rows="14" class="mono" ${locked ? "readonly" : ""} placeholder="? Votre question\n+ Bonne réponse\n- Mauvaise réponse\n> Explication">${esc(questionsToText(c.exam.questions))}</textarea>
        ${locked ? "" : '<div class="form-actions"><button class="ik-bouton" type="submit">Enregistrer l\'examen</button></div>'}
      </form>
    </section>

    <details class="panel"><summary><h2 class="inline">Fiche du cours</h2></summary>
      <form data-course class="form-stack admin-form">${courseFields(c)}
        ${locked ? "" : '<div class="form-actions"><button class="ik-bouton" type="submit">Enregistrer la fiche</button></div>'}
      </form>
    </details>`;

  if (locked) {
    box.querySelectorAll("[data-course] input, [data-course] textarea, [data-course] select").forEach((el) => (el.disabled = true));
    return;
  }
  const reload = () => navigate(`/cours/${id}`, { force: true });
  const run = (button, task, message) =>
    withBusy(button, async () => {
      await task();
      if (message) toast(message, "success");
      reload();
    }).catch((error) => toast(error.message, "error"));

  box.querySelectorAll("[data-do]").forEach((button) =>
    button.addEventListener("click", () => {
      const action = button.dataset.do;
      if (action === "delete") {
        if (!confirm("Supprimer définitivement ce cours ?")) return;
        return withBusy(button, async () => {
          await api(`/admin/courses/${id}`, { method: "DELETE" });
          toast("Cours supprimé.", "success");
          navigate("/cours");
        }).catch((error) => toast(error.message, "error"));
      }
      const labels = { publish: "Cours publié.", unpublish: "Cours repassé en brouillon.", archive: "Cours archivé." };
      run(button, () => api(`/admin/courses/${id}/${action}`, { method: "POST" }), labels[action]);
    })
  );

  box.querySelector("[data-add-module]").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = event.currentTarget.title.value.trim();
    run(event.submitter, () => api(`/admin/courses/${id}/modules`, { method: "POST", body: { title } }), "Module ajouté.");
  });

  box.querySelectorAll("[data-module]").forEach((item) => {
    const moduleId = item.dataset.module;
    const index = c.modules.findIndex((m) => m.id === moduleId);
    item.querySelector("[data-add-lesson]").addEventListener("submit", (event) => {
      event.preventDefault();
      const title = event.currentTarget.title.value.trim();
      withBusy(event.submitter, async () => {
        const lesson = await api(`/admin/modules/${moduleId}/lessons`, { method: "POST", body: { title } });
        navigate(`/lecons/${lesson.id}`);
      }).catch((error) => toast(error.message, "error"));
    });
    item.querySelector("[data-module-rename]").addEventListener("click", (event) => {
      const title = prompt("Nouveau titre du module", c.modules[index].title);
      if (title) run(event.currentTarget, () => api(`/admin/modules/${moduleId}`, { method: "PATCH", body: { title } }));
    });
    item.querySelector("[data-module-delete]").addEventListener("click", (event) => {
      if (confirm("Supprimer ce module et toutes ses leçons ?"))
        run(event.currentTarget, () => api(`/admin/modules/${moduleId}`, { method: "DELETE" }), "Module supprimé.");
    });
    item.querySelectorAll("[data-module-move]").forEach((button) =>
      button.addEventListener("click", () => {
        const ids = c.modules.map((m) => m.id);
        const to = index + Number(button.dataset.moduleMove);
        [ids[index], ids[to]] = [ids[to], ids[index]];
        run(button, () => api(`/admin/courses/${id}/modules/reorder`, { method: "POST", body: { ids } }));
      })
    );
    item.querySelectorAll("[data-lesson]").forEach((row) => {
      const lessonId = row.dataset.lesson;
      const lessons = c.modules[index].lessons;
      const li = lessons.findIndex((l) => l.id === lessonId);
      row.querySelector("[data-lesson-delete]").addEventListener("click", (event) => {
        if (confirm("Supprimer cette leçon ?"))
          run(event.currentTarget, () => api(`/admin/lessons/${lessonId}`, { method: "DELETE" }), "Leçon supprimée.");
      });
      row.querySelectorAll("[data-lesson-move]").forEach((button) =>
        button.addEventListener("click", () => {
          const ids = lessons.map((l) => l.id);
          const to = li + Number(button.dataset.lessonMove);
          [ids[li], ids[to]] = [ids[to], ids[li]];
          run(button, () => api(`/admin/modules/${moduleId}/lessons/reorder`, { method: "POST", body: { ids } }));
        })
      );
    });
  });

  box.querySelector("[data-exam]").addEventListener("submit", (event) => {
    event.preventDefault();
    let questions;
    try {
      questions = textToQuestions(event.currentTarget.questions.value);
    } catch (error) {
      return toast(error.message, "error");
    }
    if (!questions.length) return toast("Ajoutez au moins une question.", "error");
    run(event.submitter, () => api(`/admin/courses/${id}/exam`, { method: "PUT", body: { questions } }), `Examen enregistré (${questions.length} questions).`);
  });

  box.querySelector("[data-course]").addEventListener("submit", (event) => {
    event.preventDefault();
    run(event.submitter, () => api(`/admin/courses/${id}`, { method: "PATCH", body: coursePayload(event.currentTarget) }), "Fiche enregistrée.");
  });
}

// --- Éditeur de leçon ---------------------------------------------------------------

const BLOCK_TYPES = {
  text: "Texte",
  image: "Image",
  callout: "Encadré",
  video: "Vidéo",
  quiz: "Quiz",
  table: "Tableau",
  code: "Code ou prompt",
  pdf: "Document PDF",
  slides: "Diaporama",
  file: "Fichier à télécharger",
  audio: "Audio",
  embed: "Contenu intégré",
  tool_exercise: "Exercice avec un outil",
  case_study: "Étude de cas",
  live_session: "Séance en direct",
};
const CALLOUTS = { tip: "À retenir", info: "À savoir", warning: "Attention", exercise: "À vous de jouer" };
const TOOLS = {
  "cv-lettre": "CV et lettre de motivation",
  "assistant-redaction": "Assistant de rédaction",
  "plan-affaires": "Plan d'affaires",
  "generateur-publications": "Générateur de publications",
  "simulateur-entretien": "Simulateur d'entretien",
  "coach-memoire": "Coach de mémoire",
  "calculateur-prix-marge": "Calculateur de prix et de marge",
  "tests-recrutement": "Tests de recrutement",
  "bibliotheque-prompts": "Bibliothèque de prompts",
  "diagnostic-ia": "Diagnostic IA",
};

const input = (name, label, value = "", attrs = "") =>
  `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value ?? "")}" ${attrs}></label>`;
const area = (name, label, value = "", rows = 8, attrs = "") =>
  `<label class="field"><span>${label}</span><textarea name="${name}" rows="${rows}" ${attrs}>${esc(value ?? "")}</textarea></label>`;

function blockFields(type, d = {}) {
  switch (type) {
    case "text":
      return area("markdown", "Texte (Markdown : ## titre, **gras**, - liste, ![légende](https://…image))", d.markdown, 12, 'class="mono"');
    case "callout":
      return `<div class="form-grid"><label class="field"><span>Type d'encadré</span>${select("variant", CALLOUTS, d.variant || "tip")}</label>${input("title", "Titre (facultatif)", d.title)}</div>${area("markdown", "Contenu", d.markdown, 5)}`;
    case "image":
      return input("url", "Adresse de l'image (https://…)", d.url, 'type="url" required') + input("alt", "Description de l'image (pour l'accessibilité)", d.alt, "required") + input("caption", "Légende (facultatif)", d.caption);
    case "video":
      return input("url", "Lien de la vidéo (YouTube ou https://…)", d.url, 'type="url" required') + input("title", "Titre (facultatif)", d.title);
    case "audio":
      return input("url", "Lien du fichier audio (https://…)", d.url, 'type="url" required') + input("title", "Titre (facultatif)", d.title);
    case "pdf":
    case "slides":
      return input("url", "Lien du document (https://…)", d.url, 'type="url" required') + input("title", "Titre", d.title, "required");
    case "file":
      return input("url", "Lien du fichier (https://…)", d.url, 'type="url" required') + input("filename", "Nom affiché", d.filename, "required");
    case "embed":
      return input("url", "Adresse à intégrer (https://…)", d.url, 'type="url" required') + input("title", "Titre", d.title, "required");
    case "code":
      return input("language", "Langage (ou « text » pour un prompt)", d.language || "text") + area("code", "Contenu", d.code, 8, 'class="mono"');
    case "table":
      return input("headers", "En-têtes, séparés par « | »", (d.headers || []).join(" | ")) + area("rows", "Lignes : une ligne par rangée, cellules séparées par « | »", (d.rows || []).map((r) => r.join(" | ")).join("\n"), 6) + input("caption", "Légende (facultatif)", d.caption);
    case "quiz":
      return QUESTION_HELP + area("questions", "Questions", questionsToText(d.questions), 10, 'class="mono"');
    case "tool_exercise":
      return `<label class="field"><span>Outil</span>${select("tool_slug", TOOLS, d.tool_slug || "assistant-redaction")}</label>` + area("instructions", "Consigne", d.instructions, 4);
    case "case_study":
      return input("title", "Titre", d.title, "required") + area("markdown", "Situation (Markdown)", d.markdown, 6) + area("questions", "Questions (une par ligne)", (d.questions || []).join("\n"), 4);
    case "live_session":
      return input("title", "Titre", d.title, "required") + input("starts_at", "Début (date et heure)", d.starts_at ? d.starts_at.slice(0, 16) : "", 'type="datetime-local" required') + input("duration_minutes", "Durée (minutes)", d.duration_minutes || 60, 'type="number" min="5"') + input("join_url", "Lien de visioconférence", d.join_url, 'type="url"') + input("location", "Ou lieu", d.location);
    default:
      return area("json", "Contenu (JSON)", JSON.stringify(d, null, 2), 10, 'class="mono"');
  }
}

function blockData(type, form) {
  const v = formData(form);
  const split = (s) => (s || "").split("|").map((x) => x.trim());
  switch (type) {
    case "quiz":
      return { questions: textToQuestions(form.questions.value) };
    case "table":
      return { headers: split(v.headers), rows: (v.rows || "").split("\n").filter((l) => l.trim()).map(split), ...(v.caption ? { caption: v.caption } : {}) };
    case "case_study":
      return { title: v.title, markdown: v.markdown, questions: (v.questions || "").split("\n").map((q) => q.trim()).filter(Boolean) };
    case "live_session":
      return { ...v, starts_at: new Date(v.starts_at).toISOString(), duration_minutes: Number(v.duration_minutes || 60) };
    case "video":
      return { ...v, source: "link" };
    case "text":
    case "callout":
      return { ...v, markdown: form.markdown.value };
    case "code":
      return { ...v, code: form.code.value };
    default:
      return v.json !== undefined ? JSON.parse(v.json) : v;
  }
}

function blockPreview(block) {
  const d = block.data;
  if (block.type === "text") return `<div class="prose small-prose">${renderMarkdown(d.markdown.slice(0, 600))}${d.markdown.length > 600 ? "<p>…</p>" : ""}</div>`;
  if (block.type === "callout") return `<p><strong>${esc(d.title || CALLOUTS[d.variant])}</strong> — ${esc(d.markdown.slice(0, 160))}</p>`;
  if (block.type === "quiz") return `<p>${d.questions.length} question(s) : ${esc(d.questions[0].prompt)}</p>`;
  if (block.type === "image") return `<img src="${esc(d.url)}" alt="${esc(d.alt)}" class="thumb">`;
  return `<p class="small">${esc(d.title || d.url || d.filename || d.instructions || "")}</p>`;
}

export async function lessonEditor(root, { id }) {
  const box = shell(root, "cours", "Leçon", loading());
  const lesson = await api(`/admin/lessons/${id}`);
  const course = { id: lesson.course_id, title: lesson.course_title, source: lesson.course_source, slug: "" };
  const locked = course.source === "depot";
  document.querySelector(".control-main h1").textContent = lesson.title;

  box.innerHTML = `<p><a href="#/cours/${course.id}">← ${esc(course.title)}</a></p>
    ${course.source === "depot" ? '<div class="notice notice-info"><p>Cette leçon appartient à un cours rédigé dans le dépôt GitHub : elle se modifie là-bas.</p></div>' : ""}
    <form data-lesson class="panel form-stack">
      <div class="form-grid">
        ${input("title", "Titre de la leçon", lesson.title, "required")}
        ${input("duration_minutes", "Durée (minutes)", lesson.duration_minutes, 'type="number" min="1"')}
      </div>
      ${input("objective", "Objectif de la leçon (une phrase)", lesson.objective)}
      <label class="checkbox"><input type="checkbox" name="is_preview" ${lesson.is_preview ? "checked" : ""}> Leçon d'aperçu (lisible avant l'inscription au cours)</label>
      ${locked ? "" : '<div class="form-actions"><button class="ik-bouton ik-bouton-secondaire" type="submit">Enregistrer</button></div>'}
    </form>
    <h2>Contenu</h2>
    <ol class="blocks">${lesson.blocks
      .map(
        (b, i) => `<li class="block-card" data-block="${b.id}">
          <div class="row"><strong>${esc(BLOCK_TYPES[b.type] || b.type)}</strong>
            ${locked ? "" : `<span class="row-actions">
              <button class="icon-button" data-move="-1" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-button" data-move="1" ${i === lesson.blocks.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-button" data-edit>✎</button>
              <button class="icon-button danger" data-delete>✕</button></span>`}
          </div>
          <div class="block-preview">${blockPreview(b)}</div>
          <form class="block-form form-stack" hidden>${blockFields(b.type, b.data)}<div class="form-actions"><button class="ik-bouton ik-bouton-petit" type="submit">Enregistrer le bloc</button><button class="ik-bouton ik-bouton-secondaire ik-bouton-petit" type="button" data-cancel>Annuler</button></div></form>
        </li>`
      )
      .join("") || '<p class="empty">Cette leçon est vide. Ajoutez un premier bloc ci-dessous.</p>'}</ol>
    ${
      locked
        ? ""
        : `<section class="panel"><h2>Ajouter un bloc</h2>
          <label class="field"><span>Type de contenu</span>${select("new-type", BLOCK_TYPES, "text")}</label>
          <form data-new class="form-stack">${blockFields("text")}<div class="form-actions"><button class="ik-bouton" type="submit">Ajouter</button></div></form>
        </section>`
    }`;
  if (locked) return;

  const reload = () => navigate(`/lecons/${id}`, { force: true });
  const fail = (error) => toast(error instanceof SyntaxError ? "Le contenu JSON est invalide." : error.message, "error");

  box.querySelector("[data-lesson]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = { title: form.title.value.trim(), objective: form.objective.value.trim(), duration_minutes: Number(form.duration_minutes.value || 10), is_preview: form.is_preview.checked };
    withBusy(event.submitter, async () => {
      await api(`/admin/lessons/${id}`, { method: "PATCH", body });
      toast("Leçon enregistrée.", "success");
      reload();
    }).catch(fail);
  });

  const typeSelect = box.querySelector('select[name="new-type"]');
  const newForm = box.querySelector("[data-new]");
  typeSelect.addEventListener("change", () => {
    newForm.innerHTML = `${blockFields(typeSelect.value)}<div class="form-actions"><button class="ik-bouton" type="submit">Ajouter</button></div>`;
  });
  newForm.addEventListener("submit", (event) => {
    event.preventDefault();
    withBusy(event.submitter, async () => {
      await api(`/admin/lessons/${id}/blocks`, { method: "POST", body: { type: typeSelect.value, data: blockData(typeSelect.value, newForm) } });
      toast("Bloc ajouté.", "success");
      reload();
    }).catch(fail);
  });

  box.querySelectorAll("[data-block]").forEach((card, index) => {
    const block = lesson.blocks[index];
    const form = card.querySelector(".block-form");
    card.querySelector("[data-edit]").addEventListener("click", () => {
      form.hidden = false;
      card.querySelector(".block-preview").hidden = true;
    });
    card.querySelector("[data-cancel]").addEventListener("click", () => {
      form.hidden = true;
      card.querySelector(".block-preview").hidden = false;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      withBusy(event.submitter, async () => {
        await api(`/admin/blocks/${block.id}`, { method: "PUT", body: { data: blockData(block.type, form) } });
        toast("Bloc enregistré.", "success");
        reload();
      }).catch(fail);
    });
    card.querySelector("[data-delete]").addEventListener("click", (event) => {
      if (!confirm("Supprimer ce bloc ?")) return;
      withBusy(event.currentTarget, async () => {
        await api(`/admin/blocks/${block.id}`, { method: "DELETE" });
        reload();
      }).catch(fail);
    });
    card.querySelectorAll("[data-move]").forEach((button) =>
      button.addEventListener("click", () => {
        const ids = lesson.blocks.map((b) => b.id);
        const to = index + Number(button.dataset.move);
        [ids[index], ids[to]] = [ids[to], ids[index]];
        withBusy(button, async () => {
          await api(`/admin/lessons/${id}/blocks/reorder`, { method: "POST", body: { ids } });
          reload();
        }).catch(fail);
      })
    );
  });
}
