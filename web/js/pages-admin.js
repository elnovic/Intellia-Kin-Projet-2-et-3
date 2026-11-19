// Administration : tableau de bord, annonces, cours, attestations.

import { api, API_BASE, session } from "./api.js";
import { LABELS, badge, esc, formData, formatDate, loading, setTitle, toast, withBusy } from "./ui.js";

const TIMEZONES = [
  ["Africa/Kinshasa", "Kinshasa (UTC+1)"],
  ["Africa/Lubumbashi", "Lubumbashi (UTC+2)"],
  ["Africa/Casablanca", "Casablanca"],
  ["Africa/Abidjan", "Abidjan, Dakar (UTC)"],
  ["Africa/Douala", "Douala, Libreville (UTC+1)"],
  ["Europe/Paris", "Paris, Bruxelles"],
];

function guard(root) {
  if (session.isAdmin) return true;
  root.innerHTML = `<section class="page"><div class="container narrow"><h1>Accès réservé</h1>
    <p>Cette partie est réservée à l'équipe Intellia Kin.</p>${session.user ? "" : '<a class="ik-bouton" href="/connexion?suite=/admin">Se connecter</a>'}</div></section>`;
  return false;
}

function adminNav(active) {
  const links = [["/admin", "Tableau de bord"], ["/admin/annonces", "Annonces"], ["/admin/cours", "Cours"], ["/admin/attestations", "Attestations"]];
  return `<nav class="admin-nav" aria-label="Administration">${links
    .map(([href, label]) => `<a href="${href}" class="${href === active ? "active" : ""}">${label}</a>`)
    .join("")}</nav>`;
}

function shell(root, active, title, content) {
  root.innerHTML = `<section class="page admin"><div class="container">
    <p class="eyebrow">Administration</p><h1>${esc(title)}</h1>${adminNav(active)}<div data-admin>${content}</div>
  </div></section>`;
  return root.querySelector("[data-admin]");
}

// --- Tableau de bord ---------------------------------------------------------

export async function dashboard(root) {
  if (!guard(root)) return;
  setTitle("Administration");
  const box = shell(root, "/admin", "Tableau de bord", loading());
  const stats = await api("/admin/stats");
  box.innerHTML = `<div class="kpi-grid">
      <div class="ik-chiffre-cle"><p class="label">Comptes créés</p><p class="kpi">${stats.users}</p></div>
      <div class="ik-chiffre-cle"><p class="label">Inscriptions aux cours</p><p class="kpi">${stats.enrollments}</p></div>
      <div class="ik-chiffre-cle"><p class="label">Attestations délivrées</p><p class="kpi">${stats.certificates}</p></div>
    </div>
    <h2>Par cours</h2>
    <div class="md-table"><table><thead><tr><th>Cours</th><th>Inscrits</th><th>Attestations</th></tr></thead><tbody>${stats.courses
      .map((c) => `<tr><td><a href="/cours/${esc(c.slug)}">${esc(c.title)}</a></td><td>${c.enrollments}</td><td>${c.certificates}</td></tr>`)
      .join("")}</tbody></table></div>`;
}

// --- Cours ------------------------------------------------------------------

export async function coursesList(root) {
  if (!guard(root)) return;
  setTitle("Cours · Administration");
  const box = shell(root, "/admin/cours", "Cours", loading());
  const courses = await api("/admin/courses");
  box.innerHTML = `<p class="notice notice-info small">Les cours marqués « dépôt » sont rédigés dans le dépôt GitHub (dossier <code>contenu/cours</code>) et rechargés à chaque déploiement : modifiez-les là-bas.</p>
    <div class="md-table"><table><thead><tr><th>#</th><th>Cours</th><th>Parcours</th><th>Niveau</th><th>Statut</th><th>Source</th></tr></thead><tbody>${courses
      .sort((a, b) => a.position - b.position)
      .map(
        (c) => `<tr><td>${c.position}</td><td><a href="/cours/${esc(c.slug)}">${esc(c.title)}</a></td><td>${esc(LABELS.parcours[c.parcours] || c.parcours)}</td><td>${esc(LABELS.level[c.level] || c.level)}</td><td>${badge(c.status === "published" ? "Publié" : c.status === "draft" ? "Brouillon" : "Archivé", c.status === "published" ? "success" : "neutral")}</td><td>${c.source === "depot" ? "dépôt" : "console"}</td></tr>`
      )
      .join("")}</tbody></table></div>`;
}

// --- Attestations -------------------------------------------------------------

export async function certificatesTool(root) {
  if (!guard(root)) return;
  setTitle("Attestations · Administration");
  const box = shell(
    root,
    "/admin/attestations",
    "Attestations",
    `<p>Corrigez le nom porté sur une attestation, par exemple après une faute de frappe signalée par l'apprenant.</p>
    <form data-fix class="form-grid">
      <label class="field"><span>Numéro de l'attestation</span><input name="number" required placeholder="IK-2026-000001" pattern="IK-\\d{4}-\\d{6}"></label>
      <label class="field"><span>Nom corrigé</span><input name="full_name" required minlength="3" maxlength="120"></label>
      <button class="ik-bouton" type="submit">Corriger</button>
    </form>`
  );
  box.querySelector("[data-fix]").addEventListener("submit", (event) => {
    event.preventDefault();
    const { number, full_name } = formData(event.currentTarget);
    withBusy(event.currentTarget.querySelector("button"), async () => {
      await api(`/admin/certificates/${encodeURIComponent(number.toUpperCase())}`, { method: "PATCH", body: { full_name } });
      toast("Nom corrigé.", "success");
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Annonces ---------------------------------------------------------------

export async function announcementsList(root) {
  if (!guard(root)) return;
  setTitle("Annonces · Administration");
  const box = shell(root, "/admin/annonces", "Annonces", loading());
  const items = await api("/admin/announcements");
  box.innerHTML = `<p><a class="ik-bouton" href="/admin/annonces/nouvelle">Nouvelle annonce</a></p>
    ${
      items.length
        ? `<div class="md-table"><table><thead><tr><th>Titre</th><th>Type</th><th>Date</th><th>Statut</th><th>Inscrits</th></tr></thead><tbody>${items
            .map(
              (a) => `<tr><td><a href="/admin/annonces/${a.id}">${esc(a.title)}</a>${a.pinned ? " " + badge("À la une", "pinned") : ""}</td><td>${esc(LABELS.kind[a.kind])}</td><td>${esc(formatDate(a.starts_at || a.published_at || "", Boolean(a.starts_at), a.timezone))}</td><td>${badge(a.status === "published" ? "Publiée" : "Brouillon", a.status === "published" ? "success" : "neutral")}</td><td>${a.registration_mode === "internal" ? a.registered_count + (a.capacity ? ` / ${a.capacity}` : "") : "—"}</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : '<p class="empty">Aucune annonce. Créez la première !</p>'
    }`;
}

// Saisie d'une date dans le fuseau de l'événement.
function zonedToUtc(local, timeZone) {
  if (!local) return null;
  const guess = new Date(`${local}:00Z`);
  const inZone = new Date(guess.toLocaleString("en-US", { timeZone }));
  const inUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (inZone - inUtc)).toISOString();
}

function utcToZoned(iso, timeZone) {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const DATE_FIELDS = ["starts_at", "ends_at", "registration_deadline", "expires_at"];

export async function announcementForm(root, { id }, { navigate }) {
  if (!guard(root)) return;
  const editing = Boolean(id);
  setTitle(editing ? "Modifier l'annonce" : "Nouvelle annonce");
  const box = shell(root, "/admin/annonces", editing ? "Modifier l'annonce" : "Nouvelle annonce", loading());
  const [all, courses] = await Promise.all([editing ? api("/admin/announcements") : [], api("/admin/courses")]);
  const a = editing ? all.find((x) => x.id === id) : null;
  if (editing && !a) {
    box.innerHTML = '<p class="empty">Annonce introuvable.</p>';
    return;
  }
  const v = a || { kind: "evenement", audience: "tous", timezone: "Africa/Kinshasa", registration_mode: "internal", pinned: false };
  const tz = v.timezone || "Africa/Kinshasa";
  const opt = (value, label, current) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
  const val = (key) => esc(v[key] ?? "");

  box.innerHTML = `<form data-form class="form-stack admin-form">
    <fieldset><legend>L'essentiel</legend>
      <div class="form-grid">
        <label class="field"><span>Type</span><select name="kind">${Object.entries(LABELS.kind).map(([k, l]) => opt(k, l, v.kind)).join("")}</select></label>
        <label class="field"><span>Public</span><select name="audience">${Object.entries(LABELS.audience).map(([k, l]) => opt(k, l, v.audience)).join("")}</select></label>
      </div>
      <label class="field"><span>Titre</span><input name="title" required minlength="3" maxlength="200" value="${val("title")}"></label>
      ${editing ? `<label class="field"><span>Adresse de la page (slug)</span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${val("slug")}"></label>` : ""}
      <label class="field"><span>Résumé (160 caractères max, affiché dans les listes et les partages) <span class="small" data-count></span></span><textarea name="summary" required minlength="10" maxlength="160" rows="2">${val("summary")}</textarea></label>
      <label class="field"><span>Contenu (Markdown : **gras**, listes avec -, titres avec ##)</span><textarea name="body" rows="10">${val("body")}</textarea></label>
      <label class="field"><span>Image de couverture (adresse https, format 1200 × 630 conseillé)</span><input name="cover_image" type="url" value="${val("cover_image")}"></label>
      <label class="checkbox"><input type="checkbox" name="pinned" ${v.pinned ? "checked" : ""}> Mettre à la une (en tête de liste et sur l'accueil)</label>
    </fieldset>
    <fieldset data-when><legend>Date et lieu</legend>
      <label class="field"><span>Fuseau horaire de l'événement</span><select name="timezone">${TIMEZONES.map(([k, l]) => opt(k, l, tz)).join("")}</select></label>
      <div class="form-grid">
        <label class="field"><span>Début</span><input type="datetime-local" name="starts_at" value="${utcToZoned(v.starts_at, tz)}"></label>
        <label class="field"><span>Fin</span><input type="datetime-local" name="ends_at" value="${utcToZoned(v.ends_at, tz)}"></label>
      </div>
      <label class="field"><span>Lieu (adresse, salle)</span><input name="location" maxlength="300" value="${val("location")}"></label>
      <label class="field"><span>Lien en ligne (Zoom, Meet, Teams…)</span><input name="online_url" type="url" value="${val("online_url")}"></label>
    </fieldset>
    <fieldset><legend>Inscriptions</legend>
      <label class="field"><span>Mode d'inscription</span><select name="registration_mode">${opt("internal", "Sur la plateforme", v.registration_mode)}${opt("external", "Lien externe", v.registration_mode)}${opt("none", "Pas d'inscription", v.registration_mode)}</select></label>
      <div class="form-grid">
        <label class="field"><span>Nombre de places (vide = illimité)</span><input name="capacity" type="number" min="1" value="${val("capacity")}"></label>
        <label class="field"><span>Date limite d'inscription</span><input type="datetime-local" name="registration_deadline" value="${utcToZoned(v.registration_deadline, tz)}"></label>
      </div>
      <label class="field"><span>Lien d'inscription externe</span><input name="external_url" type="url" value="${val("external_url")}"></label>
      <label class="field"><span>Cours associé</span><select name="course_slug"><option value="">Aucun</option>${courses.map((c) => opt(c.slug, c.title, v.course_slug)).join("")}</select></label>
    </fieldset>
    <fieldset><legend>Publication</legend>
      <label class="field"><span>Retirer automatiquement l'annonce le (facultatif)</span><input type="datetime-local" name="expires_at" value="${utcToZoned(v.expires_at, tz)}"></label>
    </fieldset>
    <div class="form-actions">
      <button class="ik-bouton ik-bouton-secondaire" type="submit" value="draft">Enregistrer${editing && v.status === "published" ? "" : " le brouillon"}</button>
      <button class="ik-bouton" type="submit" value="publish">${editing && v.status === "published" ? "Enregistrer (déjà publiée)" : "Enregistrer et publier"}</button>
      ${editing && v.status === "published" ? '<button class="ik-bouton ik-bouton-secondaire" type="button" data-unpublish>Dépublier</button>' : ""}
      ${editing ? `<a class="ik-bouton ik-bouton-secondaire" href="/annonces/${val("slug")}" target="_blank">Voir la page</a>` : ""}
      ${editing ? '<button class="ik-bouton ik-bouton-danger" type="button" data-delete>Supprimer</button>' : ""}
    </div>
  </form>
  ${editing && v.registration_mode === "internal" ? '<section data-registrations class="section-tight"></section>' : ""}`;

  const form = box.querySelector("[data-form]");
  const counter = box.querySelector("[data-count]");
  const updateCount = () => (counter.textContent = `(${form.summary.value.length}/160)`);
  form.summary.addEventListener("input", updateCount);
  updateCount();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const publish = event.submitter?.value === "publish";
    const raw = formData(form);
    const zone = raw.timezone || "Africa/Kinshasa";
    const body = { ...raw, pinned: form.pinned.checked };
    for (const field of DATE_FIELDS) body[field] = zonedToUtc(raw[field], zone);
    body.capacity = raw.capacity ? Number(raw.capacity) : null;
    for (const field of ["cover_image", "online_url", "external_url", "location", "course_slug"]) body[field] = raw[field] || null;
    withBusy(event.submitter, async () => {
      const saved = editing
        ? await api(`/admin/announcements/${id}`, { method: "PUT", body })
        : await api("/admin/announcements", { method: "POST", body });
      if (publish && saved.status !== "published") await api(`/admin/announcements/${saved.id}/publish`, { method: "POST" });
      toast(publish ? "Annonce publiée." : "Annonce enregistrée.", "success");
      navigate(`/admin/annonces/${saved.id}`, { replace: !editing });
    }).catch((error) => toast(error.message, "error"));
  });

  box.querySelector("[data-unpublish]")?.addEventListener("click", (event) =>
    withBusy(event.currentTarget, async () => {
      await api(`/admin/announcements/${id}/unpublish`, { method: "POST" });
      toast("Annonce retirée du site.", "success");
      navigate(`/admin/annonces/${id}`, { replace: true });
    }).catch((error) => toast(error.message, "error"))
  );
  box.querySelector("[data-delete]")?.addEventListener("click", (event) => {
    if (!confirm("Supprimer définitivement cette annonce et ses inscriptions ?")) return;
    withBusy(event.currentTarget, async () => {
      await api(`/admin/announcements/${id}`, { method: "DELETE" });
      toast("Annonce supprimée.", "success");
      navigate("/admin/annonces", { replace: true });
    }).catch((error) => toast(error.message, "error"));
  });

  const registrations = box.querySelector("[data-registrations]");
  if (registrations) {
    const list = await api(`/admin/announcements/${id}/registrations`);
    registrations.innerHTML = `<h2>Inscrits (${list.length})</h2>
      ${list.length ? '<button class="ik-bouton ik-bouton-secondaire" data-csv>Télécharger la liste (Excel)</button>' : ""}
      ${
        list.length
          ? `<div class="md-table"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Organisation</th><th>Date</th></tr></thead><tbody>${list
              .map((r) => `<tr><td>${esc(r.full_name)}</td><td>${esc(r.email)}</td><td>${esc(r.phone || "")}</td><td>${esc(r.organization || "")}</td><td>${formatDate(r.created_at, true)}</td></tr>`)
              .join("")}</tbody></table></div>`
          : '<p class="empty">Pas encore d\'inscrit.</p>'
      }`;
    registrations.querySelector("[data-csv]")?.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE}/admin/announcements/${id}/registrations.csv`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const blob = await response.blob();
      const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `inscrits-${v.slug}.csv` });
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }
}
