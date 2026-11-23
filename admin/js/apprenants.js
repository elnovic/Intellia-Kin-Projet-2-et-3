// Apprenants : retrouver un compte et, en secours, créer un lien pour choisir
// un nouveau mot de passe (après avoir vérifié l'identité de la personne).

import { api } from "./api.js";
import { shell } from "./layout.js";
import { badge, esc, formatDate, loading, toast, withBusy } from "./ui.js";

function row(u) {
  return `<tr>
    <td>${esc(u.full_name)}${u.role === "admin" ? " " + badge("Administrateur", "neutral") : ""}${u.is_active ? "" : " " + badge("Désactivé", "danger")}</td>
    <td>${esc(u.email)}</td>
    <td>${esc(u.phone || "—")}</td>
    <td>${esc(formatDate(u.created_at))}</td>
    <td>${u.is_active ? `<button class="link-button" type="button" data-reset="${esc(u.id)}" data-name="${esc(u.full_name)}" data-phone="${esc(u.phone || "")}">Lien de réinitialisation</button>` : ""}</td>
  </tr>`;
}

function linkBox(result, name, phone) {
  const message = `Bonjour ${name.split(" ")[0]}, voici votre lien pour choisir un nouveau mot de passe sur l'Académie Intellia Kin (valable 24 heures, une seule fois) : ${result.url}`;
  const whatsapp = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  return `<div class="notice notice-success reset-link">
    <p><strong>Lien créé pour ${esc(result.email)}</strong>, valable jusqu'au ${esc(formatDate(result.expires_at, true))}, une seule fois.
    Il remplace tout lien précédent. Transmettez-le uniquement à cette personne.</p>
    <input readonly value="${esc(result.url)}" data-url aria-label="Lien de réinitialisation">
    <div class="quick-actions">
      <button class="ik-bouton" type="button" data-copy>Copier le lien</button>
      ${phone ? `<a class="ik-bouton ik-bouton-secondaire" href="${esc(whatsapp)}" target="_blank" rel="noopener">Envoyer par WhatsApp</a>` : ""}
    </div>
  </div>`;
}

export async function learnersPage(root) {
  const box = shell(root, "apprenants", "Apprenants", loading());
  box.innerHTML = `<form data-search class="editor-bar">
      <label class="field inline-field"><span>Rechercher</span>
        <input name="q" type="search" placeholder="Nom, e-mail ou téléphone" autocomplete="off"></label>
      <button class="ik-bouton" type="submit">Rechercher</button>
    </form>
    <div class="notice notice-info"><p><strong>Mot de passe oublié ?</strong> Si un apprenant ne reçoit pas le code par e-mail,
    vérifiez d'abord que c'est bien lui (adresse e-mail et nom du compte, numéro de téléphone), puis créez un lien de
    réinitialisation et transmettez-le-lui.</p></div>
    <div data-result></div>
    <div data-list>${loading()}</div>`;

  const list = box.querySelector("[data-list]");
  const result = box.querySelector("[data-result]");

  async function search(q = "") {
    list.innerHTML = loading();
    const data = await api(`/admin/users?q=${encodeURIComponent(q)}`);
    const count = q ? `${data.users.length} résultat${data.users.length > 1 ? "s" : ""}${data.users.length === 25 ? " (25 premiers)" : ""}` : `${data.total} compte${data.total > 1 ? "s" : ""} au total ; les 25 plus récents :`;
    list.innerHTML = data.users.length
      ? `<p class="small">${esc(count)}</p><div class="md-table"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Inscription</th><th></th></tr></thead>
          <tbody>${data.users.map(row).join("")}</tbody></table></div>`
      : `<p>Aucun compte ne correspond à cette recherche.</p>`;
    for (const button of list.querySelectorAll("[data-reset]")) {
      button.addEventListener("click", (event) => {
        const { reset, name, phone } = event.currentTarget.dataset;
        if (!confirm(`Créer un lien de réinitialisation pour ${name} ?\n\nVérifiez d'abord que la demande vient bien de cette personne.`)) return;
        withBusy(event.currentTarget, async () => {
          const created = await api(`/admin/users/${reset}/reset-link`, { method: "POST" });
          result.innerHTML = linkBox(created, name, phone);
          result.scrollIntoView({ behavior: "smooth", block: "start" });
          result.querySelector("[data-copy]").addEventListener("click", async () => {
            const input = result.querySelector("[data-url]");
            try {
              await navigator.clipboard.writeText(input.value);
            } catch {
              input.select();
              document.execCommand("copy");
            }
            toast("Lien copié.", "success");
          });
        }).catch((error) => toast(error.message, "error"));
      });
    }
  }

  box.querySelector("[data-search]").addEventListener("submit", (event) => {
    event.preventDefault();
    search(event.currentTarget.q.value.trim()).catch((error) => toast(error.message, "error"));
  });
  await search();
}
