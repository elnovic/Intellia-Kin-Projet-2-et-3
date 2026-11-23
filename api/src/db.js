// Base de données D1 (SQLite) : schéma et petites fonctions d'accès.
//
// Les dates sont stockées en texte ISO UTC (« 2026-11-19T10:00:00.000Z ») :
// l'ordre alphabétique est alors l'ordre chronologique.
// Les champs JSON sont stockés en texte ; les booléens en 0 ou 1.

export const SCHEMA_VERSION = "4";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    phone TEXT UNIQUE,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'learner',
    audience TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT 'tous',
    parcours TEXT NOT NULL DEFAULT 'tronc-commun',
    level TEXT NOT NULL DEFAULT 'debutant',
    format TEXT NOT NULL DEFAULT 'self_paced',
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    objectives TEXT NOT NULL DEFAULT '[]',
    skills TEXT NOT NULL DEFAULT '[]',
    prerequisites TEXT NOT NULL DEFAULT 'Aucun',
    trainer TEXT NOT NULL DEFAULT 'Équipe Intellia Kin',
    cover_image TEXT,
    position INTEGER NOT NULL DEFAULT 100,
    exam TEXT NOT NULL DEFAULT '{}',
    exam_pass_score INTEGER NOT NULL DEFAULT 70,
    exam_distinction_score INTEGER NOT NULL DEFAULT 90,
    status TEXT NOT NULL DEFAULT 'draft',
    is_template INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'console',
    content_hash TEXT,
    created_at TEXT NOT NULL,
    published_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS modules_course ON modules(course_id)`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    key TEXT,
    title TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    position INTEGER NOT NULL DEFAULT 1,
    is_preview INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS lessons_module ON lessons(module_id)`,
  `CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS blocks_lesson ON blocks(lesson_id)`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (user_id, course_id)
  )`,
  `CREATE INDEX IF NOT EXISTS enrollments_course ON enrollments(course_id)`,
  `CREATE TABLE IF NOT EXISTS lesson_progress (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL,
    UNIQUE (enrollment_id, lesson_id)
  )`,
  `CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS exam_attempts_enrollment ON exam_attempts(enrollment_id)`,
  `CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    distinction INTEGER NOT NULL DEFAULT 0,
    issued_at TEXT NOT NULL,
    UNIQUE (user_id, course_id)
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    cover_image TEXT,
    audience TEXT NOT NULL DEFAULT 'tous',
    status TEXT NOT NULL DEFAULT 'draft',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    expires_at TEXT,
    starts_at TEXT,
    ends_at TEXT,
    timezone TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
    location TEXT,
    online_url TEXT,
    capacity INTEGER,
    registration_deadline TEXT,
    registration_mode TEXT NOT NULL DEFAULT 'none',
    external_url TEXT,
    course_slug TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    organization TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (announcement_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS tool_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_slug TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tool_usage_user ON tool_usage(user_id, created_at)`,
  // Agent Instagram : propositions, validation, publication.
  `CREATE TABLE IF NOT EXISTS instagram_posts (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    topic_ref TEXT NOT NULL,
    topic_data TEXT NOT NULL DEFAULT '{}',
    headline TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT NOT NULL DEFAULT '[]',
    image_prompt TEXT NOT NULL DEFAULT '',
    background TEXT,
    image TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    scheduled_at TEXT,
    published_at TEXT,
    ig_container_id TEXT,
    ig_media_id TEXT,
    permalink TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS instagram_posts_status ON instagram_posts(status, scheduled_at)`,
  // Version 4 : retrait de la publication Facebook essayée en version 3 (table vide).
  `DROP TABLE IF EXISTS facebook_posts`,
];

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/** Petite enveloppe autour de D1 : requêtes paramétrées, résultats en objets. */
export class Db {
  constructor(d1) {
    this.d1 = d1;
  }

  stmt(sql, ...params) {
    return this.d1.prepare(sql).bind(...params.map(toSql));
  }

  async all(sql, ...params) {
    const { results } = await this.stmt(sql, ...params).all();
    return results || [];
  }

  async first(sql, ...params) {
    return (await this.stmt(sql, ...params).first()) ?? null;
  }

  async value(sql, ...params) {
    const row = await this.first(sql, ...params);
    return row ? Object.values(row)[0] : null;
  }

  async run(sql, ...params) {
    return this.stmt(sql, ...params).run();
  }

  /** Exécute plusieurs requêtes dans une seule transaction. */
  async batch(statements) {
    if (!statements.length) return [];
    return this.d1.batch(statements);
  }
}

function toSql(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

export function isUniqueError(err) {
  return /UNIQUE constraint failed/i.test(String(err?.message || err));
}

export async function ensureSchema(db) {
  let version = null;
  try {
    version = await db.value(`SELECT value FROM meta WHERE key = 'schema'`);
  } catch {
    version = null;
  }
  if (version === SCHEMA_VERSION) return;
  await db.batch([
    ...SCHEMA.map((sql) => db.d1.prepare(sql)),
    db.stmt(`INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, SCHEMA_VERSION),
  ]);
}
