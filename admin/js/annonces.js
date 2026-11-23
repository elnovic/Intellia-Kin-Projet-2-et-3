// Annonces, formations et événements : création, publication, inscrits.

import { api, API_BASE, session } from "./api.js";
import { LABELS, badge, esc, formData, formatDate, loading, setTitle, toast, withBusy } from "./ui.js";
import { PUBLIC_SITE, shell } from "./layout.js";

const TIMEZONES = [
  ["Africa/Kinshasa", "Kinshasa (UTC+1)"],
  ["Africa/Lubumbashi", "Lubumbashi (UTC+2)"],
  ["Africa/Casablanca", "Casablanca"],
  ["Africa/Abidjan", "Abidjan, Dakar (UTC)"],
  ["Africa/Douala", "Douala, Libreville (UTC+1)"],
  ["Europe/Paris", "Paris, Bruxelles"],
];

// --- Annonces ---------------------------------------------------------------

export async function announcementsList(root) {
  setTitle("Annonces");
  const box = shell(root, "annonces", "Annonces", loading());
  const items = await api("/admin/announcements");
  box.innerHTML = `<p><a class="ik-bouton" href="#/annonces/nouvelle">Nouvelle annonce</a></p>
    ${
      items.length
        ? `<div class="md-table"><table><thead><tr><th>Titre</th><th>Type</th><th>Date</th><th>Statut</th><th>Inscrits</th></tr></thead><tbody>${items
            .map(
              (a) => `<tr><td><a href="#/annonces/${a.id}">${esc(a.title)}</a>${a.pinned ? " " + badge("À la une", "pinned") : ""}</td><td>${esc(LABELS.kind[a.kind])}</td><td>${esc(formatDate(a.starts_at || a.published_at || "", Boolean(a.starts_at), a.timezone))}</td><td>${badge(a.status === "published" ? "Publiée" : "Brouillon", a.status === "published" ? "success" : "neutral")}</td><td>${a.registration_mode === "internal" ? a.registered_count + (a.capacity ? ` / ${a.capacity}` : "") : "—"}</td></tr>`
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
  const editing = Boolean(id);
  setTitle(editing ? "Modifier l'annonce" : "Nouvelle annonce");
  const box = shell(root, "annonces", editing ? "Modifier l'annonce" : "Nouvelle annonce", loading());
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
      <label class="field"><span>Image de couverture (adresse https de l'image elle-même, format 1200 × 630 conseillé)</span><input name="cover_image" type="url" value="${val("cover_image")}"></label>
      <div data-cover-preview class="cover-preview" hidden></div>
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
      ${editing ? `<a class="ik-bouton ik-bouton-secondaire" href="${PUBLIC_SITE}/annonces/${val("slug")}" target="_blank" rel="noopener">Voir la page</a>` : ""}
      ${editing ? '<button class="ik-bouton ik-bouton-danger" type="button" data-delete>Supprimer</button>' : ""}
    </div>
  </form>
  ${editing && v.registration_mode === "internal" ? '<section data-registrations class="section-tight"></section>' : ""}`;

  const form = box.querySelector("[data-form]");
  const counter = box.querySelector("[data-count]");
  const updateCount = () => (counter.textContent = `(${form.summary.value.length}/160)`);
  form.summary.addEventListener("input", updateCount);
  updateCount();

  // Aperçu de l'image de couverture : prévient si l'adresse ne mène pas à une image.
  const preview = box.querySelector("[data-cover-preview]");
  let coverOk = true;
  let coverTimer;
  const checkCover = () => {
    const address = form.cover_image.value.trim();
    coverOk = true;
    if (!address) {
      preview.hidden = true;
      preview.innerHTML = "";
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `<p class="small">Vérification de l'image…</p>`;
    const img = new Image();
    img.alt = "Aperçu de l'image de couverture";
    img.onload = () => {
      if (form.cover_image.value.trim() !== address) return;
      preview.innerHTML = "";
      preview.append(img);
    };
    img.onerror = () => {
      if (form.cover_image.value.trim() !== address) return;
      coverOk = false;
      preview.innerHTML = `<div class="notice notice-error"><p><strong>Cette adresse ne mène pas à une image.</strong>
        Ouvrez l'image elle-même dans votre navigateur (clic droit sur l'image, « Ouvrir l'image dans un nouvel onglet »)
        et copiez l'adresse de cet onglet : elle se termine souvent par .jpg, .png ou .webp.
        Sans image valide, l'Académie affiche le visuel par défaut.</p></div>`;
    };
    img.src = address;
  };
  form.cover_image.addEventListener("input", () => {
    clearTimeout(coverTimer);
    coverTimer = setTimeout(checkCover, 500);
  });
  checkCover();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!coverOk && !confirm("L'image de couverture ne se charge pas : l'Académie affichera le visuel par défaut. Enregistrer quand même ?")) return;
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
      navigate(`/annonces/${saved.id}`, { force: true });
    }).catch((error) => toast(error.message, "error"));
  });

  box.querySelector("[data-unpublish]")?.addEventListener("click", (event) =>
    withBusy(event.currentTarget, async () => {
      await api(`/admin/announcements/${id}/unpublish`, { method: "POST" });
      toast("Annonce retirée du site.", "success");
      navigate(`/annonces/${id}`, { force: true });
    }).catch((error) => toast(error.message, "error"))
  );
  box.querySelector("[data-delete]")?.addEventListener("click", (event) => {
    if (!confirm("Supprimer définitivement cette annonce et ses inscriptions ?")) return;
    withBusy(event.currentTarget, async () => {
      await api(`/admin/announcements/${id}`, { method: "DELETE" });
      toast("Annonce supprimée.", "success");
      navigate("/annonces");
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
