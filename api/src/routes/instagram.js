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
import {
  connectFacebook,
  facebookOut,
  facebookPostOut,
  getFacebook,
  publishFacebook,
  removeFacebook,
} from "../facebook.js";
import { arr, bool, datetime, isUuid, obj, oneOf, parseObject, str } from "../validate.js";

// Colonnes sans les images, pour les listes.
// Chaque proposition est lue avec son éventuelle publication Facebook.
const LIGHT = `p.id, p.theme, p.topic_ref, p.headline, p.caption, p.hashtags, p.status, p.scheduled_at, p.published_at,
  p.ig_media_id, p.permalink, p.error, p.created_at, p.updated_at,
  p.background IS NOT NULL AS has_background, p.image IS NOT NULL AS has_image,
  f.post_id AS fb_post, f.caption AS fb_caption, f.status AS fb_status, f.permalink AS fb_permalink,
  f.error AS fb_error, f.published_at AS fb_published_at`;
const FROM = `instagram_posts p LEFT JOIN facebook_posts f ON f.post_id = p.id`;

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
    facebook: facebookPostOut(
      p.fb_post
        ? { caption: p.fb_caption, status: p.fb_status, permalink: p.fb_permalink, error: p.fb_error, published_at: p.fb_published_at }
        : null,
      p,
    ),
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

async function load(db, id) {
  const post = isUuid(id) ? await db.first(`SELECT ${LIGHT} FROM ${FROM} WHERE p.id = ?`, id) : null;
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

/** Prévoit (ou retire) la publication Facebook d'une proposition approuvée. */
async function setFacebook(db, postId, { enabled, caption }) {
  if (!enabled) {
    await db.run(`DELETE FROM facebook_posts WHERE post_id = ? AND status <> 'published'`, postId);
    return;
  }
  if (caption.length < 20) throw new HttpError(422, "Le texte Facebook doit faire au moins 20 caractères.");
  await db.run(
    `INSERT INTO facebook_posts (post_id, caption, status, updated_at) VALUES (?, ?, 'pending', ?)
     ON CONFLICT(post_id) DO UPDATE SET
       caption = CASE WHEN facebook_posts.status = 'published' THEN facebook_posts.caption ELSE excluded.caption END,
       status = CASE WHEN facebook_posts.status = 'published' THEN 'published' ELSE 'pending' END,
       error = NULL, updated_at = excluded.updated_at`,
    postId, caption, now(),
  );
}

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

  // --- Connexion de la Page Facebook --------------------------------------------------
  router.get("/admin/facebook/connection", async (ctx) => {
    await requireAdmin(ctx);
    return json(facebookOut(await getFacebook(ctx.db, ctx.config)));
  });

  router.put("/admin/facebook/connection", async (ctx) => {
    await requireAdmin(ctx);
    const { access_token, page_id } = parseObject({
      access_token: str({ min: 20, max: 1000 }),
      page_id: str({ max: 30, pattern: /^\d*$/, default: null }),
    }, await readJson(ctx.request));
    return json(facebookOut(await connectFacebook(ctx.db, ctx.config, access_token, page_id || null)));
  });

  router.delete("/admin/facebook/connection", async (ctx) => {
    await requireAdmin(ctx);
    await removeFacebook(ctx.db);
    return noContent();
  });

  // --- Propositions -------------------------------------------------------------------
  router.get("/admin/instagram/posts", async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.all(
      `SELECT ${LIGHT} FROM ${FROM} ORDER BY
         CASE p.status WHEN 'proposed' THEN 0 WHEN 'failed' THEN 1 WHEN 'approved' THEN 2 WHEN 'publishing' THEN 3 ELSE 4 END,
         COALESCE(p.scheduled_at, p.created_at) DESC LIMIT 60`,
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
        facebook: obj({ enabled: bool(), caption: str({ max: 5000, default: "" }) }, { optional: true }),
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
    if (data.facebook) await setFacebook(ctx.db, post.id, data.facebook);
    return json(postOut(await load(ctx.db, post.id)));
  });

  router.post("/admin/instagram/posts/:id/publish", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    if (!["approved", "publishing"].includes(post.status)) throw conflict("Approuvez d'abord la publication.");
    const full = await ctx.db.first(`SELECT * FROM instagram_posts WHERE id = ?`, post.id);
    await publishPost(ctx.db, ctx.config, full);
    if (post.fb_status === "pending") await publishFacebook(ctx.db, ctx.config, post.id);
    return json(postOut(await load(ctx.db, post.id)));
  });

  // Publication (ou nouvel essai) sur Facebook seulement, par exemple après un échec.
  router.post("/admin/instagram/posts/:id/facebook", async (ctx) => {
    await requireAdmin(ctx);
    const post = await load(ctx.db, ctx.params.id);
    if (!post.fb_post) throw conflict("Cette publication n'est pas prévue sur Facebook.");
    if (post.fb_status === "published") throw conflict("Cette publication est déjà en ligne sur Facebook.");
    if (!post.has_image || !["approved", "publishing", "published", "failed"].includes(post.status)) {
      throw conflict("Approuvez d'abord la publication.");
    }
    await ctx.db.run(`UPDATE facebook_posts SET status = 'pending', error = NULL, updated_at = ? WHERE post_id = ?`, now(), post.id);
    await publishFacebook(ctx.db, ctx.config, post.id);
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
    if (["published", "publishing"].includes(post.status) || post.fb_status === "published") {
      throw conflict("Une publication en ligne ne se supprime pas ici.");
    }
    await ctx.db.batch([
      ctx.db.stmt(`DELETE FROM facebook_posts WHERE post_id = ?`, post.id),
      ctx.db.stmt(`DELETE FROM instagram_posts WHERE id = ?`, post.id),
    ]);
    return noContent();
  });
}
