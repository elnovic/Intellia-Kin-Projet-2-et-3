// Routeur et mise en page de l'Académie Intellia Kin.

import { refreshUser, session } from "./api.js";
import * as community from "./pages-community.js";
import * as courses from "./pages-courses.js";
import * as tools from "./pages-tools.js";
import { errorBox, esc, icon } from "./ui.js";

const routes = [
  ["/", community.home],
  ["/cours", courses.catalogue],
  ["/cours/:slug", courses.coursePage],
  ["/cours/:slug/lecon/:lessonId", courses.lessonPage],
  ["/cours/:slug/examen", courses.examPage],
  ["/attestation/:number", courses.certificatePage],
  ["/annonces", community.announcements],
  ["/annonces/:slug", community.announcementPage],
  ["/outils", tools.toolsPage],
  ["/outils/:slug", tools.toolPage],
  ["/connexion", community.loginPage],
  ["/inscription", community.registerPage],
  ["/mot-de-passe-oublie", community.forgotPasswordPage],
  ["/mon-espace", community.mySpace],
];

function match(path) {
  const clean = path.replace(/\/+$/, "") || "/";
  for (const [pattern, handler] of routes) {
    const names = [];
    const regex = new RegExp(
      "^" + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => (names.push(name), "([^/]+)")) + "$"
    );
    const found = clean.match(regex);
    if (found) {
      const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(found[i + 1])]));
      return { handler, params };
    }
  }
  return null;
}

const view = () => document.getElementById("view");

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  render();
}

function updateNav() {
  const path = location.pathname;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const target = link.getAttribute("href");
    const active = target === "/" ? path === "/" : path.startsWith(target);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const account = document.getElementById("nav-account");
  if (account) {
    account.innerHTML = session.user
      ? `<a href="/mon-espace" data-nav class="nav-user">${esc(session.user.full_name.split(" ")[0])}</a>
         <button class="link-button" data-action="logout">Déconnexion</button>`
      : `<a href="/connexion" data-nav>Connexion</a>
         <a href="/inscription" class="ik-bouton ik-bouton-petit">Créer un compte</a>`;
  }
}

export async function render() {
  const found = match(location.pathname);
  document.body.classList.remove("menu-open");
  updateNav();
  const root = view();
  if (!found) {
    root.innerHTML = `<section class="page narrow"><h1>Page introuvable</h1>
      <p>Cette page n'existe pas ou a été déplacée.</p><a class="ik-bouton" href="/">Retour à l'accueil</a></section>`;
    return;
  }
  window.scrollTo(0, 0);
  try {
    await found.handler(root, found.params, { navigate, render });
  } catch (error) {
    console.error(error);
    root.innerHTML = `<section class="page narrow">${errorBox(error)}</section>`;
  }
  root.querySelectorAll("h1")[0]?.setAttribute("tabindex", "-1");
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (
    link &&
    link.origin === location.origin &&
    !link.target &&
    !link.hasAttribute("download") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    const target = link.pathname + link.search + link.hash;
    if (link.pathname + link.search === location.pathname + location.search && link.hash) {
      document.getElementById(link.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
      history.replaceState({}, "", target);
    } else if (target !== location.pathname + location.search + location.hash) {
      navigate(target);
    }
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "logout") {
    session.clear();
    navigate("/");
  } else if (action === "reload") {
    render();
  } else if (action === "menu") {
    document.body.classList.toggle("menu-open");
  }
});

// Image introuvable (adresse erronée, page web au lieu d'une image…) : dans une
// carte d'annonce, le visuel par défaut prend sa place ; ailleurs,
// l'image est simplement retirée.
document.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
    img.dataset.failed = "1";
    if (img.closest(".announcement-card")) {
      const placeholder = document.createElement("div");
      placeholder.className = "announcement-placeholder";
      placeholder.innerHTML = icon("spark");
      img.replaceWith(placeholder);
    } else {
      img.remove();
    }
  },
  true,
);

window.addEventListener("popstate", render);
window.addEventListener("ik:session", updateNav);

document.getElementById("year").textContent = new Date().getFullYear();
render();
refreshUser();
