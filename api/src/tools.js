// Outils IA : formulaire, consignes au modèle, construction de la demande.
//
// Chaque outil reçoit un formulaire validé, jamais un prompt libre. Les
// consignes (« system ») fixent le ton, la structure et les limites.

import {
  CV_SYSTEM,
  ENTRETIEN_SYSTEM,
  MEMOIRE_SYSTEM,
  PLAN_SYSTEM,
  PUBLICATION_SYSTEM,
  REDACTION_SYSTEM,
} from "./tool-prompts.js";

// Champ texte : [titre, max, min] ; facultatif si min vaut 0 (valeur par défaut "").
const t = (title, max, min = 0, def = "") => ({ kind: "text", title, max, min, default: min ? undefined : def });
// Champ à choix : [valeurs, défaut].
const c = (choices, def) => ({ kind: "choice", choices, default: def });

const data = (form) => `<donnees>\n${JSON.stringify(form, null, 1)}\n</donnees>`;

export const TOOLS = [
  {
    slug: "cv-lettre",
    title: "CV et lettre de motivation",
    description: "Un CV et une lettre de motivation professionnels, adaptés au poste visé.",
    course_slug: "image-professionnelle-cv-linkedin-portfolio",
    max_tokens: 3500,
    system: CV_SYSTEM,
    fields: {
      document: c(["cv", "lettre", "les_deux"], "les_deux"),
      nom_complet: t("Nom complet", 120, 2),
      poste_vise: t("Poste visé", 150, 2),
      entreprise_cible: t("Entreprise visée (facultatif)", 150),
      ville_pays: t("Ville et pays", 120),
      contact: t("E-mail et téléphone à afficher (facultatif)", 200),
      profil: t("En quelques phrases, qui êtes-vous ?", 800),
      formation: t("Formation (diplômes, écoles, années)", 1500, 2),
      experiences: t("Expériences, stages, bénévolat (avec dates)", 3000),
      competences: t("Compétences", 1500, 2),
      langues: t("Langues", 300),
      annonce: t("Texte de l'offre d'emploi (facultatif)", 3000),
    },
    build(form) {
      const wanted = { cv: "le CV", lettre: "la lettre de motivation", les_deux: "le CV puis la lettre de motivation" };
      return `Rédige ${wanted[form.document]}.\n${data(form)}`;
    },
  },
  {
    slug: "assistant-redaction",
    title: "Assistant de rédaction",
    description: "E-mails, courriers, offres et relances, prêts à envoyer.",
    course_slug: "rapports-appels-d-offres-propositions",
    max_tokens: 1800,
    system: REDACTION_SYSTEM,
    fields: {
      type_document: c(
        ["email", "courrier_administratif", "offre_commerciale", "relance", "compte_rendu", "annonce", "reponse_client"],
        "email",
      ),
      expediteur: t("Qui écrit ? (nom, fonction, organisation)", 200),
      destinataire: t("À qui ?", 200, 2),
      objet: t("Objet", 200, 2),
      points_cles: t("Ce que le document doit dire", 3000, 5),
      ton: c(["formel", "cordial", "ferme", "chaleureux"], "cordial"),
      longueur: c(["courte", "moyenne", "detaillee"], "moyenne"),
    },
    build: (form) => `Rédige ce document.\n${data(form)}`,
  },
  {
    slug: "plan-affaires",
    title: "Plan d'affaires en une page",
    description: "Votre idée structurée en plan d'affaires clair, avec les prochaines étapes.",
    course_slug: "du-concept-au-plan-d-affaires",
    max_tokens: 3000,
    system: PLAN_SYSTEM,
    fields: {
      nom_projet: t("Nom du projet", 120, 2),
      idee: t("Votre idée en quelques phrases", 1500, 10),
      clients: t("Qui sont vos clients ?", 1000, 5),
      probleme: t("Quel problème résolvez-vous ?", 1000, 5),
      solution: t("Votre solution", 1000, 5),
      concurrence: t("Concurrents et alternatives", 1000),
      revenus: t("Comment gagnez-vous de l'argent ? (prix, ventes prévues)", 1000, 5),
      couts: t("Principaux coûts", 1000),
      lieu: t("Ville et pays", 120),
      devise: t("Devise", 10, 0, "USD"),
      ressources: t("Ce dont vous disposez déjà (équipe, fonds, matériel)", 1000),
    },
    build: (form) => `Rédige le plan d'affaires.\n${data(form)}`,
  },
  {
    slug: "generateur-publications",
    title: "Générateur de publications",
    description: "Des publications prêtes à poster pour Facebook, Instagram, LinkedIn, WhatsApp ou TikTok.",
    course_slug: "marketing-digital-et-creation-de-contenu",
    max_tokens: 2500,
    system: PUBLICATION_SYSTEM,
    fields: {
      reseau: c(["facebook", "instagram", "linkedin", "whatsapp", "tiktok"], "facebook"),
      objectif: c(["vendre", "informer", "evenement", "recruter", "fideliser"], "vendre"),
      activite: t("Votre activité ou organisation", 200, 2),
      sujet: t("De quoi parle la publication ? (produit, offre, message)", 1500, 5),
      public: t("À qui s'adresse-t-elle ?", 300),
      infos_pratiques: t("Infos pratiques (prix, date, lieu, contact)", 500),
      ton: c(["professionnel", "chaleureux", "dynamique", "inspirant"], "chaleureux"),
      nombre: c(["1", "3", "5"], "3"),
    },
    build: (form) => `Rédige ${form.nombre} publication(s).\n${data(form)}`,
  },
  {
    slug: "simulateur-entretien",
    title: "Simulateur d'entretien",
    description: "Les questions probables pour votre poste, et une évaluation de vos réponses.",
    course_slug: "reussir-entretiens-et-tests-de-recrutement",
    max_tokens: 3000,
    system: ENTRETIEN_SYSTEM,
    fields: {
      poste: t("Poste visé", 150, 2),
      secteur: t("Entreprise ou secteur", 150),
      experience: c(["stage", "premier_emploi", "confirme"], "premier_emploi"),
      question: t("Question d'entretien à laquelle vous voulez répondre (facultatif)", 500),
      reponse: t("Votre réponse, pour la faire évaluer (facultatif)", 3000),
    },
    build: (form) => `${form.reponse ? "Évalue ma réponse." : "Prépare-moi à cet entretien."}\n${data(form)}`,
  },
  {
    slug: "coach-memoire",
    title: "Coach de mémoire",
    description: "Méthode et relecture pour votre mémoire, sans jamais rédiger à votre place.",
    course_slug: "bien-formuler-ses-demandes-a-l-ia",
    max_tokens: 3000,
    system: MEMOIRE_SYSTEM,
    fields: {
      etape: c(["choisir_sujet", "problematique", "plan", "methodologie", "relecture"], "problematique"),
      discipline: t("Discipline (gestion, droit, informatique…)", 150, 2),
      niveau: c(["licence", "master", "doctorat"], "licence"),
      sujet: t("Votre sujet ou vos pistes de sujet", 500),
      texte: t("Votre texte à relire (pour l'étape relecture)", 6000),
      question: t("Votre question précise (facultatif)", 800),
    },
    build: (form) => `Accompagne-moi pour l'étape « ${form.etape} ».\n${data(form)}`,
  },
];

export const TOOLS_BY_SLUG = Object.fromEntries(TOOLS.map((tool) => [tool.slug, tool]));

const titleOf = (name) => name.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Description du formulaire (format proche de JSON Schema) pour l'interface. */
export function formSchema(tool) {
  const properties = {};
  const required = [];
  for (const [name, f] of Object.entries(tool.fields)) {
    if (f.kind === "choice") {
      properties[name] = { title: titleOf(name), type: "string", enum: f.choices, default: f.default };
    } else {
      const spec = { title: f.title, type: "string", maxLength: f.max };
      if (f.min) {
        spec.minLength = f.min;
        required.push(name);
      } else {
        spec.default = f.default;
      }
      properties[name] = spec;
    }
  }
  return { type: "object", title: tool.title, properties, required };
}

/** Valide un formulaire : renvoie [données, erreurs]. */
export function validateForm(tool, payload) {
  const errors = [];
  const form = {};
  const input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  for (const key of Object.keys(input)) {
    if (!(key in tool.fields)) errors.push({ champ: key, message: "champ non autorisé" });
  }
  for (const [name, f] of Object.entries(tool.fields)) {
    const raw = input[name];
    if (f.kind === "choice") {
      if (raw === undefined || raw === null || raw === "") form[name] = f.default;
      else if (f.choices.includes(String(raw))) form[name] = String(raw);
      else errors.push({ champ: name, message: `valeur attendue : ${f.choices.join(", ")}` });
      continue;
    }
    if (raw === undefined || raw === null) {
      if (f.min) errors.push({ champ: name, message: "champ obligatoire" });
      else form[name] = f.default;
      continue;
    }
    if (typeof raw !== "string") {
      errors.push({ champ: name, message: "texte attendu" });
      continue;
    }
    const value = raw.trim();
    if (value.length < f.min) errors.push({ champ: name, message: f.min === 1 ? "champ obligatoire" : `au moins ${f.min} caractères` });
    else if (value.length > f.max) errors.push({ champ: name, message: `au plus ${f.max} caractères` });
    else form[name] = value;
  }
  return [form, errors];
}
