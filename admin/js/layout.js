// Mise en page de la plateforme de contrôle.

import { esc } from "./ui.js";

export const PUBLIC_SITE = (window.IK_CONFIG?.publicSite || "https://academie.intelliakin.com").replace(/\/$/, "");

const LINKS = [
  ["tableau", "#/", "Tableau de bord"],
  ["cours", "#/cours", "Cours"],
  ["annonces", "#/annonces", "Annonces et événements"],
  ["publications", "#/publications", "Publications Instagram"],
];

export function navigate(path, { force = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target && force) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = target;
}

export function shell(root, active, title, content) {
  document.title = `${title} · Contrôle Intellia Kin`;
  root.innerHTML = `<div class="control">
    <aside class="control-nav">
      <a class="control-brand" href="#/"><img src="assets/logo.png" alt="Intellia Kin" width="110"><span>Centre de contrôle</span></a>
      <nav>${LINKS.map(([key, href, label]) => `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`).join("")}</nav>
      <div class="control-foot">
        <a href="${PUBLIC_SITE}" target="_blank" rel="noopener">Voir l'Académie ↗</a>
        <button class="link-button" data-action="logout">Déconnexion</button>
      </div>
    </aside>
    <section class="control-main">
      <h1>${esc(title)}</h1>
      <div data-admin>${content}</div>
    </section>
  </div>`;
  return root.querySelector("[data-admin]");
}
