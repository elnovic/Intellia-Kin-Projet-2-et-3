// Point d'entrée du Worker Cloudflare de l'Académie Intellia Kin.

import { createApp } from "./app.js";
import bundle from "./generated/content.js";

const app = createApp(bundle);

export default {
  fetch: (request, env) => app.handle(request, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(app.scheduled(event, env)),
};
