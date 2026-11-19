// Petits outils d'affichage partagés par les pages.

import { escapeHtml } from "./md.js";

export const esc = escapeHtml;

export const LABELS = {
  audience: {
    tous: "Tous publics",
    jeune_diplome: "Jeunes diplômés",
    entrepreneur: "Entrepreneurs",
    pme: "PME et organisations",
  },
  parcours: {
    "tronc-commun": "Tronc commun",
    carriere: "Carrière et employabilité",
    entrepreneuriat: "Entrepreneuriat",
    organisations: "Organisations",
  },
  level: { debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé" },
  kind: { formation: "Formation", evenement: "Événement", actualite: "Actualité" },
};

export const PARCOURS_ORDER = ["tronc-commun", "carriere", "entrepreneuriat", "organisations"];

export function duration(minutes = 0) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export function formatDate(value, withTime = false, timeZone) {
  if (!value) return "";
  const options = { day: "numeric", month: "long", year: "numeric" };
  if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
  if (timeZone) options.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat("fr-FR", options).format(new Date(value));
  } catch (_) {
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: undefined }).format(new Date(value));
  }
}

export function toast(message, kind = "info") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const item = document.createElement("div");
  item.className = `toast toast-${kind}`;
  item.setAttribute("role", kind === "error" ? "alert" : "status");
  item.textContent = message;
  box.appendChild(item);
  setTimeout(() => item.remove(), 5000);
}

export function loading(text = "Chargement…") {
  return `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;
}

export function errorBox(error, retry = true) {
  return `<div class="notice notice-error" role="alert"><p>${esc(error.message || error)}</p>${
    retry ? '<button class="ik-bouton ik-bouton-secondaire" data-action="reload">Réessayer</button>' : ""
  }</div>`;
}

export function badge(text, variant = "") {
  return `<span class="badge ${variant ? `badge-${variant}` : ""}">${esc(text)}</span>`;
}

export function icon(name) {
  // Icônes en trait fin, conformes à la charte.
  const paths = {
    book: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h6"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    map: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${
    paths[name] || ""
  }</svg>`;
}

export function setTitle(title, description) {
  document.title = title ? `${title} · Académie Intellia Kin` : "Académie Intellia Kin";
  if (description) document.querySelector('meta[name="description"]')?.setAttribute("content", description);
}

export function formData(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    const text = typeof value === "string" ? value.trim() : value;
    if (text !== "") data[key] = text;
  }
  return data;
}

export async function withBusy(button, task) {
  const label = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Patientez…';
  }
  try {
    return await task();
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

export function shareLinks(url, text) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return `<div class="share">
    <a class="ik-bouton ik-bouton-secondaire" href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener">${icon("share")} WhatsApp</a>
    <a class="ik-bouton ik-bouton-secondaire" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener">${icon("share")} LinkedIn</a>
  </div>`;
}
