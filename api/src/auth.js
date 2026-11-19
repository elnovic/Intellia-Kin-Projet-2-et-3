// Mots de passe, jetons d'accès et utilisateur connecté.
//
// Mots de passe : PBKDF2-SHA256 avec sel aléatoire, précédé d'un HMAC avec une
// clé secrète du serveur (« poivre ») : une copie de la base seule ne suffit pas
// pour tenter de retrouver les mots de passe. Le nombre d'itérations est choisi
// pour rester dans le temps de calcul de l'offre gratuite de Cloudflare ; il est
// enregistré avec chaque empreinte, ce qui permet de le relever plus tard.

import { HttpError } from "./http.js";

export const PBKDF2_ITERATIONS = 30_000;
const enc = new TextEncoder();

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (text) => unb64(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function derive(password, salt, iterations, pepper) {
  const peppered = await crypto.subtle.sign("HMAC", await hmacKey(pepper), enc.encode(password));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password, pepper) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS, pepper);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored, pepper) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false;
  const expected = unb64(parts[3]);
  const actual = new Uint8Array(await derive(password, unb64(parts[2]), iterations, pepper));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Jetons (JWT HS256) ------------------------------------------------------

export async function createToken(userId, secret, minutes) {
  const issued = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ sub: userId, iat: issued, exp: issued + minutes * 60 })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Identifiant de l'utilisateur, ou null si le jeton est invalide ou expiré. */
export async function readToken(token, secret) {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const head = JSON.parse(new TextDecoder().decode(unb64url(header)));
    if (head.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(signature), enc.encode(`${header}.${payload}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

// --- Utilisateur connecté ----------------------------------------------------

const unauthorized = (detail) => new HttpError(401, detail, { "WWW-Authenticate": "Bearer" });

/** Utilisateur connecté, ou null si la requête est anonyme. */
export async function optionalUser(ctx) {
  if (ctx._user !== undefined) return ctx._user;
  const header = ctx.request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    ctx._user = null;
    return null;
  }
  const userId = await readToken(match[1].trim(), ctx.config.secretKey);
  if (!userId) throw unauthorized("Session invalide ou expirée. Reconnectez-vous.");
  const user = await ctx.db.first(`SELECT * FROM users WHERE id = ?`, userId);
  if (!user || !user.is_active) throw unauthorized("Compte introuvable ou désactivé.");
  ctx._user = user;
  return user;
}

export async function currentUser(ctx) {
  const user = await optionalUser(ctx);
  if (!user) throw unauthorized("Connexion requise.");
  return user;
}

export async function requireAdmin(ctx) {
  const user = await currentUser(ctx);
  if (user.role !== "admin") throw new HttpError(403, "Accès réservé aux administrateurs.");
  return user;
}

export function userOut(u) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone ?? null,
    phone_verified: Boolean(u.phone_verified),
    role: u.role,
    audience: u.audience ?? null,
    created_at: u.created_at,
  };
}
