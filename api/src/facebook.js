// Publication sur la Page Facebook d'Intellia Kin.
//
// Les propositions restent celles de l'agent Instagram (même sujet, même visuel).
// Chaque proposition peut aussi partir sur Facebook, avec son propre texte :
// une ligne dans `facebook_posts` (créée à l'approbation) suit cette publication.
//
// Connexion : jeton d'utilisateur système du portefeuille business Meta, avec les
// autorisations pages_show_list, pages_read_engagement et pages_manage_posts.
// L'API en déduit le jeton de la Page, qui n'expire pas non plus.

import { now } from "./db.js";
import { HttpError } from "./http.js";
import { graph, seal, unseal } from "./instagram.js";

const ACADEMY_URL = "https://academie.intelliakin.com";
const fb = (config, method, path, params) => graph(config, method, path, params, "facebook", "Facebook");

// --- Connexion ---------------------------------------------------------------------

export async function getFacebook(db, config) {
  const stored = await db.value(`SELECT value FROM meta WHERE key = 'facebook'`);
  return stored ? unseal(stored, config.secretKey) : null;
}

export const removeFacebook = (db) => db.run(`DELETE FROM meta WHERE key = 'facebook'`);

export function facebookOut(connection) {
  if (!connection) return { connected: false };
  return {
    connected: true,
    page_id: connection.page_id,
    page_name: connection.page_name,
    connected_at: connection.connected_at,
  };
}

/** Vérifie le jeton, retrouve la Page et enregistre la connexion (chiffrée). */
export async function connectFacebook(db, config, accessToken, pageId = null) {
  const auth = { access_token: accessToken };
  let pages = [];
  let listError = null;
  try {
    pages = (await fb(config, "GET", "me/accounts", { fields: "id,name,access_token", limit: 100, ...auth })).data || [];
  } catch (err) {
    listError = err;
  }
  let page = pageId ? pages.find((p) => String(p.id) === pageId) : pages.length === 1 ? pages[0] : null;
  if (!page && pageId) {
    page = await fb(config, "GET", pageId, { fields: "id,name,access_token", ...auth });
  }
  if (!page) {
    if (pages.length > 1) {
      const names = pages.map((p) => `${p.name} (${p.id})`).join(", ");
      throw new HttpError(422, `Plusieurs Pages sont accessibles : ${names}. Indiquez l'ID de la Page à utiliser.`);
    }
    const reason = listError ? ` (${listError.message})` : "";
    throw new HttpError(422, `Aucune Page Facebook n'est accessible avec ce jeton${reason}. Vérifiez que la Page est attribuée à l'utilisateur système, ou indiquez l'ID de la Page.`);
  }
  const connection = {
    token: accessToken,
    page_id: String(page.id),
    page_name: page.name,
    // Le jeton de Page sert à publier ; à défaut, le jeton système lui-même.
    page_token: page.access_token || accessToken,
    connected_at: now(),
  };
  await db.run(
    `INSERT INTO meta (key, value) VALUES ('facebook', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    await seal(connection, config.secretKey),
  );
  return connection;
}

// --- Texte -------------------------------------------------------------------------

/**
 * Texte Facebook proposé par défaut à partir de la légende Instagram : les liens
 * sont cliquables sur Facebook (« lien en bio » devient l'adresse), et trois
 * hashtags suffisent.
 */
export function facebookText(caption, hashtags = []) {
  let text = String(caption || "")
    .replace(/\s*\((?:le\s+)?lien (?:est )?en bio\)/gi, "")
    .replace(/(?:le\s+)?lien en bio/gi, ACADEMY_URL)
    .trim();
  if (!text.includes("academie.intelliakin.com")) text += `\n\n👉 ${ACADEMY_URL}`;
  else text = text.replace(/(^|[^/])academie\.intelliakin\.com/g, `$1${ACADEMY_URL}`);
  const tags = hashtags.slice(0, 3).join(" ");
  return `${text}${tags ? `\n\n${tags}` : ""}`.slice(0, 5000);
}

export function facebookPostOut(row, post) {
  if (!row) {
    return {
      enabled: false,
      caption: facebookText(post.caption, JSON.parse(post.hashtags || "[]")),
      status: null,
      permalink: null,
      error: null,
      published_at: null,
    };
  }
  return {
    enabled: true,
    caption: row.caption,
    status: row.status,
    permalink: row.permalink ?? null,
    error: row.error ?? null,
    published_at: row.published_at ?? null,
  };
}

// --- Publication -------------------------------------------------------------------

async function failFacebook(db, postId, message) {
  await db.run(
    `UPDATE facebook_posts SET status = 'failed', error = ?, updated_at = ? WHERE post_id = ?`,
    message.slice(0, 500), now(), postId,
  );
  return "échec";
}

/** Publie une proposition sur la Page (photo + texte). */
export async function publishFacebook(db, config, postId) {
  const row = await db.first(`SELECT * FROM facebook_posts WHERE post_id = ?`, postId);
  if (!row || row.status === "published") return row ? "déjà publié" : "non prévu";
  const connection = await getFacebook(db, config);
  if (!connection) return failFacebook(db, postId, "Page Facebook non connectée.");
  try {
    const result = await fb(config, "POST", `${connection.page_id}/photos`, {
      url: `${config.publicApiUrl}/instagram/media/${postId}.jpg`,
      message: row.caption,
      published: "true",
      access_token: connection.page_token,
    });
    const postRef = result.post_id || `${connection.page_id}_${result.id}`;
    await db.run(
      `UPDATE facebook_posts SET status = 'published', fb_post_id = ?, permalink = ?, error = NULL, published_at = ?, updated_at = ? WHERE post_id = ?`,
      postRef, `https://www.facebook.com/${postRef}`, now(), now(), postId,
    );
    return "publié";
  } catch (err) {
    return failFacebook(db, postId, err.message);
  }
}

/** Publications Facebook dont l'heure est venue (le visuel approuvé est la référence). */
export async function publishFacebookDue(db, config) {
  if (!(await db.value(`SELECT COUNT(*) FROM meta WHERE key = 'facebook'`))) return {};
  const due = await db.all(
    `SELECT f.post_id FROM facebook_posts f JOIN instagram_posts p ON p.id = f.post_id
     WHERE f.status = 'pending' AND p.image IS NOT NULL
       AND p.status IN ('approved', 'publishing', 'published', 'failed') AND p.scheduled_at <= ?
     ORDER BY p.scheduled_at LIMIT 3`,
    now(),
  );
  const report = {};
  for (const { post_id } of due) report[post_id] = await publishFacebook(db, config, post_id);
  return report;
}
