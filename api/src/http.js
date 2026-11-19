// Réponses HTTP, erreurs et routage.

import { ValidationError } from "./validate.js";
import { BlockError } from "./blocks.js";

export class HttpError extends Error {
  constructor(status, detail, headers = {}) {
    super(typeof detail === "string" ? detail : detail?.message || "Erreur");
    this.status = status;
    this.detail = detail;
    this.headers = headers;
  }
}

export const notFound = (detail) => new HttpError(404, detail);
export const conflict = (detail) => new HttpError(409, detail);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export const noContent = () => new Response(null, { status: 204 });

export function errorResponse(err) {
  if (err instanceof HttpError) return json({ detail: err.detail }, err.status, err.headers);
  if (err instanceof ValidationError) {
    return json({ detail: { message: validationMessage(err.errors), erreurs: err.errors } }, 422);
  }
  if (err instanceof BlockError) return json({ detail: { message: err.message, erreurs: err.errors } }, 422);
  console.error(err?.stack || err);
  return json({ detail: "Le serveur a rencontré un problème. Réessayez dans un instant." }, 500);
}

function validationMessage(errors) {
  const first = errors[0];
  if (!first) return "Certains champs sont invalides.";
  return first.champ && first.champ !== "bloc" ? `${first.champ} : ${first.message}` : first.message;
}

export async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Le contenu envoyé n'est pas du JSON valide.");
  }
}

/** Routeur minimal : « /courses/:slug/lessons/:id ». */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp(
      "^" +
        pattern.replace(/\./g, "\\.").replace(/\/:([a-zA-Z_]+)/g, (_, name) => {
          names.push(name);
          return "/([^/]+)";
        }) +
        "/?$",
    );
    this.routes.push({ method, regex, names, handler });
    return this;
  }

  get(p, h) {
    return this.add("GET", p, h);
  }
  post(p, h) {
    return this.add("POST", p, h);
  }
  put(p, h) {
    return this.add("PUT", p, h);
  }
  patch(p, h) {
    return this.add("PATCH", p, h);
  }
  delete(p, h) {
    return this.add("DELETE", p, h);
  }

  match(method, path) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method && !(method === "HEAD" && route.method === "GET")) continue;
      const params = {};
      route.names.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return pathMatched ? { notAllowed: true } : null;
  }
}

export function corsHeaders(request, allowed) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
