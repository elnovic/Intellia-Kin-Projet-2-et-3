// Annonces de formations, événements et actualités.

import { optionalUser, requireAdmin } from "../auth.js";
import { isUniqueError, newId, now } from "../db.js";
import { conflict, json, noContent, notFound, readJson } from "../http.js";
import { slugify } from "../model.js";
import { bool, datetime, email, int, isUuid, oneOf, parseObject, phone, slug, str, url } from "../validate.js";

const KINDS = ["formation", "evenement", "actualite"];
const AUDIENCES = ["jeune_diplome", "entrepreneur", "pme", "tous"];

const baseSchema = {
  kind: oneOf(KINDS),
  title: str({ min: 3, max: 200 }),
  summary: str({ min: 10, max: 160 }),
  body: str({ max: 30_000, default: "" }),
  cover_image: url({ default: null }),
  audience: oneOf(AUDIENCES, { default: "tous" }),
  pinned: bool({ default: false }),
  expires_at: datetime({ default: null }),
  starts_at: datetime({ default: null }),
  ends_at: datetime({ default: null }),
  timezone: str({ max: 60, default: "Africa/Kinshasa" }),
  location: str({ max: 300, default: null }),
  online_url: url({ default: null }),
  capacity: int({ min: 1, max: 100_000, default: null }),
  registration_deadline: datetime({ default: null }),
  registration_mode: oneOf(["none", "internal", "external"], { default: "none" }),
  external_url: url({ default: null }),
  course_slug: slug({ default: null }),
};

function coherent(a) {
  if (a.kind === "evenement" && !a.starts_at) return "un événement doit avoir une date de début";
  if (a.starts_at && a.ends_at && a.ends_at < a.starts_at) return "la fin doit être après le début";
  if (a.registration_mode === "external" && !a.external_url) return "indiquer le lien d'inscription externe";
  return null;
}

function parseAnnouncement(body, slugRule) {
  const data = parseObject({ ...baseSchema, slug: slugRule }, body, { check: coherent });
  if (data.kind === "actualite") data.registration_mode = "none";
  return data;
}

const FIELDS = Object.keys(baseSchema);

const countOf = (db, a) => db.value(`SELECT COUNT(*) FROM registrations WHERE announcement_id = ?`, a.id);
// Nombre d'inscrits calculé dans la même requête que la liste.
const WITH_COUNT = `SELECT a.*, (SELECT COUNT(*) FROM registrations r WHERE r.announcement_id = a.id) AS registered_count FROM announcements a`;

function registrationOpen(a, count) {
  if (a.registration_mode !== "internal" || a.status !== "published") return false;
  const deadline = a.registration_deadline || a.starts_at;
  if (deadline && now() > deadline) return false;
  if (a.capacity !== null && a.capacity !== undefined && count >= a.capacity) return false;
  return true;
}

async function out(db, a) {
  const count = a.registered_count ?? (await countOf(db, a));
  return {
    id: a.id,
    slug: a.slug,
    kind: a.kind,
    title: a.title,
    summary: a.summary,
    body: a.body,
    cover_image: a.cover_image ?? null,
    audience: a.audience,
    status: a.status,
    pinned: Boolean(a.pinned),
    published_at: a.published_at ?? null,
    expires_at: a.expires_at ?? null,
    starts_at: a.starts_at ?? null,
    ends_at: a.ends_at ?? null,
    timezone: a.timezone,
    location: a.location ?? null,
    online_url: a.online_url ?? null,
    capacity: a.capacity ?? null,
    registration_deadline: a.registration_deadline ?? null,
    registration_mode: a.registration_mode,
    external_url: a.external_url ?? null,
    course_slug: a.course_slug ?? null,
    registered_count: count,
    registration_open: registrationOpen(a, count),
  };
}

async function visible(db, slugValue) {
  const a = await db.first(`SELECT * FROM announcements WHERE slug = ? AND status = 'published'`, slugValue);
  if (!a || (a.expires_at && a.expires_at < now())) throw notFound("Annonce introuvable.");
  return a;
}

async function getById(db, id) {
  const a = isUuid(id) ? await db.first(`SELECT * FROM announcements WHERE id = ?`, id) : null;
  if (!a) throw notFound("Annonce introuvable.");
  return a;
}

async function slugTaken(db, value, exceptId = null) {
  const row = await db.first(`SELECT id FROM announcements WHERE slug = ? AND id IS NOT ?`, value, exceptId);
  return Boolean(row);
}

async function registrationsOf(db, id) {
  return db.all(
    `SELECT id, full_name, email, phone, organization, created_at FROM registrations WHERE announcement_id = ? ORDER BY created_at`,
    id,
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function frenchDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function announcementRoutes(router) {
  // --- Public -----------------------------------------------------------------
  router.get("/announcements", async (ctx) => {
    const q = parseObject(
      {
        kind: oneOf(KINDS, { optional: true }),
        when: oneOf(["all", "upcoming", "past"], { default: "all" }),
        limit: int({ default: 50 }),
      },
      Object.fromEntries(ctx.url.searchParams),
    );
    const at = now();
    let sql = `${WITH_COUNT} WHERE status = 'published' AND (expires_at IS NULL OR expires_at > ?)`;
    const params = [at];
    if (q.kind) {
      sql += ` AND kind = ?`;
      params.push(q.kind);
    }
    if (q.when === "upcoming") {
      sql += ` AND starts_at >= ?`;
      params.push(at);
    } else if (q.when === "past") {
      sql += ` AND starts_at < ?`;
      params.push(at);
    }
    sql += ` ORDER BY pinned DESC, published_at DESC LIMIT ?`;
    params.push(Math.max(1, Math.min(q.limit, 100)));
    const rows = await ctx.db.all(sql, ...params);
    return json(await Promise.all(rows.map((a) => out(ctx.db, a))));
  });

  router.get("/announcements/:slug", async (ctx) => json(await out(ctx.db, await visible(ctx.db, ctx.params.slug))));

  router.post("/announcements/:slug/register", async (ctx) => {
    const user = await optionalUser(ctx);
    const a = await visible(ctx.db, ctx.params.slug);
    const data = parseObject(
      {
        full_name: str({ min: 2, max: 120 }),
        email: email(),
        phone: phone({ default: null }),
        organization: str({ max: 200, default: null }),
      },
      await readJson(ctx.request),
    );
    if (!registrationOpen(a, await countOf(ctx.db, a))) throw conflict("Les inscriptions sont fermées.");
    try {
      await ctx.db.run(
        `INSERT INTO registrations (id, announcement_id, user_id, full_name, email, phone, organization, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), a.id, user ? user.id : null, data.full_name.split(/\s+/).join(" "), data.email.toLowerCase(),
        data.phone, data.organization || null, now(),
      );
    } catch (err) {
      if (isUniqueError(err)) throw conflict("Cette adresse e-mail est déjà inscrite.");
      throw err;
    }
    return json(await out(ctx.db, a), 201);
  });

  // --- Administration ---------------------------------------------------------------
  router.get("/admin/announcements", async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.all(`${WITH_COUNT} ORDER BY created_at DESC`);
    return json(await Promise.all(rows.map((a) => out(ctx.db, a))));
  });

  router.post("/admin/announcements", async (ctx) => {
    await requireAdmin(ctx);
    const data = parseAnnouncement(await readJson(ctx.request), slug({ default: null }));
    let value = data.slug;
    if (value) {
      if (await slugTaken(ctx.db, value)) throw conflict("Cette adresse est déjà prise.");
    } else {
      const base = slugify(data.title);
      value = base;
      for (let n = 2; await slugTaken(ctx.db, value); n++) value = `${base}-${n}`;
    }
    const id = newId();
    await ctx.db.run(
      `INSERT INTO announcements (id, slug, status, created_at, ${FIELDS.join(", ")})
       VALUES (?, ?, 'draft', ?, ${FIELDS.map(() => "?").join(", ")})`,
      id, value, now(), ...FIELDS.map((f) => data[f]),
    );
    return json(await out(ctx.db, await getById(ctx.db, id)), 201);
  });

  router.put("/admin/announcements/:id", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    const data = parseAnnouncement(await readJson(ctx.request), slug());
    if (await slugTaken(ctx.db, data.slug, a.id)) throw conflict("Cette adresse est déjà prise.");
    await ctx.db.run(
      `UPDATE announcements SET slug = ?, ${FIELDS.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`,
      data.slug, ...FIELDS.map((f) => data[f]), a.id,
    );
    return json(await out(ctx.db, await getById(ctx.db, a.id)));
  });

  router.post("/admin/announcements/:id/publish", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    await ctx.db.run(
      `UPDATE announcements SET status = 'published', published_at = COALESCE(published_at, ?) WHERE id = ?`,
      now(), a.id,
    );
    return json(await out(ctx.db, await getById(ctx.db, a.id)));
  });

  router.post("/admin/announcements/:id/unpublish", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    await ctx.db.run(`UPDATE announcements SET status = 'draft' WHERE id = ?`, a.id);
    return json(await out(ctx.db, await getById(ctx.db, a.id)));
  });

  router.delete("/admin/announcements/:id", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    await ctx.db.run(`DELETE FROM announcements WHERE id = ?`, a.id);
    return noContent();
  });

  router.get("/admin/announcements/:id/registrations", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    return json(await registrationsOf(ctx.db, a.id));
  });

  router.get("/admin/announcements/:id/registrations.csv", async (ctx) => {
    await requireAdmin(ctx);
    const a = await getById(ctx.db, ctx.params.id);
    const lines = [["Nom", "E-mail", "Téléphone", "Organisation", "Inscrit le"]];
    for (const r of await registrationsOf(ctx.db, a.id)) {
      lines.push([r.full_name, r.email, r.phone || "", r.organization || "", frenchDate(r.created_at)]);
    }
    const body = "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inscrits-${a.slug}.csv"`,
      },
    });
  });
}
