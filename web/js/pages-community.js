// Accueil, annonces, comptes et espace personnel.

import { api, mediaUrl, session } from "./api.js";
import { renderMarkdown } from "./md.js";
import {
  LABELS,
  PARCOURS_ORDER,
  badge,
  duration,
  esc,
  formData,
  formatDate,
  icon,
  loading,
  setTitle,
  shareLinks,
  toast,
  withBusy,
} from "./ui.js";
import { courseCard } from "./pages-courses.js";
import { TOOL_CARDS } from "./pages-tools.js";

const PARCOURS_TEXT = {
  "tronc-commun": "Les bases indispensables pour utiliser l'IA avec efficacité et discernement.",
  carriere: "Décrocher un emploi, vendre ses compétences et travailler plus vite.",
  entrepreneuriat: "Passer de l'idée au projet rentable, avec l'IA comme associée.",
  organisations: "Automatiser, analyser et réussir l'adoption de l'IA en équipe.",
};

function announcementCard(a) {
  const date = a.starts_at ? formatDate(a.starts_at, true, a.timezone) : formatDate(a.published_at);
  return `<a class="announcement-card" href="/annonces/${esc(a.slug)}">
    ${a.cover_image ? `<img src="${esc(mediaUrl(a.cover_image))}" alt="" loading="lazy">` : `<div class="announcement-placeholder">${icon(a.kind === "evenement" ? "calendar" : "spark")}</div>`}
    <div>
      <div class="badges">${badge(LABELS.kind[a.kind], a.kind)}${a.pinned ? badge("À la une", "pinned") : ""}</div>
      <h3>${esc(a.title)}</h3>
      <p class="small">${icon(a.starts_at ? "calendar" : "clock")} ${esc(date)}</p>
      <p>${esc(a.summary)}</p>
    </div>
  </a>`;
}

// --- Accueil ----------------------------------------------------------------

export async function home(root) {
  setTitle("");
  root.innerHTML = `<section class="home-hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow light">Académie Intellia Kin · 100 % gratuit</p>
          <h1>Maîtrisez l'intelligence artificielle, à votre rythme.</h1>
          <p class="lead">20 cours concrets, une attestation de réussite pour chaque cours, et des outils IA gratuits pour votre carrière, votre projet ou votre organisation.</p>
          <div class="cta">
            <a class="ik-bouton" href="/cours">Découvrir les cours</a>
            <a class="ik-bouton ik-bouton-clair" href="/outils">Essayer les outils</a>
          </div>
        </div>
        <ul class="hero-stats">
          <li><span class="ik-chiffre">20</span> cours gratuits</li>
          <li><span class="ik-chiffre">7</span> outils</li>
          <li><span class="ik-chiffre">1</span> attestation vérifiable par cours</li>
        </ul>
      </div>
    </section>
    <section class="section"><div class="container">
      <h2 class="section-title">Quatre parcours, un objectif : votre performance</h2>
      <div class="parcours-grid">${PARCOURS_ORDER.map(
        (p) => `<a class="parcours-card parcours-${p}" href="/cours#${p}"><h3>${esc(LABELS.parcours[p])}</h3><p>${esc(PARCOURS_TEXT[p])}</p><span class="card-link">Voir les cours ${icon("arrow")}</span></a>`
      ).join("")}</div>
    </div></section>
    <section class="section alt"><div class="container">
      <h2 class="section-title">Comment ça marche</h2>
      <ol class="steps">
        <li><span class="ik-chiffre">1</span><h3>Créez votre compte</h3><p>Gratuit, en moins d'une minute.</p></li>
        <li><span class="ik-chiffre">2</span><h3>Suivez les leçons</h3><p>Courtes, illustrées, pensées pour le téléphone et les petites connexions.</p></li>
        <li><span class="ik-chiffre">3</span><h3>Réussissez l'examen</h3><p>Quelques questions pour valider ce que vous avez appris.</p></li>
        <li><span class="ik-chiffre">4</span><h3>Partagez votre attestation</h3><p>Vérifiable en ligne, prête pour LinkedIn et votre CV.</p></li>
      </ol>
    </div></section>
    <section class="section"><div class="container">
      <div class="section-head"><h2 class="section-title">Pour commencer</h2><a href="/cours">Tous les cours ${icon("arrow")}</a></div>
      <div class="course-grid" data-featured>${loading()}</div>
    </div></section>
    <section class="section alt"><div class="container">
      <div class="section-head"><h2 class="section-title">Des outils gratuits, prêts à l'emploi</h2><a href="/outils">Tous les outils ${icon("arrow")}</a></div>
      <div class="tool-grid">${TOOL_CARDS.slice(0, 4).map((t) => toolMini(t)).join("")}</div>
    </div></section>
    <section class="section"><div class="container">
      <div class="section-head"><h2 class="section-title">Annonces et événements</h2><a href="/annonces">Tout voir ${icon("arrow")}</a></div>
      <div class="announcement-list" data-news>${loading()}</div>
    </div></section>
    <section class="section cta-band"><div class="container">
      <h2>Besoin d'aller plus loin avec votre équipe ?</h2>
      <p>Intellia Kin accompagne les organisations en formation, en conseil et en réalisation de projets IA.</p>
      <a class="ik-bouton ik-bouton-clair" href="https://intelliakin.com" target="_blank" rel="noopener">Découvrir le cabinet</a>
    </div></section>`;

  api("/courses", { auth: false })
    .then((courses) => {
      const box = root.querySelector("[data-featured]");
      if (box) box.innerHTML = courses.slice(0, 3).map(courseCard).join("") || '<p class="empty">Les cours arrivent très bientôt.</p>';
    })
    .catch(() => {
      const box = root.querySelector("[data-featured]");
      if (box) box.innerHTML = '<p class="empty">Les cours sont momentanément indisponibles.</p>';
    });
  api("/announcements?limit=3", { auth: false })
    .then((items) => {
      const box = root.querySelector("[data-news]");
      if (box) box.innerHTML = items.map(announcementCard).join("") || '<p class="empty">Aucune annonce pour le moment. Revenez bientôt !</p>';
    })
    .catch(() => {
      const box = root.querySelector("[data-news]");
      if (box) box.innerHTML = "";
    });
}

function toolMini(tool) {
  return `<a class="tool-card" href="/outils/${tool.slug}">${icon(tool.icon)}<h3>${esc(tool.title)}</h3><p>${esc(tool.short)}</p>${tool.ai ? badge("IA", "ai") : badge("Sans compte", "neutral")}</a>`;
}

// --- Annonces ---------------------------------------------------------------

export async function announcements(root) {
  setTitle("Annonces et événements", "Formations, événements et actualités de l'Académie Intellia Kin.");
  const kind = new URLSearchParams(location.search).get("type") || "";
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  const items = await api(`/announcements${kind ? `?kind=${kind}` : ""}`, { auth: false });
  const tabs = [["", "Tout"], ["formation", "Formations"], ["evenement", "Événements"], ["actualite", "Actualités"]];
  root.innerHTML = `<section class="page"><div class="container">
    <header class="page-header">
      <h1>Annonces et événements</h1>
      <p class="lead">Les prochaines formations, nos événements et les nouveautés de l'Académie.</p>
    </header>
    <nav class="chips" aria-label="Filtrer les annonces">${tabs
      .map(([v, l]) => `<a class="chip ${v === kind ? "active" : ""}" href="/annonces${v ? `?type=${v}` : ""}">${l}</a>`)
      .join("")}</nav>
    <div class="announcement-list">${items.map(announcementCard).join("") || '<p class="empty">Aucune annonce pour le moment.</p>'}</div>
  </div></section>`;
}

export async function announcementPage(root, { slug }) {
  root.innerHTML = `<section class="page"><div class="container narrow">${loading()}</div></section>`;
  const a = await api(`/announcements/${slug}`, { auth: false });
  setTitle(a.title, a.summary);
  const url = `${location.origin}/annonces/${a.slug}`;
  const remaining = a.capacity ? Math.max(0, a.capacity - a.registered_count) : null;
  let registration = "";
  if (a.registration_mode === "external" && a.external_url) {
    registration = `<a class="ik-bouton" href="${esc(a.external_url)}" target="_blank" rel="noopener">S'inscrire</a>`;
  } else if (a.registration_mode === "internal") {
    const user = session.user || {};
    registration = a.registration_open
      ? `<section class="panel" id="inscription"><h2>Inscription</h2>
          <form data-register class="form-grid">
            <label class="field"><span>Nom complet</span><input name="full_name" required minlength="2" value="${esc(user.full_name || "")}" autocomplete="name"></label>
            <label class="field"><span>E-mail</span><input name="email" type="email" required value="${esc(user.email || "")}" autocomplete="email"></label>
            <label class="field"><span>Téléphone (facultatif)</span><input name="phone" placeholder="+243 8XX XXX XXX" value="${esc(user.phone || "")}" autocomplete="tel"></label>
            <label class="field"><span>Organisation (facultatif)</span><input name="organization" maxlength="200"></label>
            <button class="ik-bouton" type="submit">Je m'inscris</button>
          </form></section>`
      : `<div class="notice notice-info"><p>Les inscriptions sont fermées${remaining === 0 ? " : l'événement est complet" : ""}.</p></div>`;
  }
  root.innerHTML = `<article class="page"><div class="container narrow">
    <p class="eyebrow"><a href="/annonces">Annonces</a> · ${esc(LABELS.kind[a.kind])}</p>
    <h1>${esc(a.title)}</h1>
    <p class="lead">${esc(a.summary)}</p>
    ${a.cover_image ? `<img class="announcement-cover" src="${esc(mediaUrl(a.cover_image))}" alt="">` : ""}
    ${
      a.starts_at || a.location || a.online_url
        ? `<ul class="facts">
          ${a.starts_at ? `<li>${icon("calendar")} ${esc(formatDate(a.starts_at, true, a.timezone))}${a.ends_at ? ` → ${esc(formatDate(a.ends_at, true, a.timezone))}` : ""} <span class="small">(heure de ${esc(a.timezone.split("/").pop().replace("_", " "))})</span></li>` : ""}
          ${a.location ? `<li>${icon("map")} ${esc(a.location)}</li>` : ""}
          ${a.online_url ? `<li>${icon("share")} En ligne</li>` : ""}
          ${remaining !== null ? `<li>${icon("user")} ${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}</li>` : ""}
        </ul>`
        : ""
    }
    ${a.registration_open && a.registration_mode === "internal" ? '<p><a class="ik-bouton" href="#inscription">S\'inscrire</a></p>' : ""}
    <div class="prose">${renderMarkdown(a.body)}</div>
    ${a.course_slug ? `<p><a class="ik-bouton ik-bouton-secondaire" href="/cours/${esc(a.course_slug)}">Voir le cours associé</a></p>` : ""}
    ${registration}
    <h2 class="h3">Partager</h2>
    ${shareLinks(url, a.title)}
  </div></article>`;

  root.querySelector("[data-register]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formData(form);
    if (body.phone) body.phone = body.phone.replace(/[\s.-]/g, "");
    withBusy(form.querySelector("button"), async () => {
      await api(`/announcements/${slug}/register`, { method: "POST", body, auth: Boolean(session.token) });
      form.closest("section").innerHTML = `<div class="notice notice-success"><p><strong>Inscription confirmée !</strong> Nous vous recontacterons à l'adresse ${esc(body.email)}.</p></div>`;
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Connexion et inscription ----------------------------------------------

function nextUrl() {
  const target = new URLSearchParams(location.search).get("suite") || "/mon-espace";
  return target.startsWith("/") && !target.startsWith("//") ? target : "/mon-espace";
}

async function signIn(email, password) {
  const { access_token } = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
  session.set(access_token, null);
  const user = await api("/auth/me");
  session.set(access_token, user);
  return user;
}

export async function loginPage(root, _, { navigate }) {
  setTitle("Connexion");
  if (session.user) return navigate(nextUrl(), { replace: true });
  const suite = new URLSearchParams(location.search).get("suite");
  root.innerHTML = `<section class="page"><div class="container auth-box">
    <h1>Connexion</h1>
    <form data-login class="form-stack">
      <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Mot de passe</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="ik-bouton" type="submit">Se connecter</button>
    </form>
    <p>Pas encore de compte ? <a href="/inscription${suite ? `?suite=${encodeURIComponent(suite)}` : ""}">Créez-le gratuitement</a>.</p>
  </div></section>`;
  root.querySelector("[data-login]").addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = formData(event.currentTarget);
    withBusy(event.currentTarget.querySelector("button"), async () => {
      const user = await signIn(email, password);
      toast(`Bienvenue, ${user.full_name.split(" ")[0]} !`, "success");
      navigate(nextUrl(), { replace: true });
    }).catch((error) => toast(error.message, "error"));
  });
}

export async function registerPage(root, _, { navigate }) {
  setTitle("Créer un compte");
  if (session.user) return navigate(nextUrl(), { replace: true });
  const suite = new URLSearchParams(location.search).get("suite");
  root.innerHTML = `<section class="page"><div class="container auth-box">
    <h1>Créer un compte gratuit</h1>
    <p>Pour suivre les cours, obtenir vos attestations et utiliser les outils IA.</p>
    <form data-register class="form-stack">
      <label class="field"><span>Nom complet</span><input name="full_name" required minlength="2" maxlength="120" autocomplete="name"></label>
      <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Mot de passe (8 caractères minimum)</span><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
      <label class="field"><span>Téléphone (facultatif, format international)</span><input name="phone" placeholder="+243 8XX XXX XXX" autocomplete="tel"></label>
      <label class="field"><span>Vous êtes</span>
        <select name="audience">
          <option value="jeune_diplome">Étudiant ou jeune diplômé</option>
          <option value="entrepreneur">Entrepreneur</option>
          <option value="pme">Membre d'une entreprise ou d'une organisation</option>
          <option value="autre">Autre</option>
        </select>
      </label>
      <button class="ik-bouton" type="submit">Créer mon compte</button>
    </form>
    <p>Déjà inscrit ? <a href="/connexion${suite ? `?suite=${encodeURIComponent(suite)}` : ""}">Connectez-vous</a>.</p>
  </div></section>`;
  root.querySelector("[data-register]").addEventListener("submit", (event) => {
    event.preventDefault();
    const body = formData(event.currentTarget);
    if (body.phone) body.phone = body.phone.replace(/[\s.-]/g, "");
    withBusy(event.currentTarget.querySelector("button"), async () => {
      await api("/auth/register", { method: "POST", body, auth: false });
      await signIn(body.email, body.password);
      toast("Votre compte est créé. Bienvenue dans l'Académie !", "success");
      navigate(nextUrl(), { replace: true });
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Mon espace -------------------------------------------------------------

export async function mySpace(root, _, { navigate }) {
  if (!session.token) return navigate("/connexion?suite=/mon-espace", { replace: true });
  setTitle("Mon espace");
  root.innerHTML = `<section class="page"><div class="container">${loading()}</div></section>`;
  const [courses, certificates] = await Promise.all([api("/me/courses"), api("/me/certificates")]);
  const user = session.user || {};
  root.innerHTML = `<section class="page"><div class="container">
    <header class="page-header"><h1>Bonjour ${esc((user.full_name || "").split(" ")[0])}</h1>
      <p class="lead">Retrouvez vos cours, vos attestations et vos outils.</p></header>
    <section class="section-tight">
      <h2>Mes cours</h2>
      ${
        courses.length
          ? `<div class="my-courses">${courses
              .map(
                ({ course, progress }) => `<a class="my-course" href="/cours/${esc(course.slug)}">
                  <div><h3>${esc(course.title)}</h3><p class="small">${esc(LABELS.parcours[course.parcours] || "")} · ${duration(course.duration_minutes)}</p></div>
                  <div class="progress-bar"><span style="width:${progress.percent}%"></span></div>
                  <p class="small">${progress.certificate_number ? `${icon("award")} Attestation obtenue` : progress.exam_passed ? "Examen réussi" : `${progress.percent} % terminé`}</p>
                </a>`
              )
              .join("")}</div>`
          : '<p class="empty">Vous n\'êtes inscrit à aucun cours. <a href="/cours">Choisissez votre premier cours</a>.</p>'
      }
    </section>
    <section class="section-tight">
      <h2>Mes attestations</h2>
      ${
        certificates.length
          ? `<ul class="certificate-list">${certificates
              .map((c) => `<li>${icon("award")}<div><a href="/attestation/${esc(c.number)}">${esc(c.course_title)}</a><p class="small">N° ${esc(c.number)} · ${formatDate(c.issued_at)}${c.distinction ? " · avec distinction" : ""}</p></div></li>`)
              .join("")}</ul>`
          : '<p class="empty">Réussissez l\'examen final d\'un cours pour obtenir votre première attestation.</p>'
      }
    </section>
    <section class="section-tight">
      <h2>Mon compte</h2>
      <dl class="facts-list"><dt>Nom</dt><dd>${esc(user.full_name || "")}</dd><dt>E-mail</dt><dd>${esc(user.email || "")}</dd>${user.phone ? `<dt>Téléphone</dt><dd>${esc(user.phone)}</dd>` : ""}</dl>
    </section>
  </div></section>`;
}
