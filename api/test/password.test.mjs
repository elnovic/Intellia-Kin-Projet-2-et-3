import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { LEARNER, setup } from "./helpers.mjs";

function fakeResend({ fail = false } = {}) {
  const sent = [];
  const fetch = async (url, init = {}) => {
    if (url === "https://api.resend.com/emails") {
      const body = JSON.parse(init.body);
      sent.push({ ...body, auth: init.headers.Authorization });
      if (fail) return new Response("{\"message\":\"domain not verified\"}", { status: 403 });
      return Response.json({ id: `email-${sent.length}` });
    }
    throw new Error(`Appel inattendu : ${url}`);
  };
  const lastCode = () => /\b(\d{6})\b/.exec(sent.at(-1).text)[1];
  return { fetch, sent, lastCode };
}

async function withEmail(options) {
  const resend = fakeResend(options);
  const t = await setup({ fetch: resend.fetch, env: { RESEND_API_KEY: "re_test" } });
  return { t, resend };
}

const NEW = "nouveau-motdepasse-42";

describe("mot de passe oublié", () => {
  test("par e-mail : code, nouveau mot de passe, anciennes sessions fermées", async () => {
    const { t, resend } = await withEmail();
    const oldSession = await t.learner();
    assert.equal((await t.call("GET", "/auth/password/options")).body.email, true);

    const asked = await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email.toUpperCase() } });
    assert.deepEqual([asked.status, asked.body], [200, { method: "email" }]);
    assert.equal(resend.sent.length, 1);
    const mail = resend.sent[0];
    assert.deepEqual(mail.to, [LEARNER.email]);
    assert.equal(mail.auth, "Bearer re_test");
    assert.match(mail.from, /Académie Intellia Kin <noreply@academie\.intelliakin\.com>/);
    assert.match(mail.html, /Bonjour Apprenant/);
    const code = resend.lastCode();

    // Le code n'est jamais stocké en clair.
    const stored = t.d1.db.prepare("SELECT secret_hash FROM password_resets").get().secret_hash;
    assert.notEqual(stored, code);
    assert.equal(stored.includes(code), false);

    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code: wrong, password: NEW } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.detail, /Il vous reste 4 essais/);
    const tooShort = await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code, password: "court" } });
    assert.equal(tooShort.status, 422);

    const ok = await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code, password: NEW } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await t.call("GET", "/auth/me", { token: ok.body.access_token })).body.email, LEARNER.email);

    // Ancien mot de passe refusé, nouveau accepté, ancienne session fermée.
    assert.equal((await t.call("POST", "/auth/login", { body: { email: LEARNER.email, password: LEARNER.password } })).status, 401);
    await t.login(LEARNER.email, NEW);
    const closed = await t.call("GET", "/auth/me", { token: oldSession });
    assert.equal(closed.status, 401);
    assert.match(closed.body.detail, /mot de passe a changé/);

    // Code déjà utilisé.
    assert.equal((await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code, password: "encore-un-autre-1" } })).status, 400);
  });

  test("adresse inconnue : même réponse, aucun e-mail", async () => {
    const { t, resend } = await withEmail();
    const r = await t.call("POST", "/auth/password/forgot", { body: { email: "personne@exemple.com" } });
    assert.deepEqual([r.status, r.body], [200, { method: "email" }]);
    assert.equal(resend.sent.length, 0);
    const reset = await t.call("POST", "/auth/password/reset", { body: { email: "personne@exemple.com", code: "123456", password: NEW } });
    assert.equal(reset.status, 400);
  });

  test("limites : 5 essais par code, 3 demandes par heure, nouveau code remplace l'ancien", async () => {
    const { t, resend } = await withEmail();
    await t.learner();
    await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    const first = resend.lastCode();
    await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    const second = resend.lastCode();
    if (first !== second) {
      const replaced = await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code: first, password: NEW } });
      assert.equal(replaced.status, 400, "l'ancien code ne vaut plus");
    }
    const wrong = second === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code: wrong, password: NEW } });
    }
    const blocked = await t.call("POST", "/auth/password/reset", { body: { email: LEARNER.email, code: second, password: NEW } });
    assert.equal(blocked.status, 400, "bon code refusé après 5 erreurs");

    await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    const limited = await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    assert.equal(limited.status, 429);
    assert.equal(resend.sent.length, 3);
  });

  test("envoi refusé par Resend : erreur claire", async () => {
    const { t } = await withEmail({ fail: true });
    await t.learner();
    const r = await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    assert.equal(r.status, 502);
    assert.match(r.body.detail, /n'a pas pu être envoyé/);
  });

  test("sans Resend : l'Académie oriente vers l'équipe", async () => {
    const t = await setup();
    await t.learner();
    assert.equal((await t.call("GET", "/auth/password/options")).body.email, false);
    const r = await t.call("POST", "/auth/password/forgot", { body: { email: LEARNER.email } });
    assert.deepEqual(r.body, { method: "equipe" });
  });

  test("par l'équipe : recherche de l'apprenant et lien valable une fois", async () => {
    const t = await setup();
    const learner = await t.learner();
    const admin = await t.admin();
    assert.equal((await t.call("GET", "/admin/users", { token: learner })).status, 403);

    const found = await t.call("GET", "/admin/users?q=apprenant", { token: admin });
    assert.equal(found.status, 200);
    assert.equal(found.body.users.length, 1);
    assert.equal(found.body.users[0].email, LEARNER.email);
    assert.equal("password_hash" in found.body.users[0], false);
    assert.equal((await t.call("GET", "/admin/users?q=100%25", { token: admin })).body.users.length, 0, "% n'est pas un joker");

    const link = await t.call("POST", `/admin/users/${found.body.users[0].id}/reset-link`, { token: admin });
    assert.equal(link.status, 201);
    assert.match(link.body.url, /^https:\/\/academie\.intelliakin\.com\/mot-de-passe-oublie\?lien=/);
    const token = decodeURIComponent(new URL(link.body.url).searchParams.get("lien"));

    const forged = await t.call("POST", "/auth/password/reset", { body: { token: `${token.split(".")[0]}.faux-secret-0123456789`, password: NEW } });
    assert.equal(forged.status, 400);
    const ok = await t.call("POST", "/auth/password/reset", { body: { token, password: NEW } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await t.login(LEARNER.email, NEW);
    assert.equal((await t.call("POST", "/auth/password/reset", { body: { token, password: "encore-un-autre-1" } })).status, 400, "lien à usage unique");
  });
});
