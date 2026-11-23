import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DAILY_CRON } from "../src/app.js";
import { buildBundle, setup } from "./helpers.mjs";

// Petite image JPEG valide (1x1) et un visuel « composé » plus grand.
const JPEG_1PX =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const COMPOSED = `data:image/jpeg;base64,${Buffer.concat([Buffer.from(JPEG_1PX, "base64"), Buffer.alloc(3000)]).toString("base64")}`;

function fakeServices({ instagram = {} } = {}) {
  const calls = { groq: [], instagram: [], ai: [] };
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === "api.groq.com") {
      const body = JSON.parse(init.body);
      calls.groq.push(body);
      const content = JSON.stringify({
        titre: "Apprenez l'IA gratuitement",
        legende: "Vous voulez comprendre l'IA sans jargon ?\n\nNotre Académie vous accompagne pas à pas.\n\nRendez-vous sur academie.intelliakin.com (lien en bio).",
        hashtags: ["#IA", "Formation", "#Kinshasa", "#IA"],
        image: "young professionals learning together in a bright office",
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }
    if (u.hostname === "graph.instagram.com" || u.hostname === "graph.facebook.com") {
      const params = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : Object.fromEntries(u.searchParams);
      calls.instagram.push({ host: u.hostname, method: init.method || "GET", path: u.pathname, params });
      const route = `${init.method || "GET"} ${u.pathname}`;
      const custom = instagram[route];
      if (custom) return custom(params);
      if (u.pathname.endsWith("/me/accounts")) {
        return Response.json({ data: [
          { id: "100", name: "Page sans Instagram", access_token: "page-a" },
          { id: "200", name: "Intellia Kin", access_token: "page-b", instagram_business_account: { id: "17841499999999999", username: "intellia_kin" } },
        ] });
      }
      if (u.pathname.endsWith("/17841488888888888")) return Response.json({ id: "17841488888888888", username: "compte_direct" });
      if (u.pathname.endsWith("/me")) return Response.json({ user_id: "17841400000000000", username: "intelliakin" });
      if (u.pathname.endsWith("/media")) return Response.json({ id: "container-1" });
      if (u.pathname.endsWith("/container-1")) return Response.json({ status_code: "FINISHED" });
      if (u.pathname.endsWith("/media_publish")) return Response.json({ id: "media-1" });
      if (u.pathname.endsWith("/media-1")) return Response.json({ permalink: "https://www.instagram.com/p/abc/" });
      if (u.pathname === "/refresh_access_token") return Response.json({ access_token: "jeton-prolonge-0123456789", expires_in: 5184000 });
    }
    throw new Error(`Appel inattendu : ${url}`);
  };
  const AI = {
    run: async (model, input) => {
      calls.ai.push({ model, input });
      return { image: JPEG_1PX };
    },
  };
  return { fetch, AI, calls };
}

let bundlePromise;
async function instagramSetup(options = {}) {
  bundlePromise ||= buildBundle();
  const services = fakeServices(options);
  const t = await setup({
    bundle: await bundlePromise,
    fetch: services.fetch,
    env: { GROQ_API_KEY: "gsk_test", AI: services.AI, PUBLIC_API_URL: "https://api.exemple.test" },
  });
  return { t, admin: await t.admin(), calls: services.calls };
}

describe("agent Instagram", () => {
  test("réservé aux administrateurs", async () => {
    const { t } = await instagramSetup();
    const learner = await t.learner();
    assert.equal((await t.call("GET", "/admin/instagram/posts", { token: learner })).status, 403);
    assert.equal((await t.call("POST", "/admin/instagram/posts", { token: learner, body: {} })).status, 403);
  });

  test("une proposition : sujet tiré de l'Académie, texte, fond sans texte", async () => {
    const { t, admin, calls } = await instagramSetup();
    const r = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "cours" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, "proposed");
    assert.equal(r.body.theme_label, "Cours de l'Académie");
    assert.equal(r.body.topic_ref, "cours:cours-test");
    assert.deepEqual(r.body.hashtags, ["#IntelliaKin", "#IA", "#Formation", "#Kinshasa"]);
    assert.ok(r.body.has_background && !r.body.has_image);
    const sent = calls.groq[0];
    assert.deepEqual(sent.response_format, { type: "json_object" });
    assert.match(sent.messages[1].content, /Cours de test/);
    assert.match(calls.ai[0].input.prompt, /No text/);
    const background = await t.call("GET", `/admin/instagram/posts/${r.body.id}/fond`, { token: admin });
    assert.equal(background.headers.get("Content-Type"), "image/jpeg");
    // Avant approbation, l'image n'est pas publique.
    assert.equal((await t.call("GET", `/instagram/media/${r.body.id}.jpg`)).status, 404);
  });

  test("les sujets tournent et un conseil s'appuie sur une leçon", async () => {
    const { t, admin, calls } = await instagramSetup();
    const first = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "conseil" } });
    const second = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "conseil" } });
    assert.match(first.body.topic_ref, /^lecon:/);
    assert.notEqual(first.body.topic_ref, second.body.topic_ref, "la leçon la moins récemment utilisée est choisie");
    assert.match(calls.groq[0].messages[1].content, /contenu/);
    const tool = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "outil" } });
    assert.match(tool.body.topic_ref, /^outil:/);
    // Sans annonce publiée, le thème « annonce » se replie sur un conseil.
    const fallback = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "annonce" } });
    assert.equal(fallback.body.theme, "conseil");
  });

  test("une annonce publiée devient une publication", async () => {
    const { t, admin } = await instagramSetup();
    const a = await t.call("POST", "/admin/announcements", {
      token: admin,
      body: {
        kind: "evenement",
        title: "Atelier IA pour les PME",
        summary: "Deux heures pour automatiser vos tâches administratives.",
        starts_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
    });
    await t.call("POST", `/admin/announcements/${a.body.id}/publish`, { token: admin });
    const r = await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "annonce" } });
    assert.equal(r.body.topic_ref, `annonce:${a.body.id}`);
  });

  test("modification, approbation, publication et lien", async () => {
    const { t, admin, calls } = await instagramSetup();
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: {} })).body;

    const edited = await t.call("PUT", `/admin/instagram/posts/${post.id}`, {
      token: admin,
      body: { headline: "Votre premier pas vers l'IA", hashtags: ["#IntelliaKin", "#Formation"] },
    });
    assert.equal(edited.body.headline, "Votre premier pas vers l'IA");
    const bad = await t.call("PUT", `/admin/instagram/posts/${post.id}`, { token: admin, body: { hashtags: ["pas un hashtag"] } });
    assert.equal(bad.status, 422);

    const notJpeg = await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, {
      token: admin,
      body: { image: `data:image/png;base64,${"A".repeat(2000)}` },
    });
    assert.equal(notJpeg.status, 422);

    const later = new Date(Date.now() + 3600_000).toISOString();
    const approved = await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, {
      token: admin,
      body: { image: COMPOSED, scheduled_at: later, caption: "Une légende relue et corrigée par l'équipe Intellia Kin." },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, "approved");
    assert.equal(approved.body.scheduled_at, later);
    const media = await t.call("GET", `/instagram/media/${post.id}.jpg`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("Content-Type"), "image/jpeg");

    // Sans compte connecté, la tâche planifiée attend sans marquer d'échec.
    t.d1.db.prepare("UPDATE instagram_posts SET scheduled_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), post.id);
    await t.app.scheduled({ cron: "*/15 * * * *" }, t.env);
    assert.equal((await t.call("GET", `/admin/instagram/posts/${post.id}`, { token: admin })).body.status, "approved");

    // Sans compte connecté, la publication échoue proprement.
    const noAccount = await t.call("POST", `/admin/instagram/posts/${post.id}/publish`, { token: admin });
    assert.equal(noAccount.body.status, "failed");
    assert.match(noAccount.body.error, /non connecté/);

    const connected = await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "IGjeton-instagram-0123456789" } });
    assert.equal(connected.status, 200, JSON.stringify(connected.body));
    assert.equal(connected.body.username, "intelliakin");
    assert.equal(JSON.stringify(connected.body).includes("jeton"), false, "le jeton n'est jamais renvoyé");
    const stored = t.d1.db.prepare("SELECT value FROM meta WHERE key = 'instagram'").get().value;
    assert.equal(stored.includes("jeton-instagram"), false, "le jeton est chiffré dans la base");

    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });
    const published = await t.call("POST", `/admin/instagram/posts/${post.id}/publish`, { token: admin });
    assert.equal(published.body.status, "published", JSON.stringify(published.body));
    assert.equal(published.body.permalink, "https://www.instagram.com/p/abc/");

    const create = calls.instagram.find((c) => c.path.endsWith("/media") && c.method === "POST");
    assert.equal(create.path, "/v25.0/17841400000000000/media");
    assert.equal(create.params.image_url, `https://api.exemple.test/instagram/media/${post.id}.jpg`);
    assert.equal(create.params.is_ai_generated, "true");
    assert.match(create.params.caption, /^Une légende relue.*\n\n#IntelliaKin #Formation$/s);

    const locked = await t.call("PUT", `/admin/instagram/posts/${post.id}`, { token: admin, body: { headline: "Autre titre" } });
    assert.equal(locked.status, 409);
    assert.equal((await t.call("DELETE", `/admin/instagram/posts/${post.id}`, { token: admin })).status, 409);
  });

  test("la tâche planifiée publie à l'heure et reprend un traitement en cours", async () => {
    let state = "IN_PROGRESS";
    const { t, admin, calls } = await instagramSetup({
      instagram: { "GET /v25.0/container-1": () => Response.json({ status_code: state }) },
    });
    await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "IGjeton-instagram-0123456789" } });
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: {} })).body;
    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });

    await t.app.scheduled({ cron: "*/15 * * * *" }, t.env);
    assert.equal((await t.call("GET", `/admin/instagram/posts/${post.id}`, { token: admin })).body.status, "publishing");
    state = "FINISHED";
    await t.app.scheduled({ cron: "*/15 * * * *" }, t.env);
    assert.equal((await t.call("GET", `/admin/instagram/posts/${post.id}`, { token: admin })).body.status, "published");
    assert.equal(calls.instagram.filter((c) => c.path.endsWith("/media") && c.method === "POST").length, 1, "un seul conteneur");
  });

  test("une erreur d'Instagram est affichée, puis la publication peut être relancée", async () => {
    const { t, admin } = await instagramSetup({
      instagram: {
        "POST /v25.0/17841400000000000/media": () =>
          Response.json({ error: { message: "Invalid image aspect ratio" } }, { status: 400 }),
      },
    });
    await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "IGjeton-instagram-0123456789" } });
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: {} })).body;
    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });
    const r = await t.call("POST", `/admin/instagram/posts/${post.id}/publish`, { token: admin });
    assert.equal(r.body.status, "failed");
    assert.match(r.body.error, /Invalid image aspect ratio/);
    const back = await t.call("POST", `/admin/instagram/posts/${post.id}/unapprove`, { token: admin });
    assert.equal(back.body.status, "proposed");
  });

  test("régénérer l'image remet la publication en proposition", async () => {
    const { t, admin, calls } = await instagramSetup();
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: {} })).body;
    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });
    const r = await t.call("POST", `/admin/instagram/posts/${post.id}/regenerate`, { token: admin, body: { part: "image" } });
    assert.equal(r.body.status, "proposed");
    assert.equal(r.body.has_image, false);
    assert.equal(calls.ai.length, 2);
    assert.equal(calls.groq.length, 1, "le texte n'est pas réécrit");
    const text = await t.call("POST", `/admin/instagram/posts/${post.id}/regenerate`, { token: admin, body: { part: "texte" } });
    assert.equal(text.status, 200);
    assert.equal(calls.groq.length, 2);
  });

  test("refus et suppression", async () => {
    const { t, admin } = await instagramSetup();
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: {} })).body;
    assert.equal((await t.call("POST", `/admin/instagram/posts/${post.id}/reject`, { token: admin })).body.status, "rejected");
    assert.equal((await t.call("DELETE", `/admin/instagram/posts/${post.id}`, { token: admin })).status, 204);
    assert.deepEqual((await t.call("GET", "/admin/instagram/posts", { token: admin })).body, []);
  });

  test("proposition quotidienne unique et prolongation du jeton", async () => {
    const { t, admin, calls } = await instagramSetup();
    await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "IGjeton-instagram-0123456789" } });
    await t.app.scheduled({ cron: DAILY_CRON }, t.env);
    await t.app.scheduled({ cron: DAILY_CRON }, t.env);
    assert.equal((await t.call("GET", "/admin/instagram/posts", { token: admin })).body.length, 1);
    // Jeton tout neuf (60 jours) : pas de prolongation.
    assert.equal(calls.instagram.filter((c) => c.path === "/refresh_access_token").length, 0);
    const disconnected = await t.call("DELETE", "/admin/instagram/connection", { token: admin });
    assert.equal(disconnected.status, 204);
    assert.equal((await t.call("GET", "/admin/instagram/connection", { token: admin })).body.connected, false);
  });

  test("modèle de langue indisponible : message clair", async () => {
    const services = fakeServices();
    const t = await setup({
      bundle: await (bundlePromise ||= buildBundle()),
      fetch: async () => new Response("", { status: 503 }),
      env: { GROQ_API_KEY: "gsk_test", AI: services.AI },
    });
    const r = await t.call("POST", "/admin/instagram/posts", { token: await t.admin(), body: {} });
    assert.equal(r.status, 503);
    assert.match(r.body.detail, /indisponible/);
  });

  test("connexion unifiée (Facebook Login for Business) : jeton système sans expiration", async () => {
    const { t, admin, calls } = await instagramSetup();
    const connected = await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "EAAjeton-systeme-0123456789" } });
    assert.equal(connected.status, 200, JSON.stringify(connected.body));
    assert.equal(connected.body.username, "intellia_kin");
    assert.equal(connected.body.mode, "facebook");
    assert.equal(connected.body.page_name, "Intellia Kin");
    assert.equal(connected.body.expires_at, null);

    // Publication via graph.facebook.com sur l'identifiant du compte Instagram.
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "conseil" } })).body;
    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });
    const published = await t.call("POST", `/admin/instagram/posts/${post.id}/publish`, { token: admin });
    assert.equal(published.body.status, "published", JSON.stringify(published.body));
    const create = calls.instagram.find((c) => c.path.endsWith("/media"));
    assert.equal(create.host, "graph.facebook.com");
    assert.equal(create.path, "/v25.0/17841499999999999/media");

    // Jeton sans expiration : aucune prolongation.
    await t.app.scheduled({ cron: DAILY_CRON }, t.env);
    assert.equal(calls.instagram.some((c) => c.path === "/refresh_access_token"), false);

    // Identifiant fourni à la main quand le jeton ne peut pas lister les Pages.
    const direct = await t.call("PUT", "/admin/instagram/connection", {
      token: admin, body: { access_token: "EAAjeton-systeme-0123456789", instagram_id: "17841488888888888" },
    });
    assert.equal(direct.body.username, "compte_direct");
  });

  test("connexion unifiée : message clair si aucun compte n'est trouvé", async () => {
    const { t, admin } = await instagramSetup({
      instagram: { "GET /v25.0/me/accounts": () => Response.json({ error: { message: "(#100) Missing permission" } }, { status: 400 }) },
    });
    const r = await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "EAAjeton-systeme-0123456789" } });
    assert.equal(r.status, 422);
    assert.match(r.body.detail || JSON.stringify(r.body), /identifiant du compte Instagram/);
  });

  test("étiquette IA refusée : nouvel essai sans le paramètre", async () => {
    const { t, admin, calls } = await instagramSetup({
      instagram: {
        "POST /v25.0/17841499999999999/media": (params) => params.is_ai_generated
          ? Response.json({ error: { message: "Invalid parameter is_ai_generated" } }, { status: 400 })
          : Response.json({ id: "container-1" }),
      },
    });
    await t.call("PUT", "/admin/instagram/connection", { token: admin, body: { access_token: "EAAjeton-systeme-0123456789" } });
    const post = (await t.call("POST", "/admin/instagram/posts", { token: admin, body: { theme: "conseil" } })).body;
    await t.call("POST", `/admin/instagram/posts/${post.id}/approve`, { token: admin, body: { image: COMPOSED } });
    const published = await t.call("POST", `/admin/instagram/posts/${post.id}/publish`, { token: admin });
    assert.equal(published.body.status, "published", JSON.stringify(published.body));
    assert.equal(calls.instagram.filter((c) => c.path.endsWith("/media")).length, 2);
  });
});
