// Plateforme de contrôle Intellia Kin : réservée aux administrateurs.

import { api, refreshUser, session } from "./api.js";
import { announcementForm, announcementsList } from "./annonces.js";
import { learnersPage } from "./apprenants.js";
import { courseEditor, courseForm, coursesList, lessonEditor } from "./cours.js";
import { navigate, PUBLIC_SITE, shell } from "./layout.js";
import { publicationEditor, publicationsList } from "./publications.js";
import { errorBox, esc, formData, loading, toast, withBusy } from "./ui.js";

const routes = [
  ["/", dashboard],
  ["/cours", coursesList],
  ["/cours/nouveau", courseForm],
  ["/cours/:id", courseEditor],
  ["/lecons/:id", lessonEditor],
  ["/annonces", announcementsList],
  ["/annonces/nouvelle", announcementForm],
  ["/annonces/:id", announcementForm],
  ["/apprenants", learnersPage],
  ["/publications", publicationsList],
  ["/publications/:id", publicationEditor],
];

function match(path) {
  for (const [pattern, handler] of routes) {
    const names = [];
    const regex = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
    const found = path.match(regex);
    if (found) return { handler, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(found[i + 1])])) };
  }
  return null;
}

const root = () => document.getElementById("app");

function loginPage(message = "") {
  document.title = "Connexion · Contrôle Intellia Kin";
  root().innerHTML = `<section class="login"><div class="auth-box">
    <img src="assets/logo.png" alt="Intellia Kin" width="140">
    <h1>Centre de contrôle</h1>
    <p class="small">Accès réservé à l'équipe Intellia Kin.</p>
    ${message ? `<div class="notice notice-error"><p>${esc(message)}</p></div>` : ""}
    <form data-login class="form-stack">
      <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="field"><span>Mot de passe</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="ik-bouton" type="submit">Se connecter</button>
    </form>
  </div></section>`;
  root().querySelector("[data-login]").addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = formData(event.currentTarget);
    withBusy(event.currentTarget.querySelector("button"), async () => {
      const { access_token } = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
      session.set(access_token, null);
      const user = await api("/auth/me");
      if (user.role !== "admin") {
        session.clear();
        return loginPage("Ce compte n'a pas accès au centre de contrôle.");
      }
      session.set(access_token, user);
      render();
    }).catch((error) => toast(error.message, "error"));
  });
}

async function dashboard(el) {
  const box = shell(el, "tableau", "Tableau de bord", loading());
  const stats = await api("/admin/stats");
  box.innerHTML = `<div class="kpi-grid">
      <div class="ik-chiffre-cle"><p class="label">Comptes créés</p><p class="kpi">${stats.users}</p></div>
      <div class="ik-chiffre-cle"><p class="label">Inscriptions aux cours</p><p class="kpi">${stats.enrollments}</p></div>
      <div class="ik-chiffre-cle"><p class="label">Attestations délivrées</p><p class="kpi">${stats.certificates}</p></div>
    </div>
    <div class="quick-actions">
      <a class="ik-bouton" href="#/cours/nouveau">Nouveau cours</a>
      <a class="ik-bouton ik-bouton-secondaire" href="#/annonces/nouvelle">Nouvelle annonce</a>
    </div>
    <h2>Par cours</h2>
    <div class="md-table"><table><thead><tr><th>Cours</th><th>Inscrits</th><th>Attestations</th></tr></thead><tbody>${stats.courses
      .map((c) => `<tr><td><a href="${PUBLIC_SITE}/cours/${esc(c.slug)}" target="_blank" rel="noopener">${esc(c.title)}</a></td><td>${c.enrollments}</td><td>${c.certificates}</td></tr>`)
      .join("")}</tbody></table></div>`;
}

async function render() {
  if (!session.token || !session.isAdmin) return loginPage();
  const path = location.hash.replace(/^#/, "") || "/";
  const found = match(path);
  window.scrollTo(0, 0);
  if (!found) return navigate("/");
  try {
    await found.handler(root(), found.params, { navigate });
  } catch (error) {
    if (error.status === 401 || error.status === 403) return loginPage("Session expirée, reconnectez-vous.");
    console.error(error);
    root().querySelector("[data-admin]")
      ? (root().querySelector("[data-admin]").innerHTML = errorBox(error))
      : (root().innerHTML = errorBox(error));
  }
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "logout") {
    session.clear();
    loginPage();
  } else if (action === "reload") {
    render();
  }
});
window.addEventListener("hashchange", render);
refreshUser().finally(render);
