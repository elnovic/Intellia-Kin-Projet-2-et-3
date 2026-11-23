// Mot de passe oublié.
//
// 1. Par e-mail : l'apprenant demande un code à 6 chiffres (valable 15 minutes,
//    5 essais, 3 demandes par heure), puis choisit un nouveau mot de passe.
// 2. Par l'équipe (secours, ou si l'envoi d'e-mails n'est pas configuré) : un
//    administrateur crée dans le centre de contrôle un lien valable 24 heures,
//    qu'il transmet à l'apprenant après avoir vérifié son identité.
//
// Les codes et liens ne sont jamais stockés en clair (empreinte HMAC). Changer le
// mot de passe ferme toutes les sessions ouvertes avec l'ancien.

import { createToken, hashPassword, passwordVersion, requireAdmin } from "../auth.js";
import { newId, now } from "../db.js";
import { emailEnabled, resetCodeEmail, sendEmail } from "../email.js";
import { HttpError, json, notFound, readJson } from "../http.js";
import { email, isUuid, parseObject, str } from "../validate.js";

const CODE_MINUTES = 15;
const CODE_ATTEMPTS = 5;
const CODES_PER_HOUR = 3;
const LINK_HOURS = 24;

const enc = new TextEncoder();

async function secretHash(config, id, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(config.secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`reinitialisation|${id}|${secret}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomCode() {
  // 6 chiffres, tirage uniforme.
  const values = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(values);
    n = values[0];
  } while (n >= 4_294_000_000);
  return String(n % 1_000_000).padStart(6, "0");
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const later = (ms) => new Date(Date.now() + ms).toISOString();
const invalid = () => new HttpError(400, "Code invalide ou expiré. Demandez un nouveau code.");
const passwordRule = () => str({ min: 8, max: 128, trim: false });

/** Enregistre le nouveau mot de passe, clôt les demandes en cours et ouvre une session. */
async function finish(ctx, user, password) {
  const hash = await hashPassword(password, ctx.config.secretKey);
  await ctx.db.batch([
    ctx.db.stmt(`UPDATE users SET password_hash = ? WHERE id = ?`, hash, user.id),
    ctx.db.stmt(`UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL`, now(), user.id),
  ]);
  const token = await createToken(user.id, ctx.config.secretKey, ctx.config.tokenMinutes, await passwordVersion(hash));
  return json({ access_token: token, token_type: "bearer" });
}

export function passwordRoutes(router) {
  // Comment l'Académie peut aider : par e-mail, ou par l'équipe.
  router.get("/auth/password/options", async (ctx) => json({ email: emailEnabled(ctx.config) }));

  router.post("/auth/password/forgot", async (ctx) => {
    const data = parseObject({ email: email() }, await readJson(ctx.request));
    if (!emailEnabled(ctx.config)) return json({ method: "equipe" });
    const user = await ctx.db.first(`SELECT id, email, full_name, is_active FROM users WHERE email = ?`, data.email.toLowerCase());
    // Même réponse que le compte existe ou non, pour ne pas révéler les adresses inscrites.
    if (!user || !user.is_active) return json({ method: "email" });
    const recent = await ctx.db.value(
      `SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND kind = 'code' AND created_at > ?`,
      user.id, later(-3600_000),
    );
    if (recent >= CODES_PER_HOUR) {
      throw new HttpError(429, "Trop de demandes. Patientez une heure, ou utilisez le dernier code reçu.");
    }
    const id = newId();
    const code = randomCode();
    // Un nouveau code remplace les précédents.
    await ctx.db.batch([
      ctx.db.stmt(`UPDATE password_resets SET used_at = ? WHERE user_id = ? AND kind = 'code' AND used_at IS NULL`, now(), user.id),
      ctx.db.stmt(
        `INSERT INTO password_resets (id, user_id, kind, secret_hash, expires_at, created_at) VALUES (?, ?, 'code', ?, ?, ?)`,
        id, user.id, await secretHash(ctx.config, id, code), later(CODE_MINUTES * 60_000), now(),
      ),
    ]);
    const message = resetCodeEmail({ name: user.full_name, code, minutes: CODE_MINUTES, academyUrl: ctx.config.academyUrl });
    await sendEmail(ctx.config, { to: user.email, ...message });
    return json({ method: "email" });
  });

  router.post("/auth/password/reset", async (ctx) => {
    const body = await readJson(ctx.request);
    if (body && typeof body === "object" && "token" in body) {
      // Lien créé par l'équipe : « <id>.<secret> ».
      const data = parseObject({ token: str({ min: 20, max: 200 }), password: passwordRule() }, body);
      const [id, secret] = data.token.split(".");
      const reset = isUuid(id) && secret ? await ctx.db.first(`SELECT * FROM password_resets WHERE id = ? AND kind = 'lien'`, id) : null;
      const ok = reset && !reset.used_at && reset.expires_at > now() && sameText(reset.secret_hash, await secretHash(ctx.config, id, secret));
      if (!ok) throw new HttpError(400, "Ce lien n'est plus valable. Demandez-en un nouveau à l'équipe Intellia Kin.");
      const user = await ctx.db.first(`SELECT * FROM users WHERE id = ? AND is_active = 1`, reset.user_id);
      if (!user) throw new HttpError(400, "Ce lien n'est plus valable. Demandez-en un nouveau à l'équipe Intellia Kin.");
      return finish(ctx, user, data.password);
    }

    const data = parseObject(
      { email: email(), code: str({ min: 6, max: 6, pattern: /^\d{6}$/, patternMessage: "6 chiffres attendus" }), password: passwordRule() },
      body,
    );
    const user = await ctx.db.first(`SELECT * FROM users WHERE email = ? AND is_active = 1`, data.email.toLowerCase());
    if (!user) throw invalid();
    const reset = await ctx.db.first(
      `SELECT * FROM password_resets WHERE user_id = ? AND kind = 'code' AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      user.id, now(),
    );
    if (!reset || reset.attempts >= CODE_ATTEMPTS) throw invalid();
    if (!sameText(reset.secret_hash, await secretHash(ctx.config, reset.id, data.code))) {
      await ctx.db.run(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?`, reset.id);
      const left = CODE_ATTEMPTS - reset.attempts - 1;
      throw new HttpError(400, left > 0 ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? "s" : ""}.` : "Code incorrect. Demandez un nouveau code.");
    }
    return finish(ctx, user, data.password);
  });

  // --- Centre de contrôle : retrouver un apprenant et lui créer un lien ------------------
  router.get("/admin/users", async (ctx) => {
    await requireAdmin(ctx);
    const q = (new URL(ctx.request.url).searchParams.get("q") || "").trim().toLowerCase().slice(0, 100);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await ctx.db.all(
      `SELECT id, email, full_name, phone, role, is_active, created_at FROM users
       WHERE ? = '' OR lower(email) LIKE ? ESCAPE '\\' OR lower(full_name) LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC LIMIT 25`,
      q, like, like, like,
    );
    const total = await ctx.db.value(`SELECT COUNT(*) FROM users`);
    return json({
      total,
      users: rows.map((u) => ({ ...u, is_active: Boolean(u.is_active), phone: u.phone ?? null })),
    });
  });

  router.post("/admin/users/:id/reset-link", async (ctx) => {
    const admin = await requireAdmin(ctx);
    const user = isUuid(ctx.params.id) ? await ctx.db.first(`SELECT id, email, is_active FROM users WHERE id = ?`, ctx.params.id) : null;
    if (!user) throw notFound("Compte introuvable.");
    if (!user.is_active) throw new HttpError(409, "Ce compte est désactivé.");
    const id = newId();
    const secret = randomSecret();
    const expires = later(LINK_HOURS * 3600_000);
    // Un nouveau lien remplace les précédents.
    await ctx.db.batch([
      ctx.db.stmt(`UPDATE password_resets SET used_at = ? WHERE user_id = ? AND kind = 'lien' AND used_at IS NULL`, now(), user.id),
      ctx.db.stmt(
        `INSERT INTO password_resets (id, user_id, kind, secret_hash, expires_at, created_by, created_at) VALUES (?, ?, 'lien', ?, ?, ?, ?)`,
        id, user.id, await secretHash(ctx.config, id, secret), expires, admin.id, now(),
      ),
    ]);
    return json({
      url: `${ctx.config.academyUrl}/mot-de-passe-oublie?lien=${encodeURIComponent(`${id}.${secret}`)}`,
      expires_at: expires,
      email: user.email,
    }, 201);
  });
}
