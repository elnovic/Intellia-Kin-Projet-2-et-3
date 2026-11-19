// Validation des données reçues : règles simples, messages en français.
//
// Une règle est une fonction (valeur, chemin, erreurs) -> valeur normalisée.
// `parseObject(schema, données)` renvoie l'objet normalisé ou lève une
// ValidationError qui liste chaque champ en cause.

export class ValidationError extends Error {
  constructor(errors, message = "Certains champs sont invalides.") {
    super(message);
    this.errors = errors;
  }
}

const MISSING = Symbol("absent");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHONE = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(errors, path, message) {
  errors.push({ champ: path || "bloc", message });
  return undefined;
}

function wrap(rule, opts) {
  // Gère les options communes : facultatif, valeur par défaut, null autorisé.
  return (value, path, errors) => {
    if (value === MISSING || value === undefined) {
      if ("default" in opts) return typeof opts.default === "function" ? opts.default() : opts.default;
      if (opts.optional) return MISSING;
      return fail(errors, path, "champ obligatoire");
    }
    if (value === null) {
      if (opts.nullable || ("default" in opts && opts.default === null)) return null;
      return fail(errors, path, "valeur manquante");
    }
    return rule(value, path, errors);
  };
}

export function str(opts = {}) {
  const { min = 0, max = 100_000, pattern, trim = true, patternMessage = "format invalide" } = opts;
  return wrap((value, path, errors) => {
    if (typeof value !== "string") return fail(errors, path, "texte attendu");
    const text = trim ? value.trim() : value;
    if (text.length < min) return fail(errors, path, min === 1 ? "champ obligatoire" : `au moins ${min} caractères`);
    if (text.length > max) return fail(errors, path, `au plus ${max} caractères`);
    if (pattern && !pattern.test(text)) return fail(errors, path, patternMessage);
    return text;
  }, opts);
}

export const slug = (opts = {}) => str({ max: 120, ...opts, pattern: SLUG, patternMessage: "lettres minuscules, chiffres et tirets uniquement" });
export const phone = (opts = {}) => str({ max: 32, ...opts, pattern: PHONE, patternMessage: "numéro au format international, par exemple +243812345678" });

export function email(opts = {}) {
  return wrap((value, path, errors) => {
    if (typeof value !== "string") return fail(errors, path, "texte attendu");
    const text = value.trim();
    if (text.length > 320 || !EMAIL.test(text)) return fail(errors, path, "adresse e-mail invalide");
    return text;
  }, opts);
}

export function int(opts = {}) {
  const { min = -Infinity, max = Infinity } = opts;
  return wrap((value, path, errors) => {
    let n = value;
    if (typeof n === "string" && /^-?\d+$/.test(n.trim())) n = Number(n.trim());
    if (typeof n !== "number" || !Number.isInteger(n)) return fail(errors, path, "nombre entier attendu");
    if (n < min) return fail(errors, path, `doit être au moins ${min}`);
    if (n > max) return fail(errors, path, `doit être au plus ${max}`);
    return n;
  }, opts);
}

export function bool(opts = {}) {
  return wrap((value, path, errors) => {
    if (typeof value !== "boolean") return fail(errors, path, "vrai ou faux attendu");
    return value;
  }, opts);
}

export function oneOf(choices, opts = {}) {
  return wrap((value, path, errors) => {
    if (!choices.includes(value)) return fail(errors, path, `valeur attendue : ${choices.join(", ")}`);
    return value;
  }, opts);
}

export function url(opts = {}) {
  const { media = false, max = 2000 } = opts;
  return wrap((value, path, errors) => {
    if (typeof value !== "string") return fail(errors, path, "adresse attendue");
    const text = value.trim();
    if (text.length > max) return fail(errors, path, `au plus ${max} caractères`);
    if (text.startsWith("https://") || (media && text.startsWith("/media/"))) {
      if (text.startsWith("https://")) {
        try {
          new URL(text);
        } catch {
          return fail(errors, path, "adresse invalide");
        }
      }
      return text;
    }
    return fail(errors, path, media ? "l'adresse doit commencer par https:// ou par /media/" : "l'adresse doit commencer par https://");
  }, opts);
}

// Date et heure : accepte « 2026-12-01T10:00 » (considérée en UTC) ou ISO complète.
export function datetime(opts = {}) {
  return wrap((value, path, errors) => {
    if (typeof value !== "string") return fail(errors, path, "date attendue");
    let text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) text += "Z";
    const date = new Date(text);
    if (!/^\d{4}-\d{2}-\d{2}/.test(text) || Number.isNaN(date.getTime())) return fail(errors, path, "date invalide");
    return date.toISOString();
  }, opts);
}

export function arr(item, opts = {}) {
  const { min = 0, max = 1000 } = opts;
  return wrap((value, path, errors) => {
    if (!Array.isArray(value)) return fail(errors, path, "liste attendue");
    if (value.length < min) return fail(errors, path, min === 1 ? "au moins un élément" : `au moins ${min} éléments`);
    if (value.length > max) return fail(errors, path, `au plus ${max} éléments`);
    return value.map((v, i) => item(v, path ? `${path}.${i}` : String(i), errors));
  }, opts);
}

export function obj(schema, opts = {}) {
  return wrap((value, path, errors) => parseInto(schema, value, path, errors, opts), opts);
}

export function any(opts = {}) {
  return wrap((value) => value, opts);
}

function parseInto(schema, value, path, errors, { strict = false, check } = {}) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(errors, path, "objet attendu");
  }
  const out = {};
  const before = errors.length;
  for (const [key, rule] of Object.entries(schema)) {
    const result = rule(key in value ? value[key] : MISSING, path ? `${path}.${key}` : key, errors);
    if (result !== MISSING) out[key] = result;
  }
  if (strict) {
    for (const key of Object.keys(value)) {
      if (!(key in schema)) fail(errors, path ? `${path}.${key}` : key, "champ non autorisé");
    }
  }
  if (check && errors.length === before) {
    const message = check(out);
    if (message) fail(errors, path, message);
  }
  return out;
}

export function parseObject(schema, value, opts = {}) {
  const errors = [];
  const out = parseInto(schema, value, "", errors, opts);
  if (errors.length) throw new ValidationError(errors);
  return out;
}

export function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export { MISSING, SLUG };
