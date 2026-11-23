// Inscription, connexion et profil.

import { createToken, currentUser, hashPassword, passwordVersion, userOut, verifyPassword } from "../auth.js";
import { conflict, HttpError, json, readJson } from "../http.js";
import { newId, now } from "../db.js";
import { email, oneOf, parseObject, phone, str } from "../validate.js";

const USER_AUDIENCES = ["jeune_diplome", "entrepreneur", "pme", "autre"];

export function authRoutes(router) {
  router.post("/auth/register", async (ctx) => {
    const data = parseObject(
      {
        email: email(),
        password: str({ min: 8, max: 128, trim: false }),
        full_name: str({ min: 2, max: 120 }),
        phone: phone({ default: null }),
        audience: oneOf(USER_AUDIENCES, { default: null }),
      },
      await readJson(ctx.request),
    );
    const address = data.email.toLowerCase();
    if (await ctx.db.first(`SELECT id FROM users WHERE email = ?`, address)) {
      throw conflict("Un compte existe déjà avec cette adresse e-mail.");
    }
    if (data.phone && (await ctx.db.first(`SELECT id FROM users WHERE phone = ?`, data.phone))) {
      throw conflict("Un compte existe déjà avec ce numéro de téléphone.");
    }
    const user = {
      id: newId(),
      email: address,
      phone: data.phone,
      phone_verified: 0,
      full_name: data.full_name,
      password_hash: await hashPassword(data.password, ctx.config.secretKey),
      role: "learner",
      audience: data.audience,
      is_active: 1,
      created_at: now(),
    };
    await ctx.db.run(
      `INSERT INTO users (id, email, phone, phone_verified, full_name, password_hash, role, audience, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, user.email, user.phone, user.phone_verified, user.full_name, user.password_hash,
      user.role, user.audience, user.is_active, user.created_at,
    );
    return json(userOut(user), 201);
  });

  router.post("/auth/login", async (ctx) => {
    const data = parseObject(
      { email: email(), password: str({ min: 1, max: 128, trim: false }) },
      await readJson(ctx.request),
    );
    const user = await ctx.db.first(`SELECT * FROM users WHERE email = ?`, data.email.toLowerCase());
    // Même message dans tous les cas, pour ne pas révéler quels comptes existent.
    const ok = user && user.is_active && (await verifyPassword(data.password, user.password_hash, ctx.config.secretKey));
    if (!ok) throw new HttpError(401, "Adresse e-mail ou mot de passe incorrect.");
    const token = await createToken(user.id, ctx.config.secretKey, ctx.config.tokenMinutes, await passwordVersion(user.password_hash));
    return json({ access_token: token, token_type: "bearer" });
  });

  router.get("/auth/me", async (ctx) => json(userOut(await currentUser(ctx))));
}

/** Crée l'administrateur, ou le promeut et met à jour son mot de passe. */
export async function ensureAdmin(db, config) {
  const address = config.adminEmail.trim().toLowerCase();
  const user = await db.first(`SELECT * FROM users WHERE email = ?`, address);
  if (!user) {
    await db.run(
      `INSERT INTO users (id, email, full_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`,
      newId(), address, config.adminName, await hashPassword(config.adminPassword, config.secretKey), now(),
    );
    return "créé";
  }
  let outcome = "inchangé";
  if (user.role !== "admin") {
    await db.run(`UPDATE users SET role = 'admin' WHERE id = ?`, user.id);
    outcome = "promu";
  }
  if (!(await verifyPassword(config.adminPassword, user.password_hash, config.secretKey))) {
    await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, await hashPassword(config.adminPassword, config.secretKey), user.id);
    outcome = "mis à jour";
  }
  return outcome;
}
