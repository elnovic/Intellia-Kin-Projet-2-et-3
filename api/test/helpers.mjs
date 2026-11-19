// Outils communs aux tests : application neuve, base en mémoire, appels HTTP.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createApp } from "../src/app.js";
import { D1Shim } from "./d1-shim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(here, "fixtures", "contenu");

export const ADMIN = { email: "admin@intelliakin.com", password: "motdepasse-admin" };
export const LEARNER = {
  email: "apprenant@intelliakin.com",
  password: "motdepasse-apprenant",
  full_name: "Apprenant Test",
  audience: "jeune_diplome",
};

let counter = 0;
export const MAX_D1_CALLS = 45;
export const maxCalls = { value: 0 };

/** Copie modifiable du contenu de test. */
export function copyContent() {
  const target = mkdtempSync(join(tmpdir(), "ik-contenu-"));
  cpSync(FIXTURE, target, { recursive: true });
  return target;
}

/** Construit le paquet de contenu comme au déploiement, puis le charge. */
export async function buildBundle(contentDir = FIXTURE) {
  const out = join(mkdtempSync(join(tmpdir(), "ik-bundle-")), `content-${counter++}.js`);
  execFileSync("node", [join(here, "..", "scripts", "build-content.mjs"), `--content=${contentDir}`, `--out=${out}`], {
    stdio: "pipe",
  });
  return (await import(pathToFileURL(out).href)).default;
}

export async function setup({ bundle, env = {}, fetch } = {}) {
  const d1 = new D1Shim();
  const app = createApp(bundle || (await buildBundle()));
  const environment = {
    DB: d1,
    ENVIRONMENT: "test",
    SECRET_KEY: "cle-de-test",
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_NAME: "Admin Test",
    FETCH: fetch,
    ...env,
  };

  async function call(method, path, { body, token, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
    if (token) init.headers.Authorization = `Bearer ${token}`;
    const before = environment.DB.calls;
    const response = await app.handle(new Request(`https://api.test${path}`, init), environment);
    const used = environment.DB.calls - before;
    // Offre gratuite de Cloudflare : 50 requêtes D1 au plus par appel.
    if (used > MAX_D1_CALLS) throw new Error(`${method} ${path} : ${used} appels à D1 (maximum ${MAX_D1_CALLS})`);
    maxCalls.value = Math.max(maxCalls.value, used);
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* texte brut (CSV, SVG) */
    }
    return { status: response.status, body: data, headers: response.headers };
  }

  async function login(email, password) {
    const r = await call("POST", "/auth/login", { body: { email, password } });
    if (r.status !== 200) throw new Error(`Connexion impossible : ${JSON.stringify(r.body)}`);
    return r.body.access_token;
  }

  async function learner(overrides = {}) {
    const data = { ...LEARNER, ...overrides };
    const r = await call("POST", "/auth/register", { body: data });
    if (r.status !== 201) throw new Error(`Inscription impossible : ${JSON.stringify(r.body)}`);
    return login(data.email, data.password);
  }

  return { app, d1, env: environment, call, login, learner, admin: () => login(ADMIN.email, ADMIN.password) };
}
