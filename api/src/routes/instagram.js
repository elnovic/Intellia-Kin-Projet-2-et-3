// Centre de contrôle : agent Instagram (propositions, validation, publication).

import { requireAdmin } from "../auth.js";
import { now } from "../db.js";
import { conflict, HttpError, json, noContent, notFound, readJson } from "../http.js";
import {
  connect,
  connectionOut,
  drawBackground,
  fromBase64,
  getConnection,
  propose,
  publishPost,
  removeConnection,
  THEMES,
  writeText,
} from "../instagram.js";
import { arr, datetime, isUuid, oneOf, parseObject, str } from "../validate.js";

// Colonnes sans les images, pour les listes.
const LIGHT = `id, theme, topic_ref, headline, caption, hashtags, status, scheduled_at, published_at,
  ig_media_id, permalink, error, created_at, updated_at,
  background IS NOT NULL AS has_background, image IS NOT NULL AS has_image`;

const EDITABLE = ["proposed", "approved", "failed"];
const MAX_IMAGE = 1_400_000; // caractères base64, environ 1 Mo

function postOut(p) {
  return {
    id: p.id,
    theme: p.theme,
    theme_label: THEMES[p.theme] || p.theme,
    topic_ref: p.topic_ref,
    headline: p.headline,
    caption: p.caption,
    hashtags: JSON.parse(p.hashtags || "[]"),
    status: p.status,
    scheduled_at: p.scheduled_at ?? null,
    published_at: p.published_at ?? null,
    permalink: p.permalink ?? null,
    error: p.error ?? null,
    has_background: Boolean(p.has_background),
    has_image: Boolean(p.has_image),
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

async function load(db, id) {
  const post = isUuid(id) ? await db.first(`SELECT ${LIGHT} FROM instagram_posts WHERE id = ?`, id) : null;
  if (!post) throw notFound("Publication introuvable.");
  return post;
}

function editable(post) {
  if (!EDITABLE.includes(post.status)) {
    throw conflict(post.status === "published" ? "Cette publication est déjà en ligne." : "Cette publication ne peut plus être modifiée.");
  }
}

const textSchema = {
  headline: str({ min: 3, max: 80, optional: true }),
  caption: str({ min: 20, max: 2000, optional: true }),
  hashtags: arr(str({ min: 2, max: 60, pattern: /^#[\p{L}\p{N}_]+$/u, patternMessage: "un hashtag commence par # et ne contient pas d'espace" }), { max: 30, optional: true }),
};

async function applyText(db, post, body) {
  const changes = parseObject(textSchema, body);
  const entries = Object.entries(changes);
  if (entries.length) {
    await db.run(
      `UPDATE instagram_posts SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      ...entries.map(([, v]) => v), now(), post.id,
    );
  }
}

const jpeg = (bytes, cache = "private, max-age=300") =>
  new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });

export function instagramRoutes(router) {
  // Image finale, lue par Instagram au moment de la publication (adresse impossible à deviner).
  router.get("/instagram/media/:file", async (ctx) => {
    const id = ctx.params.file.replace(/\.jpg$/, "");
    const row = isUuid(id)
      ? await ctx.db.first(`SELECT image, status FROM instagram_posts WHERE id = ? AND image IS NOT NULL`, id)
      : null;
    if (!row || !["approved", "publishing", "published", "failed"].includes(row.status)) throw notFound("Image introuvable.");
    return jpeg(fromBase64(row.image), "public, max-age=3600");
  });

  // --- Connexion du compte ----------------------------------------------------------
  router.get("/admin/instagram/connection", async (ctx) => {
    await requireAdmin(ctx);
    return json(connectionOut(await getConnection(ctx.db, ctx.config)));
  });

  router.put("/admin/instagram/connection", async (ctx) => {
    await requireAdmin(ctx);
    const { access_token, instagram_id } = parseObject({
      access_token: str({ min: 20, max: 1000 }),
      instagram_id: str({ max: 30, pattern: /^\d*$/, default: null }),
    }, await readJson(ctx.request));
    return json(connectionOut(await connect(ctx.db, ctx.config, access_token.trim(), instagram_id || null)));
  });

  router.delete("/admin/instagram/connection", async (ctx) => {
    await requireAdmin(ctx);
    await removeConnection(ctx.db);
    return noContent();
  });

  // --- Propositions -------------------------------------------------------------------
  router.get("/admin/instagram/posts", async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.all(
      `SELECT ${LIGHT} FROM instagram_posts ORDER BY
         CASE status WHEN 'proposed' THEN 0 WHEN 'failed' THEN 1 WHEN 'approved' THEN 2 WHEN 'publishing' THEN 3 ELSE 4 END,
         COALESCE(scheduled_at, created_at) DESC LIMIT 60`,
    );
    return json(rows.map(postOut));
  });

  router.post("/admin/instagram/posts", async (ctx) => {
    await requireAdmin(ctx);
    const { theme } = parseObject({ theme: oneOf(["auto", ...Object.keys(THEMES)], { default: "auto" }) }, await readJson(ctx.request));
    const id = await propose(ctx.db, ctx.env, ctx.config, theme);
    return json(postOut(await load(ctx.db, id)), 201);
  });

  router.get("/admin/instagram/posts/:id", async (ctx) => {
    await requireAdmin(ctx);
    return json(postOut(await load(ctx.db, ctx.params.id)));
  });

  router.get("/admin/instagram/posts/:id/:kind", async (ctx) => {
    await requireAdmin(ctx);
    const kind = { fond: "background", visuel: "image" }[ctx.params.kind];
    if (!kind || !isUuid(ctx.params.id)) throw notFound("Image introuvable.");
    const value = await ctx.db.value(`SELECT ${kind} FROM instagram_posts WHERE id = ?`, ctx.params.id);
    if (!value) throw notFound("Image introuvable.");
    return jpeg(fromBase64(value));
  });

  router.put("/admin/instagram/posts/:id", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    editable(post);
    await applyText(ctx.db, post, await readJson(ctx.request));
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/regenerate", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    editable(post);
    const { part } = parseObject({ part: oneOf(["texte", "image", "tout"]) }, await readJson(ctx.request));
    const full = await ctx.db.first(`SELECT topic_data, image_prompt FROM instagram_posts WHERE id = ?`, post.id);
    let prompt = full.image_prompt;
    if (part !== "image") {
      const text = await writeText(ctx.config, post.theme, JSON.parse(full.topic_data));
      prompt = text.image_prompt;
      await ctx.db.run(
        `UPDATE instagram_posts SET headline = ?, caption = ?, hashtags = ?, image_prompt = ?, updated_at = ? WHERE id = ?`,
        text.headline, text.caption, text.hashtags, text.image_prompt, now(), post.id,
      );
    }
    if (part !== "texte") {
      const background = await drawBackground(ctx.env, prompt);
      // Un nouveau fond invalide le visuel déjà composé : retour en proposition.
      await ctx.db.run(
        `UPDATE instagram_posts SET background = ?, image = NULL, status = 'proposed', scheduled_at = NULL, updated_at = ? WHERE id = ?`,
        background, now(), post.id,
      );
    }
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/approve", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    editable(post);
    const body = await readJson(ctx.request);
    const data = parseObject(
      {
        ...textSchema,
        image: str({ min: 1000, max: MAX_IMAGE + 30, trim: false }),
        scheduled_at: datetime({ default: null }),
      },
      body,
    );
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.image);
    let bytes = null;
    try {
      bytes = match ? fromBase64(match[1]) : null;
    } catch {
      bytes = null;
    }
    // Une image JPEG commence toujours par les octets FF D8.
    if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8 || match[1].length > MAX_IMAGE) {
      throw new HttpError(422, "Le visuel doit être une image JPEG de 1 Mo au plus.");
    }
    await applyText(ctx.db, post, { headline: data.headline, caption: data.caption, hashtags: data.hashtags });
    await ctx.db.run(
      `UPDATE instagram_posts SET image = ?, status = 'approved', scheduled_at = ?, error = NULL, ig_container_id = NULL, updated_at = ? WHERE id = ?`,
      match[1], data.scheduled_at || now(), now(), post.id,
    );
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/publish", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    if (!["approved", "publishing"].includes(post.status)) {
      const why = {
        published: "Cette publication est déjà en ligne sur Instagram.",
        proposed: "Cette publication n'est plus approuvée (elle a été modifiée entre-temps, par exemple avec une nouvelle image) : vérifiez-la puis approuvez-la à nouveau.",
        failed: "La dernière tentative a échoué : vérifiez la publication, puis approuvez-la à nouveau.",
        rejected: "Cette publication a été refusée.",
      };
      throw conflict(why[post.status] || "Approuvez d'abord la publication.");
    }
    const full = await ctx.db.first(`SELECT * FROM instagram_posts WHERE id = ?`, post.id);
    await publishPost(ctx.db, ctx.config, full);
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/unapprove", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    if (!["approved", "failed"].includes(post.status)) throw conflict("Seule une publication approuvée ou en échec peut revenir en proposition.");
    await ctx.db.run(`UPDATE instagram_posts SET status = 'proposed', scheduled_at = NULL, updated_at = ? WHERE id = ?`, now(), post.id);
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/reject", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    editable(post);
    await ctx.db.run(`UPDATE instagram_posts SET status = 'rejected', scheduled_at = NULL, updated_at = ? WHERE id = ?`, now(), post.id);
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.delete("/admin/instagram/posts/:id", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    if (["published", "publishing"].includes(post.status)) throw conflict("Une publication en ligne ne se supprime pas ici.");
    await ctx.db.run(`DELETE FROM instagram_posts WHERE id = ?`, post.id);
    return noContent();
  });
}
