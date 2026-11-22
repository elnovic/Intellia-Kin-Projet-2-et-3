// Publications Instagram : l'agent propose, l'équipe relit, compose et valide.

import { api } from "./api.js";
import { navigate, shell } from "./layout.js";
import { badge, esc, formatDate, loading, toast, withBusy } from "./ui.js";

const STATUS = {
  proposed: ["À valider", "neutral"],
  approved: ["Programmée", "formation"],
  publishing: ["Publication en cours", "formation"],
  published: ["Publiée", "success"],
  failed: ["Échec", "danger"],
  rejected: ["Refusée", "neutral"],
};
const STAMP = {
  cours: "COURS GRATUIT",
  outil: "OUTIL GRATUIT",
  conseil: "CONSEIL IA",
  annonce: "À NE PAS MANQUER",
};
const WIDTH = 1080;
const HEIGHT = 1350; // format portrait 4:5, le mieux affiché sur Instagram

const statusBadge = (s) => badge(...(STATUS[s] || [s, "neutral"]));

async function imageBlob(id, kind) {
  const response = await api(`/admin/instagram/posts/${id}/${kind}`, { raw: true });
  if (!response.ok) throw new Error("Image indisponible.");
  return response.blob();
}

// --- Liste ------------------------------------------------------------------------

function connectionPanel(connection) {
  if (connection.connected) {
    return `<div class="ig-connection ig-ok">
      <div><strong>Compte connecté : @${esc(connection.username)}</strong>
      <p class="small">${connection.expires_at
        ? `Accès valable jusqu'au ${esc(formatDate(connection.expires_at))}, prolongé automatiquement chaque jour.`
        : `Accès permanent (jeton d'utilisateur système)${connection.page_name ? ` · Page Facebook : ${esc(connection.page_name)}` : ""}.`}</p></div>
      <button class="ik-bouton ik-bouton-secondaire" data-disconnect>Déconnecter</button>
    </div>`;
  }
  return `<div class="ig-connection">
    <div><strong>Aucun compte Instagram connecté</strong>
    <p class="small">Les propositions peuvent déjà être préparées et validées ; la publication attend la connexion du compte.
    Collez ici le jeton d'accès généré dans le tableau de bord Meta. Il est vérifié puis chiffré, et ne s'affiche plus ensuite.
    L'identifiant du compte Instagram n'est à remplir que si la connexion le demande.</p></div>
    <form data-connect class="inline-form">
      <input name="access_token" type="password" placeholder="Jeton d'accès Instagram" autocomplete="off" required minlength="20">
      <input name="instagram_id" type="text" inputmode="numeric" pattern="\d*" placeholder="ID du compte Instagram (facultatif)" autocomplete="off">
      <button class="ik-bouton" type="submit">Connecter</button>
    </form>
  </div>`;
}

function postCard(p) {
  const when =
    p.status === "published"
      ? `Publiée le ${formatDate(p.published_at, true)}`
      : p.scheduled_at
        ? `Prévue le ${formatDate(p.scheduled_at, true)}`
        : `Proposée le ${formatDate(p.created_at, true)}`;
  return `<a class="ig-card" href="#/publications/${p.id}">
    <div class="ig-thumb" data-thumb="${p.id}" data-kind="${p.has_image ? "visuel" : "fond"}"></div>
    <div class="ig-card-body">
      <div class="badges">${statusBadge(p.status)}${badge(p.theme_label, "neutral")}</div>
      <h3>${esc(p.headline)}</h3>
      <p class="small">${esc(when)}</p>
      ${p.error ? `<p class="small ig-error">${esc(p.error)}</p>` : ""}
    </div>
  </a>`;
}

export async function publicationsList(el) {
  const box = shell(el, "publications", "Publications Instagram", loading());
  const [connection, posts] = await Promise.all([api("/admin/instagram/connection"), api("/admin/instagram/posts")]);
  box.innerHTML = `${connectionPanel(connection)}
    <form data-generate class="editor-bar">
      <label class="field inline-field"><span>Thème</span>
        <select name="theme">
          <option value="auto">Automatique (rotation)</option>
          <option value="cours">Cours de l'Académie</option>
          <option value="outil">Outil gratuit</option>
          <option value="conseil">Conseil pratique IA</option>
          <option value="annonce">Annonce ou événement</option>
        </select>
      </label>
      <button class="ik-bouton" type="submit">Générer une proposition</button>
      <span class="small">Une proposition est aussi préparée chaque matin à 6 h (heure de Kinshasa).</span>
    </form>
    ${
      posts.length
        ? `<div class="ig-grid">${posts.map(postCard).join("")}</div>`
        : `<div class="notice notice-info"><p>Aucune proposition pour l'instant. Cliquez sur « Générer une proposition » pour essayer l'agent.</p></div>`
    }`;

  for (const thumb of box.querySelectorAll("[data-thumb]")) {
    imageBlob(thumb.dataset.thumb, thumb.dataset.kind)
      .then((blob) => {
        thumb.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
      })
      .catch(() => {});
  }

  box.querySelector("[data-generate]").addEventListener("submit", (event) => {
    event.preventDefault();
    const theme = event.currentTarget.theme.value;
    const button = event.currentTarget.querySelector("button");
    button.textContent = "Rédaction et image en cours…";
    withBusy(button, async () => {
      const post = await api("/admin/instagram/posts", { method: "POST", body: { theme } });
      toast("Proposition prête.", "success");
      navigate(`/publications/${post.id}`);
    })
      .catch((error) => toast(error.message, "error"))
      .finally(() => (button.textContent = "Générer une proposition"));
  });

  box.querySelector("[data-connect]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = event.currentTarget.access_token.value.trim();
    const instagramId = event.currentTarget.instagram_id.value.trim();
    withBusy(event.currentTarget.querySelector("button"), async () => {
      const result = await api("/admin/instagram/connection", { method: "PUT", body: { access_token: token, instagram_id: instagramId || null } });
      toast(`Compte @${result.username} connecté.`, "success");
      publicationsList(el);
    }).catch((error) => toast(error.message, "error"));
  });

  box.querySelector("[data-disconnect]")?.addEventListener("click", (event) => {
    if (!confirm("Déconnecter le compte Instagram ? Les publications programmées ne partiront plus.")) return;
    withBusy(event.currentTarget, async () => {
      await api("/admin/instagram/connection", { method: "DELETE" });
      publicationsList(el);
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Composition du visuel ---------------------------------------------------------------

let logoPromise;
function logo() {
  logoPromise ||= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "assets/logo.png";
  });
  return logoPromise;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/** Dessine le visuel : fond IA, dégradé, logo, bandeau du thème, titre, adresse. */
export async function compose(canvas, background, { headline, theme }) {
  await Promise.all([
    document.fonts?.load('700 80px "Plus Jakarta Sans"'),
    document.fonts?.load('600 30px "Inter"'),
  ]).catch(() => {});
  const ctx = canvas.getContext("2d");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // Fond : l'image IA recadrée pour remplir le format portrait.
  ctx.fillStyle = "#0a2540";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (background) {
    const scale = Math.max(WIDTH / background.width, HEIGHT / background.height);
    const w = background.width * scale;
    const h = background.height * scale;
    ctx.drawImage(background, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
  }
  const shade = ctx.createLinearGradient(0, HEIGHT * 0.3, 0, HEIGHT);
  shade.addColorStop(0, "rgba(10, 37, 64, 0)");
  shade.addColorStop(0.45, "rgba(10, 37, 64, 0.78)");
  shade.addColorStop(1, "rgba(10, 37, 64, 0.96)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const top = ctx.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, "rgba(10, 37, 64, 0.45)");
  top.addColorStop(1, "rgba(10, 37, 64, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, WIDTH, 260);

  // Logo sur une pastille blanche.
  try {
    const img = await logo();
    const lw = 230;
    const lh = (img.height / img.width) * lw;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 60, 60, lw + 48, lh + 36, 22);
    ctx.fill();
    ctx.drawImage(img, 84, 78, lw, lh);
  } catch {
    /* sans logo, le visuel reste utilisable */
  }

  // Bandeau du thème.
  const stamp = STAMP[theme] || "INTELLIA KIN";
  ctx.font = '600 30px "Inter", sans-serif';
  const sw = ctx.measureText(stamp).width + 56;
  ctx.fillStyle = "#00c9a7";
  roundRect(ctx, WIDTH - 60 - sw, 72, sw, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#0a2540";
  ctx.textBaseline = "middle";
  ctx.fillText(stamp, WIDTH - 60 - sw + 28, 104);

  // Titre : taille adaptée pour tenir en quatre lignes au plus.
  let size = 92;
  let lines;
  do {
    ctx.font = `700 ${size}px "Plus Jakarta Sans", sans-serif`;
    lines = wrap(ctx, headline, WIDTH - 140);
    size -= 4;
  } while (lines.length > 4 && size > 48);
  const lineHeight = size * 1.18;
  const footY = HEIGHT - 90;
  let y = footY - 70 - lines.length * lineHeight;
  ctx.fillStyle = "#00c9a7";
  ctx.fillRect(70, y - 34, 120, 10);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  for (const line of lines) {
    ctx.fillText(line, 70, y);
    y += lineHeight;
  }

  // Adresse de l'Académie.
  ctx.font = '500 34px "Inter", sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("academie.intelliakin.com", 70, footY);
}

function canvasToDataUrl(canvas) {
  for (const quality of [0.9, 0.82, 0.72]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 1_350_000) return url;
  }
  return canvas.toDataURL("image/jpeg", 0.6);
}

// --- Édition d'une proposition --------------------------------------------------------------

function defaultSchedule() {
  // Demain à 9 h (heure locale de l'ordinateur).
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function toLocalInput(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export async function publicationEditor(el, { id }) {
  const box = shell(el, "publications", "Publication Instagram", loading());
  const [post, connection] = await Promise.all([api(`/admin/instagram/posts/${id}`), api("/admin/instagram/connection")]);
  const editable = ["proposed", "approved", "failed"].includes(post.status);
  let background = null;
  try {
    background = await createImageBitmap(await imageBlob(id, "fond"));
  } catch {
    background = null;
  }

  box.innerHTML = `<p><a href="#/publications">← Toutes les publications</a></p>
    <div class="badges">${statusBadge(post.status)}${badge(post.theme_label, "neutral")}</div>
    ${post.error ? `<div class="notice notice-error"><p>${esc(post.error)}</p></div>` : ""}
    ${post.permalink ? `<div class="notice notice-success"><p>En ligne : <a href="${esc(post.permalink)}" target="_blank" rel="noopener">voir sur Instagram ↗</a></p></div>` : ""}
    <div class="ig-editor">
      <div class="ig-preview"><canvas data-canvas aria-label="Aperçu du visuel"></canvas>
        <p class="small">Aperçu du visuel publié (1080 × 1350). Le fond est généré par IA : la publication portera l'étiquette « IA » d'Instagram.</p>
        ${editable ? `<div class="quick-actions">
          <button class="ik-bouton ik-bouton-secondaire" data-regenerate="image">Nouvelle image</button>
          <button class="ik-bouton ik-bouton-secondaire" data-regenerate="texte">Réécrire le texte</button>
        </div>` : ""}
      </div>
      <form data-post class="form-stack">
        <label class="field"><span>Titre sur le visuel</span>
          <input name="headline" maxlength="80" required value="${esc(post.headline)}" ${editable ? "" : "disabled"}></label>
        <label class="field"><span>Légende <span class="small" data-count></span></span>
          <textarea name="caption" rows="12" maxlength="2000" required ${editable ? "" : "disabled"}>${esc(post.caption)}</textarea></label>
        <label class="field"><span>Hashtags (séparés par des espaces)</span>
          <input name="hashtags" value="${esc(post.hashtags.join(" "))}" ${editable ? "" : "disabled"}></label>
        ${editable ? `<label class="field"><span>Date et heure de publication</span>
          <input name="scheduled_at" type="datetime-local" required value="${toLocalInput(post.scheduled_at ? new Date(post.scheduled_at) : defaultSchedule())}"></label>` : ""}
        ${
          editable
            ? `<div class="quick-actions">
                <button class="ik-bouton" type="submit" data-approve>${post.status === "approved" ? "Mettre à jour et programmer" : "Approuver et programmer"}</button>
                <button class="ik-bouton ik-bouton-secondaire" type="button" data-save>Enregistrer le texte</button>
              </div>
              <div class="quick-actions">
                ${post.status === "approved" ? `<button class="ik-bouton ik-bouton-secondaire" type="button" data-publish ${connection.connected ? "" : "disabled title='Connectez d’abord le compte Instagram'"}>Publier maintenant</button>
                <button class="link-button" type="button" data-unapprove>Remettre en proposition</button>` : ""}
                ${post.status === "failed" ? `<button class="link-button" type="button" data-unapprove>Remettre en proposition</button>` : ""}
                <button class="link-button" type="button" data-reject>Refuser</button>
                <button class="link-button danger" type="button" data-delete>Supprimer</button>
              </div>
              ${connection.connected ? "" : `<p class="small">Aucun compte Instagram n'est connecté : la publication partira dès la connexion du compte, si l'heure prévue est passée.</p>`}`
            : post.status === "rejected"
              ? `<div class="quick-actions"><button class="link-button danger" type="button" data-delete>Supprimer</button></div>`
              : ""
        }
      </form>
    </div>`;

  const form = box.querySelector("[data-post]");
  const canvas = box.querySelector("[data-canvas]");
  const count = box.querySelector("[data-count]");
  const hashtagsOf = () => form.hashtags.value.split(/\s+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
  const redraw = () => compose(canvas, background, { headline: form.headline.value.trim() || " ", theme: post.theme });
  const recount = () => {
    const total = form.caption.value.length + 2 + hashtagsOf().join(" ").length;
    count.textContent = `(${total} / 2200 caractères avec les hashtags)`;
  };
  if (post.has_image && !editable) {
    // Visuel déjà validé : on affiche exactement celui qui est publié.
    const img = await createImageBitmap(await imageBlob(id, "visuel"));
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.getContext("2d").drawImage(img, 0, 0, WIDTH, HEIGHT);
  } else {
    await redraw();
  }
  recount();
  form.headline.addEventListener("input", redraw);
  form.caption.addEventListener("input", recount);
  form.hashtags.addEventListener("input", recount);

  const textBody = () => ({ headline: form.headline.value.trim(), caption: form.caption.value.trim(), hashtags: hashtagsOf() });
  const reload = () => publicationEditor(el, { id });
  const action = (button, task, message) =>
    withBusy(button, async () => {
      await task();
      if (message) toast(message, "success");
      reload();
    }).catch((error) => toast(error.message, "error"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const when = new Date(form.scheduled_at.value);
    action(
      event.submitter || box.querySelector("[data-approve]"),
      async () => {
        await redraw();
        await api(`/admin/instagram/posts/${id}/approve`, {
          method: "POST",
          body: { ...textBody(), image: canvasToDataUrl(canvas), scheduled_at: when.toISOString() },
        });
      },
      `Publication programmée le ${formatDate(when, true)}.`,
    );
  });
  box.querySelector("[data-save]")?.addEventListener("click", (event) =>
    action(event.currentTarget, () => api(`/admin/instagram/posts/${id}`, { method: "PUT", body: textBody() }), "Texte enregistré."),
  );
  for (const button of box.querySelectorAll("[data-regenerate]")) {
    button.addEventListener("click", (event) => {
      const part = event.currentTarget.dataset.regenerate;
      if (part === "texte" && !confirm("Réécrire le titre, la légende et les hashtags ? Vos modifications non enregistrées seront perdues.")) return;
      action(event.currentTarget, () => api(`/admin/instagram/posts/${id}/regenerate`, { method: "POST", body: { part } }), part === "image" ? "Nouvelle image prête." : "Nouveau texte prêt.");
    });
  }
  box.querySelector("[data-publish]")?.addEventListener("click", (event) => {
    if (!confirm("Publier maintenant sur Instagram ?")) return;
    action(event.currentTarget, async () => {
      const result = await api(`/admin/instagram/posts/${id}/publish`, { method: "POST" });
      if (result.status === "failed") throw new Error(result.error || "La publication a échoué.");
    }, "Publication envoyée à Instagram.");
  });
  for (const button of box.querySelectorAll("[data-unapprove]")) {
    button.addEventListener("click", (event) => action(event.currentTarget, () => api(`/admin/instagram/posts/${id}/unapprove`, { method: "POST" })));
  }
  box.querySelector("[data-reject]")?.addEventListener("click", (event) =>
    action(event.currentTarget, () => api(`/admin/instagram/posts/${id}/reject`, { method: "POST" }), "Proposition refusée."),
  );
  box.querySelector("[data-delete]")?.addEventListener("click", (event) => {
    if (!confirm("Supprimer définitivement cette proposition ?")) return;
    withBusy(event.currentTarget, async () => {
      await api(`/admin/instagram/posts/${id}`, { method: "DELETE" });
      toast("Proposition supprimée.", "success");
      navigate("/publications");
    }).catch((error) => toast(error.message, "error"));
  });
}
