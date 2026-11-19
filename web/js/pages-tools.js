// Les sept outils gratuits : quatre sans IA (sans compte), trois avec IA (compte requis).

import { api, session } from "./api.js";
import { renderMarkdown } from "./md.js";
import { badge, esc, formData, icon, loading, setTitle, toast, withBusy } from "./ui.js";

export const TOOL_CARDS = [
  { slug: "cv-lettre", title: "CV et lettre de motivation", short: "Un CV et une lettre professionnels, adaptés au poste visé.", icon: "user", ai: true },
  { slug: "assistant-redaction", title: "Assistant de rédaction", short: "E-mails, courriers, offres et relances prêts à envoyer.", icon: "book", ai: true },
  { slug: "plan-affaires", title: "Plan d'affaires en une page", short: "Votre idée structurée, avec les cinq prochaines étapes.", icon: "spark", ai: true },
  { slug: "calculateur-prix-marge", title: "Calculateur de prix et de marge", short: "Prix de vente, marge et seuil de rentabilité, en USD ou en CDF.", icon: "tool", ai: false },
  { slug: "tests-recrutement", title: "Tests de recrutement", short: "Entraînez-vous aux tests de logique, de français et d'Excel.", icon: "check", ai: false },
  { slug: "bibliotheque-prompts", title: "Bibliothèque de prompts", short: "Des demandes prêtes à copier, classées par métier.", icon: "book", ai: false },
  { slug: "diagnostic-ia", title: "Diagnostic IA", short: "Dix questions pour savoir par où commencer.", icon: "award", ai: false },
];

const HANDLERS = {
  "cv-lettre": aiTool,
  "assistant-redaction": aiTool,
  "plan-affaires": aiTool,
  "calculateur-prix-marge": calculator,
  "tests-recrutement": recruitmentTests,
  "bibliotheque-prompts": promptLibrary,
  "diagnostic-ia": diagnostic,
};

export async function toolsPage(root) {
  setTitle("Outils gratuits", "Des outils gratuits, avec et sans IA, pour votre carrière, votre projet et votre organisation.");
  const card = (t) =>
    `<a class="tool-card" href="/outils/${t.slug}">${icon(t.icon)}<h3>${esc(t.title)}</h3><p>${esc(t.short)}</p>${
      t.ai ? badge("IA · compte gratuit", "ai") : badge("Accès libre", "neutral")
    }</a>`;
  root.innerHTML = `<section class="page"><div class="container">
    <header class="page-header">
      <h1>Outils gratuits</h1>
      <p class="lead">Des outils simples et professionnels, conçus par Intellia Kin. Les outils sans IA sont en accès libre ; les outils avec IA demandent un compte gratuit, avec trois utilisations par jour.</p>
    </header>
    <h2>Avec l'intelligence artificielle</h2>
    <div class="tool-grid">${TOOL_CARDS.filter((t) => t.ai).map(card).join("")}</div>
    <h2>En accès libre</h2>
    <div class="tool-grid">${TOOL_CARDS.filter((t) => !t.ai).map(card).join("")}</div>
  </div></section>`;
}

export async function toolPage(root, params, ctx) {
  const tool = TOOL_CARDS.find((t) => t.slug === params.slug);
  const handler = HANDLERS[params.slug];
  if (!tool || !handler) {
    root.innerHTML = `<section class="page"><div class="container narrow"><h1>Outil introuvable</h1><a class="ik-bouton" href="/outils">Voir les outils</a></div></section>`;
    return;
  }
  setTitle(tool.title, tool.short);
  root.innerHTML = `<section class="page"><div class="container narrow">
    <p class="eyebrow"><a href="/outils">Outils</a></p>
    <h1>${esc(tool.title)}</h1>
    <p class="lead">${esc(tool.short)}</p>
    <div data-tool>${loading()}</div>
  </div></section>`;
  await handler(root.querySelector("[data-tool]"), tool, ctx);
}

// --- Outils IA --------------------------------------------------------------

const ENUM_LABELS = {
  cv: "Le CV seul",
  lettre: "La lettre seule",
  les_deux: "Le CV et la lettre",
  email: "E-mail",
  courrier_administratif: "Courrier administratif",
  offre_commerciale: "Offre commerciale",
  relance: "Relance (paiement, réponse, dossier)",
  compte_rendu: "Compte rendu de réunion",
  annonce: "Annonce ou communiqué",
  reponse_client: "Réponse à un client",
  formel: "Formel",
  cordial: "Cordial",
  ferme: "Ferme",
  chaleureux: "Chaleureux",
  courte: "Courte",
  moyenne: "Moyenne",
  detaillee: "Détaillée",
};

const FIELD_LABELS = { document: "Que voulez-vous obtenir ?", type_document: "Type de document", ton: "Ton", longueur: "Longueur" };

function fieldHtml(name, spec, required) {
  const label = esc(FIELD_LABELS[name] || spec.title || name);
  const choices = spec.enum || spec.anyOf?.find((s) => s.enum)?.enum;
  if (choices) {
    return `<label class="field"><span>${label}</span><select name="${name}">${choices
      .map((c) => `<option value="${esc(c)}" ${c === spec.default ? "selected" : ""}>${esc(ENUM_LABELS[c] || c)}</option>`)
      .join("")}</select></label>`;
  }
  const max = spec.maxLength || 200;
  const attrs = `name="${name}" maxlength="${max}" ${required ? `required minlength="${spec.minLength || 1}"` : ""}`;
  const value = spec.default ? esc(spec.default) : "";
  return `<label class="field"><span>${label}${required ? "" : ' <span class="small">(facultatif)</span>'}</span>${
    max > 300 ? `<textarea ${attrs} rows="${max > 1500 ? 6 : 4}">${value}</textarea>` : `<input ${attrs} value="${value}">`
  }</label>`;
}

async function aiTool(box, tool, { navigate }) {
  if (!session.token) {
    box.innerHTML = `<div class="notice notice-info"><p>Cet outil utilise l'intelligence artificielle. Il est gratuit, avec un compte, à raison de trois utilisations par jour.</p>
      <a class="ik-bouton" href="/inscription?suite=${encodeURIComponent(location.pathname)}">Créer un compte gratuit</a>
      <a class="ik-bouton ik-bouton-secondaire" href="/connexion?suite=${encodeURIComponent(location.pathname)}">Se connecter</a></div>`;
    return;
  }
  const [tools, quota] = await Promise.all([api("/tools", { auth: false }), api("/tools/quota")]);
  const spec = tools.find((t) => t.slug === tool.slug);
  const schema = spec.fields;
  const required = new Set(schema.required || []);
  box.innerHTML = `
    <p class="quota">${icon("spark")} <span data-quota>${quota.remaining_today}</span> génération(s) restante(s) aujourd'hui.</p>
    ${quota.available ? "" : '<div class="notice notice-info"><p>L\'assistant IA est en cours de mise en service. Revenez très bientôt.</p></div>'}
    <form data-ai class="form-stack">
      ${Object.entries(schema.properties).map(([name, s]) => fieldHtml(name, s, required.has(name))).join("")}
      <p class="small">Ne saisissez pas d'informations confidentielles (mots de passe, numéros de compte, données de santé). Relisez toujours le résultat avant de l'utiliser.</p>
      <button class="ik-bouton" type="submit" ${quota.remaining_today && quota.available ? "" : "disabled"}>Générer</button>
    </form>
    <section data-result class="ai-result" hidden></section>
    ${spec.course_slug ? `<p class="small">Pour aller plus loin : <a href="/cours/${esc(spec.course_slug)}">le cours associé</a>.</p>` : ""}`;

  box.querySelector("[data-ai]").addEventListener("submit", (event) => {
    event.preventDefault();
    const body = formData(event.currentTarget);
    const result = box.querySelector("[data-result]");
    withBusy(event.currentTarget.querySelector("button"), async () => {
      const output = await api(`/tools/${tool.slug}`, { method: "POST", body });
      box.querySelector("[data-quota]").textContent = output.remaining_today;
      result.hidden = false;
      result.innerHTML = `<div class="result-actions no-print">
          <button class="ik-bouton ik-bouton-secondaire" data-copy>Copier le texte</button>
          <button class="ik-bouton ik-bouton-secondaire" data-print>${icon("print")} Télécharger en PDF</button>
        </div>
        <div class="printable"><img class="print-logo" src="/assets/logo.png" alt="" width="110"><div class="prose">${renderMarkdown(output.markdown)}</div></div>
        <p class="small no-print">Résultat généré par IA : relisez-le et complétez les passages entre crochets.</p>`;
      result.querySelector("[data-copy]").addEventListener("click", async () => {
        await navigator.clipboard.writeText(output.markdown.replace(/\*\*/g, "").replace(/^#+\s*/gm, ""));
        toast("Texte copié.", "success");
      });
      result.querySelector("[data-print]").addEventListener("click", () => {
        document.body.classList.add("print-result");
        window.print();
        setTimeout(() => document.body.classList.remove("print-result"), 500);
      });
      result.scrollIntoView({ behavior: "smooth" });
    }).catch((error) => toast(error.message, "error"));
  });
}

// --- Calculateur de prix et de marge ---------------------------------------

function money(value, currency) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: currency === "CDF" ? 0 : 2 }).format(value);
}

async function calculator(box) {
  box.innerHTML = `<form data-calc class="form-grid">
      <label class="field"><span>Devise</span><select name="currency"><option value="USD">Dollar américain (USD)</option><option value="CDF">Franc congolais (CDF)</option><option value="EUR">Euro (EUR)</option><option value="XOF">Franc CFA (XOF)</option></select></label>
      <label class="field"><span>Quantité vendue par mois</span><input name="quantity" type="number" min="1" step="1" required value="100"></label>
      <label class="field"><span>Coût variable par unité</span><input name="variable" type="number" min="0" step="any" required value="5"><small>Matière, emballage, transport, commission…</small></label>
      <label class="field"><span>Charges fixes par mois</span><input name="fixed" type="number" min="0" step="any" required value="300"><small>Loyer, salaires, internet, électricité…</small></label>
      <label class="field"><span>Marge souhaitée (% du prix de vente)</span><input name="margin" type="number" min="0" max="95" step="any" required value="30"></label>
      <label class="field"><span>Taxe à ajouter (%)</span><input name="tax" type="number" min="0" max="100" step="any" value="0"><small>Par exemple 16 % de TVA en RDC, si vous y êtes assujetti.</small></label>
      <label class="field"><span>Taux de change (facultatif)</span><input name="rate" type="number" min="0" step="any" placeholder="ex. 2 800 CDF pour 1 USD"><small>Nombre de CDF pour 1 USD, pour afficher les deux devises.</small></label>
    </form>
    <section class="calc-results" data-out aria-live="polite"></section>
    <p class="small">Ce calcul est une aide à la décision : comparez aussi vos prix à ceux du marché. Voir le cours <a href="/cours/prix-marges-et-tresorerie">Prix, marges et trésorerie</a>.</p>`;
  const form = box.querySelector("[data-calc]");
  const out = box.querySelector("[data-out]");
  const update = () => {
    const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, k === "currency" ? x : Number(x)]));
    const { currency, quantity, variable, fixed, margin, tax, rate } = v;
    if (!(quantity > 0) || margin >= 100) {
      out.innerHTML = "";
      return;
    }
    const unitCost = variable + fixed / quantity;
    const price = unitCost / (1 - margin / 100);
    const priceTax = price * (1 + (tax || 0) / 100);
    const unitMargin = price - variable;
    const breakEven = unitMargin > 0 ? Math.ceil(fixed / unitMargin) : Infinity;
    const revenue = price * quantity;
    const profit = revenue - variable * quantity - fixed;
    const other = rate > 0 && (currency === "USD" || currency === "CDF") ? (currency === "USD" ? ["CDF", rate] : ["USD", 1 / rate]) : null;
    const both = (x) => `${money(x, currency)}${other ? `<span class="small"> ≈ ${money(x * other[1], other[0])}</span>` : ""}`;
    out.innerHTML = `<div class="kpi-grid">
        <div class="ik-chiffre-cle"><p class="label">Coût de revient unitaire</p><p class="kpi">${both(unitCost)}</p></div>
        <div class="ik-chiffre-cle"><p class="label">Prix de vente conseillé${tax ? " hors taxe" : ""}</p><p class="kpi">${both(price)}</p></div>
        ${tax ? `<div class="ik-chiffre-cle"><p class="label">Prix toutes taxes comprises</p><p class="kpi">${both(priceTax)}</p></div>` : ""}
        <div class="ik-chiffre-cle"><p class="label">Seuil de rentabilité</p><p class="kpi">${Number.isFinite(breakEven) ? `${breakEven} unités / mois` : "Non atteint"}</p></div>
        <div class="ik-chiffre-cle"><p class="label">Chiffre d'affaires mensuel</p><p class="kpi">${both(revenue)}</p></div>
        <div class="ik-chiffre-cle"><p class="label">Bénéfice mensuel estimé</p><p class="kpi ${profit < 0 ? "negative" : ""}">${both(profit)}</p></div>
      </div>
      ${breakEven > quantity ? '<p class="notice notice-error small">Attention : avec ces volumes, vous vendez moins que votre seuil de rentabilité.</p>' : ""}`;
  };
  form.addEventListener("input", update);
  update();
}

// --- Tests de recrutement ---------------------------------------------------

async function loadData(name) {
  const response = await fetch(`/data/${name}.json`);
  if (!response.ok) throw new Error("Données indisponibles. Réessayez plus tard.");
  return response.json();
}

async function recruitmentTests(box) {
  const tests = await loadData("tests");
  const showList = () => {
    box.innerHTML = `<div class="tool-grid">${tests
      .map(
        (t, i) => `<button class="tool-card as-button" data-test="${i}">${icon("check")}<h3>${esc(t.title)}</h3><p>${esc(t.description)}</p>${badge(`${t.questions.length} questions · ${t.duration_minutes} min`, "neutral")}</button>`
      )
      .join("")}</div>`;
    box.querySelectorAll("[data-test]").forEach((b) => b.addEventListener("click", () => run(tests[Number(b.dataset.test)])));
  };
  const run = (test) => {
    let remaining = test.duration_minutes * 60;
    box.innerHTML = `<div class="timer" aria-live="off">${icon("clock")} <span data-time></span></div>
      <h2>${esc(test.title)}</h2>
      <form data-run>${test.questions
        .map(
          (q, qi) => `<fieldset class="question" data-index="${qi}"><legend><span class="q-number">${qi + 1}.</span> ${esc(q.prompt)}</legend>${q.options
            .map((o, oi) => `<label class="option"><input type="radio" name="t-${qi}" value="${oi}"> <span>${esc(o)}</span></label>`)
            .join("")}<div class="feedback"></div></fieldset>`
        )
        .join("")}<button class="ik-bouton" type="submit">Terminer le test</button></form>`;
    const clock = box.querySelector("[data-time]");
    const tick = () => {
      clock.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
      if (remaining-- <= 0) finish(true);
    };
    const timer = setInterval(tick, 1000);
    tick();
    const form = box.querySelector("[data-run]");
    const finish = (timeout = false) => {
      clearInterval(timer);
      let good = 0;
      test.questions.forEach((q, qi) => {
        const chosen = form.querySelector(`input[name="t-${qi}"]:checked`);
        const ok = chosen && Number(chosen.value) === q.answer;
        if (ok) good += 1;
        const fieldset = form.querySelector(`fieldset[data-index="${qi}"]`);
        fieldset.classList.add(ok ? "is-correct" : "is-wrong");
        fieldset.querySelectorAll(".option")[q.answer].classList.add("is-answer");
        fieldset.querySelector(".feedback").innerHTML = `<strong>${ok ? "Juste." : "Faux."}</strong> ${esc(q.explanation || "")}`;
      });
      form.querySelectorAll("input").forEach((i) => (i.disabled = true));
      form.querySelector("button")?.remove();
      const score = Math.round((100 * good) / test.questions.length);
      form.insertAdjacentHTML(
        "beforebegin",
        `<div class="notice ${score >= 70 ? "notice-success" : "notice-info"} result"><p class="score">${score} %</p><p>${timeout ? "Temps écoulé. " : ""}${good} bonne(s) réponse(s) sur ${test.questions.length}. Les corrections sont affichées sous chaque question.</p><button class="ik-bouton ik-bouton-secondaire" data-back>Choisir un autre test</button></div>`
      );
      box.querySelector("[data-back]").addEventListener("click", showList);
      box.scrollIntoView({ behavior: "smooth" });
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      finish();
    });
  };
  showList();
}

// --- Bibliothèque de prompts ------------------------------------------------

async function promptLibrary(box) {
  const prompts = await loadData("prompts");
  const categories = [...new Set(prompts.map((p) => p.category))];
  box.innerHTML = `<div class="library-filters">
      <label class="field"><span>Rechercher</span><input type="search" data-search placeholder="ex. relance, réunion, publication"></label>
      <label class="field"><span>Métier</span><select data-category><option value="">Tous les métiers</option>${categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
    </div>
    <p class="small">Remplacez les passages [entre crochets] par vos propres informations avant d'envoyer le prompt à votre assistant IA.</p>
    <div class="prompt-list" data-list></div>`;
  const list = box.querySelector("[data-list]");
  const draw = () => {
    const q = box.querySelector("[data-search]").value.toLowerCase();
    const c = box.querySelector("[data-category]").value;
    const items = prompts.filter((p) => (!c || p.category === c) && (!q || `${p.title} ${p.prompt} ${p.category}`.toLowerCase().includes(q)));
    list.innerHTML = items
      .map(
        (p, i) => `<article class="prompt-card"><div class="badges">${badge(p.category, "neutral")}</div><h3>${esc(p.title)}</h3><pre>${esc(p.prompt)}</pre>${p.tip ? `<p class="small">${icon("spark")} ${esc(p.tip)}</p>` : ""}<button class="ik-bouton ik-bouton-petit ik-bouton-secondaire" data-copy="${prompts.indexOf(p)}">Copier</button></article>`
      )
      .join("") || '<p class="empty">Aucun prompt ne correspond à votre recherche.</p>';
  };
  box.addEventListener("input", draw);
  list.addEventListener("click", async (e) => {
    const index = e.target.closest("[data-copy]")?.dataset.copy;
    if (index === undefined) return;
    await navigator.clipboard.writeText(prompts[Number(index)].prompt);
    toast("Prompt copié. Collez-le dans votre assistant IA.", "success");
  });
  draw();
}

// --- Diagnostic IA ----------------------------------------------------------

async function diagnostic(box) {
  const data = await loadData("diagnostic");
  box.innerHTML = `<form data-diag>${data.questions
    .map(
      (q, qi) => `<fieldset class="question"><legend><span class="q-number">${qi + 1}.</span> ${esc(q.prompt)}</legend>${q.options
        .map((o, oi) => `<label class="option"><input type="radio" name="d-${qi}" value="${oi}" required> <span>${esc(o.text)}</span></label>`)
        .join("")}</fieldset>`
    )
    .join("")}<button class="ik-bouton" type="submit">Voir mon diagnostic</button></form><section data-diag-result></section>`;
  box.querySelector("[data-diag]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const scores = { niveau: 0, carriere: 0, entrepreneuriat: 0, organisations: 0 };
    data.questions.forEach((q, qi) => {
      const chosen = q.options[Number(form.querySelector(`input[name="d-${qi}"]:checked`).value)];
      for (const [key, value] of Object.entries(chosen.scores || {})) scores[key] = (scores[key] || 0) + value;
    });
    const level = data.levels.find((l) => scores.niveau <= l.max) || data.levels[data.levels.length - 1];
    const focus = ["carriere", "entrepreneuriat", "organisations"].sort((a, b) => scores[b] - scores[a])[0];
    const reco = data.recommendations[focus];
    const courses = [...level.courses, ...reco.courses];
    box.querySelector("[data-diag-result]").innerHTML = `<div class="panel result-panel">
      <p class="eyebrow">Votre profil</p>
      <h2>${esc(level.title)} · ${esc(reco.title)}</h2>
      <p>${esc(level.text)} ${esc(reco.text)}</p>
      <h3>Les cours que nous vous recommandons</h3>
      <ol>${courses.map((c) => `<li><a href="/cours/${esc(c.slug)}">${esc(c.title)}</a></li>`).join("")}</ol>
      <h3>Les outils à essayer</h3>
      <ul>${reco.tools.map((slug) => TOOL_CARDS.find((t) => t.slug === slug)).filter(Boolean).map((t) => `<li><a href="/outils/${t.slug}">${esc(t.title)}</a></li>`).join("")}</ul>
      <p class="small">Besoin d'un accompagnement pour votre organisation ? <a href="https://intelliakin.com/contact.html" target="_blank" rel="noopener">Parlez-en à l'équipe Intellia Kin</a>.</p>
    </div>`;
    box.querySelector("[data-diag-result]").scrollIntoView({ behavior: "smooth" });
  });
}
