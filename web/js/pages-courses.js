// Catalogue, fiche de cours, lecteur de leçon, examen et attestation.

import { api, ApiError, mediaUrl, session } from "./api.js";
import { renderMarkdown } from "./md.js";
import {
  LABELS,
  PARCOURS_ORDER,
  badge,
  duration,
  errorBox,
  esc,
  formatDate,
  icon,
  loading,
  setTitle,
  shareLinks,
  toast,
  withBusy,
} from "./ui.js";

// --- Données communes -------------------------------------------------------

async function loadProgress(slug) {
  if (!session.token) return null;
  try {
    return await api(`/courses/${slug}/progress`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) return null;
    throw error;
  }
}

function lessonsOf(course) {
  return course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.title })));
}

function nextStep(course, progress) {
  const lessons = lessonsOf(course);
  if (!progress) return null;
  const done = new Set(progress.completed_lesson_ids);
  const next = lessons.find((l) => !done.has(l.id));
  if (next) return { label: progress.completed_lessons ? "Continuer le cours" : "Commencer le cours", href: `/cours/${course.slug}/lecon/${next.id}` };
  if (progress.certificate_number) return { label: "Voir mon attestation", href: `/attestation/${progress.certificate_number}` };
  if (course.exam_question_count) return { label: progress.exam_passed ? "Obtenir mon attestation" : "Passer l'examen final", href: `/cours/${course.slug}/examen` };
  return null;
}

export function courseCard(course) {
  return `<a class="course-card" href="/cours/${esc(course.slug)}">
    <div class="course-cover">${
      course.cover_image ? `<img src="${esc(mediaUrl(course.cover_image))}" alt="" loading="lazy">` : ""
    }</div>
    <div class="course-body">
      <div class="badges">${badge(LABELS.level[course.level] || course.level, course.level)}${badge(duration(course.duration_minutes), "neutral")}</div>
      <h3>${esc(course.title)}</h3>
      <p>${esc(course.summary)}</p>
      <span class="card-link">Découvrir le cours ${icon("arrow")}</span>
    </div>
  </a>`;
}

// --- Catalogue --------------------------------------------------------------

export async function catalogue(root) {
  setTitle("Les cours", "20 cours gratuits sur l'intelligence artificielle, avec attestation de réussite.");
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  const params = new URLSearchParams(location.search);
  const audience = params.get("public") || "";
  const list = await api(`/courses${audience ? `?audience=${encodeURIComponent(audience)}` : ""}`, { auth: false });
  const groups = PARCOURS_ORDER.map((p) => [p, list.filter((c) => c.parcours === p)]).filter(([, c]) => c.length);
  const filters = [["", "Tous les cours"], ["jeune_diplome", "Jeunes diplômés"], ["entrepreneur", "Entrepreneurs"], ["pme", "Organisations"]];
  root.innerHTML = `<section class="page">
    <div class="container">
      <header class="page-header">
        <p class="eyebrow">Gratuit · Attestation de réussite</p>
        <h1>Les cours de l'Académie</h1>
        <p class="lead">Des cours courts et concrets pour comprendre l'IA et l'utiliser dans votre métier, à votre rythme, même avec une petite connexion.</p>
      </header>
      <nav class="chips" aria-label="Filtrer par public">${filters
        .map(([value, label]) => `<a class="chip ${value === audience ? "active" : ""}" href="/cours${value ? `?public=${value}` : ""}">${label}</a>`)
        .join("")}</nav>
      ${
        groups.length
          ? groups
              .map(
                ([p, courses]) => `<section class="course-group" id="${p}">
                  <h2>${esc(LABELS.parcours[p])} <span class="count">${courses.length} cours</span></h2>
                  <div class="course-grid">${courses.map(courseCard).join("")}</div>
                </section>`
              )
              .join("")
          : '<p class="empty">Les premiers cours arrivent très bientôt.</p>'
      }
    </div>
  </section>`;
}

// --- Fiche d'un cours -------------------------------------------------------

export async function coursePage(root, { slug }, { navigate }) {
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  const [course, progress] = await Promise.all([api(`/courses/${slug}`, { auth: false }), loadProgress(slug)]);
  setTitle(course.title, course.summary);
  const done = new Set(progress?.completed_lesson_ids || []);
  const lessons = lessonsOf(course);
  const step = nextStep(course, progress);
  const firstPreview = lessons.find((l) => l.is_preview);

  let cta;
  if (!session.user) {
    cta = `<a class="ik-bouton" href="/inscription?suite=${encodeURIComponent(`/cours/${slug}`)}">Créer un compte gratuit pour commencer</a>
      ${firstPreview ? `<a class="ik-bouton ik-bouton-secondaire" href="/cours/${slug}/lecon/${firstPreview.id}">Lire la leçon d'aperçu</a>` : ""}
      <p class="small">Déjà inscrit ? <a href="/connexion?suite=${encodeURIComponent(`/cours/${slug}`)}">Connectez-vous</a>.</p>`;
  } else if (!progress) {
    cta = '<button class="ik-bouton" data-enroll>S\'inscrire gratuitement</button>';
  } else {
    cta = `<div class="progress-box">
        <div class="progress-bar" role="progressbar" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div>
        <p>${progress.completed_lessons} leçon${progress.completed_lessons > 1 ? "s" : ""} sur ${progress.total_lessons} · ${progress.percent} %</p>
      </div>
      ${step ? `<a class="ik-bouton" href="${step.href}">${esc(step.label)}</a>` : ""}`;
  }

  root.innerHTML = `<article class="page course-page">
    <header class="course-hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow"><a href="/cours">Cours</a> · ${esc(LABELS.parcours[course.parcours] || "")}</p>
          <h1>${esc(course.title)}</h1>
          <p class="lead">${esc(course.summary)}</p>
          <ul class="facts">
            <li>${icon("clock")} ${duration(course.duration_minutes)}</li>
            <li>${icon("spark")} ${esc(LABELS.level[course.level] || course.level)}</li>
            <li>${icon("book")} ${lessons.length} leçons</li>
            <li>${icon("award")} Attestation de réussite</li>
          </ul>
          <div class="cta">${cta}</div>
        </div>
        ${course.cover_image ? `<img class="hero-image" src="${esc(mediaUrl(course.cover_image))}" alt="">` : ""}
      </div>
    </header>
    <div class="container course-layout">
      <div class="course-main">
        ${course.objectives.length ? `<section class="panel"><h2>Ce que vous allez apprendre</h2><ul class="checklist">${course.objectives.map((o) => `<li>${icon("check")}<span>${esc(o)}</span></li>`).join("")}</ul></section>` : ""}
        ${course.description ? `<section class="prose">${renderMarkdown(course.description)}</section>` : ""}
        <section>
          <h2>Programme</h2>
          <ol class="outline">${course.modules
            .map(
              (m, mi) => `<li class="outline-module">
                <h3><span class="module-number">Module ${mi + 1}</span> ${esc(m.title)}</h3>
                <ol>${m.lessons
                  .map((l) => {
                    const open = l.is_preview || progress || session.isAdmin;
                    const state = done.has(l.id) ? `<span class="done">${icon("check")}<span class="sr-only">Terminée</span></span>` : open ? "" : icon("lock");
                    const label = `<span>${esc(l.title)}</span><span class="meta">${l.is_preview && !progress ? "Aperçu · " : ""}${l.duration_minutes} min</span>`;
                    return `<li>${open ? `<a href="/cours/${slug}/lecon/${l.id}">${label}</a>` : `<span class="locked">${label}</span>`}${state}</li>`;
                  })
                  .join("")}</ol>
              </li>`
            )
            .join("")}
            ${course.exam_question_count ? `<li class="outline-module"><h3><span class="module-number">Fin de cours</span> Examen final</h3><p class="small">${course.exam_question_count} questions · ${course.exam_pass_score} % pour réussir · 3 tentatives par jour</p></li>` : ""}
          </ol>
        </section>
      </div>
      <aside class="course-aside">
        ${course.skills.length ? `<section class="panel"><h2>Compétences attestées</h2><ul class="skills">${course.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}
        <section class="panel">
          <h2>En bref</h2>
          <dl class="facts-list">
            <dt>Public</dt><dd>${esc(LABELS.audience[course.audience] || course.audience)}</dd>
            <dt>Prérequis</dt><dd>${esc(course.prerequisites)}</dd>
            <dt>Formateur</dt><dd>${esc(course.trainer)}</dd>
            <dt>Format</dt><dd>En ligne, à votre rythme</dd>
          </dl>
        </section>
      </aside>
    </div>
  </article>`;

  root.querySelector("[data-enroll]")?.addEventListener("click", (event) =>
    withBusy(event.currentTarget, async () => {
      await api(`/courses/${slug}/enroll`, { method: "POST" });
      toast("Inscription confirmée. Bonne formation !", "success");
      navigate(`/cours/${slug}/lecon/${lessons[0].id}`);
    }).catch((error) => toast(error.message, "error"))
  );
}

// --- Blocs de contenu -------------------------------------------------------

function youtubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const CALLOUT_ICONS = { tip: "spark", info: "book", warning: "lock", exercise: "tool" };

function renderBlock(block) {
  const d = block.data;
  switch (block.type) {
    case "text":
      return `<div class="prose">${renderMarkdown(d.markdown)}</div>`;
    case "callout":
      return `<aside class="callout callout-${d.variant}"><p class="callout-title">${icon(CALLOUT_ICONS[d.variant] || "book")} ${esc(d.title || "")}</p><div class="prose">${renderMarkdown(d.markdown)}</div></aside>`;
    case "image":
      return `<figure class="md-figure"><img src="${esc(mediaUrl(d.url))}" alt="${esc(d.alt)}" loading="lazy">${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ""}</figure>`;
    case "gallery":
      return `<div class="gallery">${d.images.map((img) => `<figure><img src="${esc(mediaUrl(img.url))}" alt="${esc(img.alt)}" loading="lazy">${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`;
    case "table":
      return `<div class="md-table"><table>${d.caption ? `<caption>${esc(d.caption)}</caption>` : ""}<thead><tr>${d.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${d.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "code":
      return `<pre class="code"><code>${esc(d.code)}</code></pre>`;
    case "video": {
      const id = youtubeId(d.url);
      return id
        ? `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(d.title || "Vidéo")}" loading="lazy" allowfullscreen></iframe></div>`
        : `<p><a class="ik-bouton ik-bouton-secondaire" href="${esc(mediaUrl(d.url))}" target="_blank" rel="noopener">Voir la vidéo</a></p>`;
    }
    case "audio":
      return `<audio controls preload="none" src="${esc(mediaUrl(d.url))}"></audio>`;
    case "pdf":
    case "slides":
    case "file":
      return `<p><a class="file-link" href="${esc(mediaUrl(d.url))}" target="_blank" rel="noopener">${icon("book")} ${esc(d.title || d.filename || "Télécharger")}</a></p>`;
    case "embed":
      return `<div class="video"><iframe src="${esc(d.url)}" title="${esc(d.title)}" loading="lazy"></iframe></div>`;
    case "quiz":
      return quizBlock(block);
    case "case_study":
      return `<aside class="callout callout-exercise"><p class="callout-title">${icon("tool")} ${esc(d.title)}</p><div class="prose">${renderMarkdown(d.markdown)}</div>${d.questions?.length ? `<ol>${d.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>` : ""}</aside>`;
    case "tool_exercise":
      return `<aside class="callout callout-exercise"><p class="callout-title">${icon("tool")} Mise en pratique</p><div class="prose">${renderMarkdown(d.instructions)}</div><a class="ik-bouton ik-bouton-petit" href="/outils/${esc(d.tool_slug)}">Ouvrir l'outil</a></aside>`;
    case "live_session":
      return `<aside class="callout callout-info"><p class="callout-title">${icon("calendar")} ${esc(d.title)}</p><p>${formatDate(d.starts_at, true)} · ${d.duration_minutes} min</p>${d.join_url ? `<a href="${esc(d.join_url)}" target="_blank" rel="noopener">Rejoindre la séance</a>` : esc(d.location || "")}</aside>`;
    default:
      return "";
  }
}

function questionsForm(questions, name) {
  return questions
    .map((q, qi) => {
      const multiple = q.kind === "multiple";
      return `<fieldset class="question" data-index="${qi}">
        <legend><span class="q-number">${qi + 1}.</span> ${esc(q.prompt)}${multiple ? ' <span class="small">(plusieurs réponses possibles)</span>' : ""}</legend>
        ${q.options
          .map(
            (o, oi) => `<label class="option"><input type="${multiple ? "checkbox" : "radio"}" name="${name}-${qi}" value="${oi}"> <span>${esc(o.text)}</span></label>`
          )
          .join("")}
        <div class="feedback" aria-live="polite"></div>
      </fieldset>`;
    })
    .join("");
}

function collectAnswers(form, count, name) {
  return Array.from({ length: count }, (_, qi) =>
    [...form.querySelectorAll(`input[name="${name}-${qi}"]:checked`)].map((input) => Number(input.value))
  );
}

function quizBlock(block) {
  return `<section class="quiz" data-quiz="${block.id}" data-count="${block.data.questions.length}">
    <h2 class="quiz-title">${icon("check")} Testez-vous</h2>
    <form>${questionsForm(block.data.questions, `q${block.id}`)}
      <div class="quiz-actions"><button class="ik-bouton ik-bouton-secondaire" type="submit">Vérifier mes réponses</button><span class="quiz-score" aria-live="polite"></span></div>
    </form>
  </section>`;
}

function bindQuizzes(root, slug, lessonId) {
  root.querySelectorAll("[data-quiz]").forEach((section) => {
    const form = section.querySelector("form");
    const id = section.dataset.quiz;
    const count = Number(section.dataset.count);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const answers = collectAnswers(form, count, `q${id}`);
      if (answers.some((a) => !a.length)) {
        toast("Répondez à toutes les questions avant de vérifier.", "info");
        return;
      }
      withBusy(form.querySelector("button"), async () => {
        const result = await api(`/courses/${slug}/lessons/${lessonId}/blocks/${id}/check`, {
          method: "POST",
          body: { answers },
        });
        result.results.forEach((r, qi) => {
          const fieldset = form.querySelector(`fieldset[data-index="${qi}"]`);
          fieldset.classList.toggle("is-correct", r.correct);
          fieldset.classList.toggle("is-wrong", !r.correct);
          fieldset.querySelectorAll(".option").forEach((label, oi) => label.classList.toggle("is-answer", r.correct_options.includes(oi)));
          fieldset.querySelector(".feedback").innerHTML = `<strong>${r.correct ? "Bonne réponse." : "Pas tout à fait."}</strong> ${r.explanation ? esc(r.explanation) : ""}`;
        });
        section.querySelector(".quiz-score").textContent = `Score : ${result.score} %`;
      }).catch((error) => toast(error.message, "error"));
    });
  });
}

// --- Lecteur de leçon -------------------------------------------------------

export async function lessonPage(root, { slug, lessonId }, { navigate }) {
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  let course, lesson, progress;
  try {
    [course, lesson, progress] = await Promise.all([
      api(`/courses/${slug}`, { auth: false }),
      api(`/courses/${slug}/lessons/${lessonId}`),
      loadProgress(slug),
    ]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      const target = error.status === 401 ? `/connexion?suite=${encodeURIComponent(location.pathname)}` : `/cours/${slug}`;
      toast(error.message, "info");
      navigate(target, { replace: true });
      return;
    }
    throw error;
  }
  setTitle(`${lesson.title} · ${course.title}`);
  const lessons = lessonsOf(course);
  const index = lessons.findIndex((l) => l.id === lessonId);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const done = new Set(progress?.completed_lesson_ids || []);

  root.innerHTML = `<div class="lesson-layout">
    <aside class="lesson-nav" aria-label="Programme du cours">
      <a class="back" href="/cours/${slug}">← ${esc(course.title)}</a>
      ${progress ? `<div class="progress-bar small-bar"><span style="width:${progress.percent}%"></span></div><p class="small">${progress.percent} % terminé</p>` : ""}
      <details class="lesson-outline" ${window.innerWidth > 900 ? "open" : ""}><summary>Programme du cours</summary>
      <ol>${course.modules
        .map(
          (m) => `<li><p class="nav-module">${esc(m.title)}</p><ol>${m.lessons
            .map((l) => `<li class="${l.id === lessonId ? "current" : ""} ${done.has(l.id) ? "done" : ""}"><a href="/cours/${slug}/lecon/${l.id}">${done.has(l.id) ? icon("check") : ""}${esc(l.title)}</a></li>`)
            .join("")}</ol></li>`
        )
        .join("")}
        ${course.exam_question_count ? `<li><p class="nav-module">Fin de cours</p><ol><li><a href="/cours/${slug}/examen">${icon("award")} Examen final</a></li></ol></li>` : ""}
      </ol></details>
    </aside>
    <article class="lesson">
      <p class="eyebrow">Leçon ${index + 1} sur ${lessons.length} · ${esc(lessons[index]?.module || "")}</p>
      <h1>${esc(lesson.title)}</h1>
      <p class="lesson-meta">${icon("clock")} ${lesson.duration_minutes} min de lecture</p>
      ${lesson.objective ? `<p class="objective"><strong>Objectif :</strong> ${esc(lesson.objective)}</p>` : ""}
      ${lesson.blocks.map(renderBlock).join("\n")}
      <footer class="lesson-footer">
        ${previous ? `<a class="ik-bouton ik-bouton-secondaire" href="/cours/${slug}/lecon/${previous.id}">← Précédente</a>` : "<span></span>"}
        ${
          progress
            ? `<button class="ik-bouton" data-complete>${done.has(lessonId) ? "Leçon suivante" : "J'ai terminé cette leçon"} →</button>`
            : session.user
              ? `<a class="ik-bouton" href="/cours/${slug}">S'inscrire pour continuer</a>`
              : `<a class="ik-bouton" href="/inscription?suite=${encodeURIComponent(`/cours/${slug}`)}">Créer un compte pour continuer</a>`
        }
      </footer>
    </article>
  </div>`;

  bindQuizzes(root, slug, lessonId);
  root.querySelector("[data-complete]")?.addEventListener("click", (event) =>
    withBusy(event.currentTarget, async () => {
      const updated = await api(`/courses/${slug}/lessons/${lessonId}/complete`, { method: "POST" });
      if (next) navigate(`/cours/${slug}/lecon/${next.id}`);
      else if (updated.completed_lessons === updated.total_lessons && course.exam_question_count) {
        toast("Toutes les leçons sont terminées. Place à l'examen final !", "success");
        navigate(`/cours/${slug}/examen`);
      } else navigate(`/cours/${slug}`);
    }).catch((error) => toast(error.message, "error"))
  );
}

// --- Examen final -----------------------------------------------------------

export async function examPage(root, { slug }, { navigate }) {
  if (!session.user) {
    navigate(`/connexion?suite=${encodeURIComponent(location.pathname)}`, { replace: true });
    return;
  }
  root.innerHTML = `<section class="page"><div class="container narrow">${loading()}</div></section>`;
  const course = await api(`/courses/${slug}`, { auth: false });
  setTitle(`Examen final · ${course.title}`);
  let exam;
  try {
    exam = await api(`/courses/${slug}/exam`);
  } catch (error) {
    root.innerHTML = `<section class="page"><div class="container narrow"><h1>Examen final</h1>${errorBox(error, false)}<a class="ik-bouton" href="/cours/${slug}">Retour au cours</a></div></section>`;
    return;
  }
  const progress = await loadProgress(slug);

  const certificateForm = () => `<section class="panel certificate-request">
      <h2>${icon("award")} Votre attestation de réussite</h2>
      <p>Indiquez votre nom exactement comme il doit figurer sur l'attestation.</p>
      <form data-certificate>
        <label class="field"><span>Nom complet</span><input name="full_name" required minlength="3" maxlength="120" value="${esc(session.user.full_name)}" autocomplete="name"></label>
        <p class="notice notice-info small">Vérifiez bien l'orthographe : une fois l'attestation délivrée, vous ne pourrez plus modifier ce nom.</p>
        <button class="ik-bouton" type="submit">Confirmer et obtenir mon attestation</button>
      </form>
    </section>`;

  if (progress?.certificate_number) {
    navigate(`/attestation/${progress.certificate_number}`, { replace: true });
    return;
  }

  root.innerHTML = `<section class="page"><div class="container narrow">
    <p class="eyebrow"><a href="/cours/${slug}">${esc(course.title)}</a></p>
    <h1>Examen final</h1>
    ${
      exam.passed
        ? `<div class="notice notice-success"><p>Vous avez réussi l'examen avec <strong>${exam.best_score} %</strong>. Félicitations !</p></div>${certificateForm()}`
        : `<div class="notice notice-info"><ul>
            <li>${exam.questions.length} questions, sans limite de temps.</li>
            <li>Il faut <strong>${exam.pass_score} %</strong> de bonnes réponses pour réussir.</li>
            <li>Vous disposez de 3 tentatives par période de 24 heures. Il vous en reste <strong>${exam.attempts_left}</strong>.</li>
          </ul></div>
          ${
            exam.attempts_left
              ? `<form data-exam>${questionsForm(exam.questions, "exam")}<button class="ik-bouton" type="submit">Envoyer mes réponses</button></form>`
              : `<p>Nouvelle tentative possible le ${formatDate(exam.retry_at, true)}. Profitez-en pour relire les leçons.</p>`
          }`
    }
    <div data-result></div>
  </div></section>`;

  const bindCertificate = () =>
    root.querySelector("[data-certificate]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = event.currentTarget.full_name.value.trim();
      if (!confirm(`Votre attestation sera délivrée au nom de « ${name} ». Confirmer ?`)) return;
      withBusy(event.currentTarget.querySelector("button"), async () => {
        const certificate = await api(`/courses/${slug}/certificate`, { method: "POST", body: { full_name: name } });
        toast("Votre attestation est prête !", "success");
        navigate(`/attestation/${certificate.number}`);
      }).catch((error) => toast(error.message, "error"));
    });
  bindCertificate();

  root.querySelector("[data-exam]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const answers = collectAnswers(form, exam.questions.length, "exam");
    const missing = answers.findIndex((a) => !a.length);
    if (missing >= 0) {
      toast(`Il manque une réponse à la question ${missing + 1}.`, "info");
      form.querySelector(`fieldset[data-index="${missing}"]`).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    withBusy(form.querySelector('button[type="submit"]'), async () => {
      const result = await api(`/courses/${slug}/exam`, { method: "POST", body: { answers } });
      result.results.forEach((r, qi) => {
        const fieldset = form.querySelector(`fieldset[data-index="${qi}"]`);
        fieldset.classList.toggle("is-correct", r.correct);
        fieldset.classList.toggle("is-wrong", !r.correct);
        fieldset.querySelector(".feedback").textContent = r.correct ? "Bonne réponse." : "Réponse incorrecte.";
      });
      form.querySelectorAll("input").forEach((input) => (input.disabled = true));
      form.querySelector('button[type="submit"]').remove();
      const box = root.querySelector("[data-result]");
      box.innerHTML = result.passed
        ? `<div class="notice notice-success result"><p class="score">${result.score} %</p><p><strong>Bravo, vous avez réussi${result.distinction ? " avec distinction" : ""} !</strong></p></div>${certificateForm()}`
        : `<div class="notice notice-error result"><p class="score">${result.score} %</p><p>Il faut ${exam.pass_score} % pour réussir. Relisez les leçons où vous avez hésité, puis réessayez.</p>
           ${result.attempts_left ? `<button class="ik-bouton" data-action="reload">Nouvelle tentative (${result.attempts_left} restante${result.attempts_left > 1 ? "s" : ""})</button>` : "<p>Vous avez utilisé vos 3 tentatives du jour.</p>"}</div>`;
      box.scrollIntoView({ behavior: "smooth" });
      bindCertificate();
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Attestation ------------------------------------------------------------

export async function certificatePage(root, { number }) {
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  let c;
  try {
    c = await api(`/certificates/${encodeURIComponent(number)}`, { auth: false });
  } catch (error) {
    if (error.status === 404) {
      root.innerHTML = `<section class="page"><div class="container narrow"><h1>Attestation introuvable</h1>
        <div class="notice notice-error"><p>Aucune attestation de l'Académie Intellia Kin ne porte le numéro <strong>${esc(number)}</strong>. Vérifiez le numéro saisi.</p></div></div></section>`;
      return;
    }
    throw error;
  }
  setTitle(`Attestation ${c.number}`, `${c.full_name} a réussi le cours « ${c.course_title} ».`);
  const url = `${location.origin}/attestation/${c.number}`;
  const issued = new Date(c.issued_at);
  const linkedin = `https://www.linkedin.com/profile/add?${new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: c.course_title,
    organizationName: "Intellia Kin",
    issueYear: String(issued.getFullYear()),
    issueMonth: String(issued.getMonth() + 1),
    certUrl: url,
    certId: c.number,
  })}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&color=0a2540&data=${encodeURIComponent(url)}`;
  const mine = session.user && session.user.full_name;

  root.innerHTML = `<section class="page certificate-page">
    <div class="container">
      <div class="notice notice-success verified no-print">${icon("check")} <p>Attestation authentique, délivrée par l'Académie Intellia Kin le ${formatDate(c.issued_at)}.</p></div>
      <div class="certificate-actions no-print">
        <button class="ik-bouton" data-print>${icon("print")} Télécharger en PDF</button>
        ${mine ? `<a class="ik-bouton ik-bouton-secondaire" href="${esc(linkedin)}" target="_blank" rel="noopener">Ajouter à mon profil LinkedIn</a>` : ""}
        ${shareLinks(url, `J'ai obtenu mon attestation « ${c.course_title} » à l'Académie Intellia Kin !`)}
      </div>
      <div class="certificate-frame">
        <div class="certificate">
          <div class="cert-border">
            <header class="cert-header">
              <img src="/assets/logo-slogan.png" alt="Intellia Kin, l'intelligence artificielle au service de votre performance" class="cert-logo">
            </header>
            <p class="cert-kicker">Académie Intellia Kin</p>
            <h1 class="cert-title">Attestation de réussite</h1>
            <p class="cert-intro">Cette attestation est décernée à</p>
            <p class="cert-name">${esc(c.full_name)}</p>
            <p class="cert-intro">pour avoir suivi et réussi le cours</p>
            <p class="cert-course">${esc(c.course_title)}</p>
            <p class="cert-meta">Niveau ${esc((LABELS.level[c.level] || c.level).toLowerCase())} · ${duration(c.duration_minutes)} de formation${c.distinction ? ' · <strong class="distinction">Avec distinction</strong>' : ""}</p>
            ${c.skills.length ? `<div class="cert-skills"><p>Compétences acquises</p><ul>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
            <footer class="cert-footer">
              <div class="cert-date"><p class="label">Délivrée le</p><p>${formatDate(c.issued_at)}</p><p class="label">N° ${esc(c.number)}</p></div>
              <div class="cert-qr"><img src="${qr}" alt="QR code de vérification" width="88" height="88"><p class="label">Vérifier l'attestation</p></div>
              <div class="cert-signature"><p class="signature-name">${esc(c.signatory_name)}</p><p class="label">${esc(c.signatory_title)}</p></div>
            </footer>
          </div>
        </div>
      </div>
      <p class="small no-print center">Vérification : <a href="${esc(url)}">${esc(url)}</a></p>
    </div>
  </section>`;
  root.querySelector("[data-print]").addEventListener("click", () => window.print());
  // Sur téléphone, l'attestation est réduite pour tenir dans l'écran.
  const frame = root.querySelector(".certificate-frame");
  const sheet = root.querySelector(".certificate");
  const fit = () => {
    if (!document.body.contains(sheet)) return window.removeEventListener("resize", fit);
    sheet.style.zoom = String(Math.min(1, frame.clientWidth / 1000));
  };
  window.addEventListener("resize", fit);
  fit();
}
