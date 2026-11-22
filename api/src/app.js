// Application : configuration, préparation de la base, routage.
// Séparée de index.js pour pouvoir être testée avec un autre paquet de contenu.

import { sha256Hex } from "./auth.js";
import { importCourses } from "./content-import.js";
import { Db, ensureSchema } from "./db.js";
import { corsHeaders, errorResponse, HttpError, json, Router } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { announcementRoutes } from "./routes/announcements.js";
import { authRoutes, ensureAdmin } from "./routes/auth.js";
import { courseRoutes } from "./routes/courses.js";
import { toolRoutes } from "./routes/tools.js";
import { instagramRoutes } from "./routes/instagram.js";
import { dailyProposal, publishDue, refreshToken } from "./instagram.js";

export const DAILY_CRON = "0 5 * * *";
const DEV_SECRET = "cle-de-developpement-a-remplacer-avant-la-production";

function list(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* liste séparée par des virgules */
  }
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
}

export function readConfig(env) {
  const production = (env.ENVIRONMENT || "development") === "production";
  return {
    production,
    secretKey: env.SECRET_KEY || DEV_SECRET,
    tokenMinutes: Number(env.ACCESS_TOKEN_MINUTES || 7 * 24 * 60),
    corsOrigins: list(env.CORS_ORIGINS, []),
    adminEmail: env.ADMIN_EMAIL || "",
    adminPassword: env.ADMIN_PASSWORD || "",
    adminName: env.ADMIN_NAME || "Administrateur Intellia Kin",
    groqApiKey: env.GROQ_API_KEY || "",
    groqBaseUrl: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    groqModels: list(env.GROQ_MODELS, ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]),
    aiDailyLimit: Number(env.AI_DAILY_LIMIT || 3),
    publicApiUrl: (env.PUBLIC_API_URL || "").replace(/\/$/, ""),
    instagramGraphUrl: env.INSTAGRAM_GRAPH_URL || "https://graph.instagram.com",
    instagramApiVersion: env.INSTAGRAM_API_VERSION || "v25.0",
    fetch: env.FETCH,
  };
}

function originAllowed(config) {
  return (origin) =>
    config.corsOrigins.includes(origin) ||
    (!config.production && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

export function createApp(bundle) {
  const router = new Router();
  authRoutes(router);
  courseRoutes(router);
  announcementRoutes(router);
  toolRoutes(router);
  adminRoutes(router);
  instagramRoutes(router);
  router.get("/health", async () => json({ status: "ok" }));
  router.get("/", async () => json({ service: "API de l'Académie Intellia Kin", status: "ok" }));
  router.get("/media/cours/:slug/images/:file", async (ctx) => {
    const item = bundle.media[`${ctx.params.slug}/${ctx.params.file}`];
    if (!item) throw new HttpError(404, "Image introuvable.");
    const body = item.text ?? Uint8Array.from(atob(item.base64), (ch) => ch.charCodeAt(0));
    return new Response(body, {
      headers: {
        "Content-Type": item.type,
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  let ready = null;

  // Une fois par instance : tables, administrateur, cours du dépôt.
  async function prepare(db, config) {
    await ensureSchema(db);
    if (config.adminEmail && config.adminPassword) {
      const fingerprint = await sha256Hex(`${config.adminEmail}|${config.adminPassword}|${config.secretKey}`);
      const known = await db.value(`SELECT value FROM meta WHERE key = 'admin'`);
      if (known !== fingerprint) {
        const outcome = await ensureAdmin(db, config);
        console.log(`Administrateur ${config.adminEmail} : ${outcome}`);
        await db.run(`INSERT INTO meta (key, value) VALUES ('admin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, fingerprint);
      }
    }
    const imported = await db.value(`SELECT value FROM meta WHERE key = 'content'`);
    if (imported !== bundle.hash) {
      const report = await importCourses(db, bundle);
      console.log(`Import des cours : ${JSON.stringify(report)}`);
      if (!Object.values(report).some((r) => r.startsWith("erreur"))) {
        await db.run(`INSERT INTO meta (key, value) VALUES ('content', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, bundle.hash);
      }
    }
  }

  async function handle(request, env) {
    const config = readConfig(env);
    const url = new URL(request.url);
    const cors = corsHeaders(request, originAllowed(config));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let response;
    try {
      if (config.production && config.secretKey === DEV_SECRET) {
        throw new Error("SECRET_KEY doit être défini en production.");
      }
      if (!env.DB) throw new Error("La base D1 (DB) n'est pas reliée au Worker.");
      const db = new Db(env.DB);
      if (!ready) ready = prepare(db, config).catch((err) => {
        ready = null;
        throw err;
      });
      await ready;
      const match = router.match(request.method, url.pathname);
      if (!match) throw new HttpError(404, "Adresse introuvable.");
      if (match.notAllowed) throw new HttpError(405, "Méthode non autorisée.");
      if (!config.publicApiUrl) config.publicApiUrl = url.origin;
      response = await match.handler({ request, env, url, params: match.params, db, config });
    } catch (err) {
      response = errorResponse(err);
    }
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
  }

  // Tâches planifiées : proposition Instagram du jour (6 h à Kinshasa) et
  // publication des messages approuvés (toutes les 15 minutes).
  async function scheduled(event, env) {
    const config = readConfig(env);
    const db = new Db(env.DB);
    if (!ready) ready = prepare(db, config).catch((err) => {
      ready = null;
      throw err;
    });
    await ready;
    if (event.cron === DAILY_CRON) {
      console.log(`Jeton Instagram : ${await refreshToken(db, config)}`);
      try {
        console.log(`Proposition Instagram du jour : ${await dailyProposal(db, env, config)}`);
      } catch (err) {
        console.error(`Proposition Instagram impossible : ${err.message}`);
      }
    } else {
      const report = await publishDue(db, config);
      if (Object.keys(report).length) console.log(`Publications Instagram : ${JSON.stringify(report)}`);
    }
  }

  return { handle, prepare, scheduled, reset: () => (ready = null) };
}
