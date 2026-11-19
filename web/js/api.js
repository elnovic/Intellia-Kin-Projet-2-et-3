// Appels à l'API, session et réveil du serveur.

const CONFIG = window.IK_CONFIG || {};
export const API_BASE = (CONFIG.apiBase || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "ik_token";
const USER_KEY = "ik_user";

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) {
    /* navigation privée : la session dure le temps de l'onglet */
  }
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

let memoryToken = read(TOKEN_KEY);
let memoryUser = JSON.parse(read(USER_KEY) || "null");

export const session = {
  get token() {
    return memoryToken;
  },
  get user() {
    return memoryUser;
  },
  get isAdmin() {
    return memoryUser?.role === "admin";
  },
  set(token, user) {
    memoryToken = token;
    memoryUser = user;
    store(TOKEN_KEY, token);
    store(USER_KEY, user ? JSON.stringify(user) : null);
    window.dispatchEvent(new Event("ik:session"));
  },
  clear() {
    this.set(null, null);
  },
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function messageFrom(body, status) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.message) return detail.message;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = (first.loc || []).filter((p) => p !== "body").join(" › ");
    return field ? `${field} : ${translate(first.msg)}` : translate(first.msg);
  }
  if (status >= 500) return "Le serveur a rencontré un problème. Réessayez dans un instant.";
  return "La demande n'a pas abouti.";
}

function translate(msg = "") {
  return msg
    .replace("value is not a valid email address", "adresse e-mail invalide")
    .replace(/String should have at least (\d+) characters?/, "au moins $1 caractères")
    .replace(/String should have at most (\d+) characters?/, "au plus $1 caractères")
    .replace("Field required", "champ obligatoire")
    .replace("String should match pattern", "format invalide");
}

// Le serveur gratuit s'endort après 15 minutes : on prévient si la réponse tarde.
let pending = 0;
function wakeNotice(show) {
  const el = document.getElementById("wake-notice");
  if (el) el.hidden = !show;
}

export async function api(path, { method = "GET", body, auth = true, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  pending += 1;
  const timer = setTimeout(() => wakeNotice(true), 2500);
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (_) {
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion internet.");
  } finally {
    clearTimeout(timer);
    pending -= 1;
    if (pending === 0) wakeNotice(false);
  }
  if (response.status === 401 && memoryToken && auth) {
    session.clear();
  }
  if (raw) return response;
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageFrom(data, response.status), data?.detail);
  return data;
}

export function mediaUrl(src) {
  if (!src) return src;
  return src.startsWith("/media/") ? API_BASE + src : src;
}

export async function refreshUser() {
  if (!memoryToken) return null;
  try {
    const user = await api("/auth/me");
    session.set(memoryToken, user);
    return user;
  } catch (_) {
    return memoryUser;
  }
}
