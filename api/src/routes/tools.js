// Outils IA gratuits : un nombre limité d'utilisations par jour et par compte.

import { currentUser } from "../auth.js";
import { AIUnavailable, complete } from "../ai.js";
import { newId, now } from "../db.js";
import { HttpError, json, notFound, readJson } from "../http.js";
import { formSchema, TOOLS, TOOLS_BY_SLUG, validateForm } from "../tools.js";

function startOfDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const usedToday = (db, user) =>
  db.value(`SELECT COUNT(*) FROM tool_usage WHERE user_id = ? AND created_at >= ?`, user.id, startOfDay());

export function toolRoutes(router) {
  router.get("/tools", async () =>
    json(
      TOOLS.map((tool) => ({
        slug: tool.slug,
        title: tool.title,
        description: tool.description,
        course_slug: tool.course_slug,
        fields: formSchema(tool),
      })),
    ),
  );

  router.get("/tools/quota", async (ctx) => {
    const user = await currentUser(ctx);
    const limit = ctx.config.aiDailyLimit;
    const used = await usedToday(ctx.db, user);
    return json({
      daily_limit: limit,
      used_today: used,
      remaining_today: Math.max(0, limit - used),
      available: Boolean(ctx.config.groqApiKey),
    });
  });

  router.post("/tools/:slug", async (ctx) => {
    const user = await currentUser(ctx);
    const tool = TOOLS_BY_SLUG[ctx.params.slug];
    if (!tool) throw notFound("Outil introuvable.");
    const [form, errors] = validateForm(tool, await readJson(ctx.request));
    if (errors.length) {
      throw new HttpError(422, { message: "Certains champs sont incomplets.", erreurs: errors });
    }
    const limit = ctx.config.aiDailyLimit;
    const used = await usedToday(ctx.db, user);
    if (user.role !== "admin" && used >= limit) {
      throw new HttpError(429, `Vous avez utilisé vos ${limit} générations du jour. Revenez demain !`);
    }
    let text, model;
    try {
      [text, model] = await complete(ctx.config, tool.system, tool.build(form), tool.max_tokens);
    } catch (err) {
      if (err instanceof AIUnavailable) {
        throw new HttpError(
          503,
          "L'assistant est très sollicité en ce moment. Réessayez dans quelques minutes : cette tentative n'est pas décomptée.",
        );
      }
      throw err;
    }
    await ctx.db.run(
      `INSERT INTO tool_usage (id, user_id, tool_slug, model, created_at) VALUES (?, ?, ?, ?, ?)`,
      newId(), user.id, tool.slug, model, now(),
    );
    return json({ markdown: text, remaining_today: Math.max(0, limit - used - 1) });
  });
}
