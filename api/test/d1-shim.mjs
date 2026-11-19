// Imitation de l'API D1 de Cloudflare sur le SQLite intégré à Node, pour les tests.
import { DatabaseSync } from "node:sqlite";

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    for (const p of params) {
      if (typeof p === "boolean" || (p !== null && typeof p === "object")) {
        throw new TypeError(`Type non pris en charge par D1 : ${typeof p}`);
      }
    }
    return new Statement(this.db, this.sql, params);
  }
  _exec(mode) {
    try {
      const stmt = this.db.prepare(this.sql);
      if (mode === "run") return stmt.run(...this.params);
      return stmt.all(...this.params).map((row) => ({ ...row }));
    } catch (err) {
      throw new Error(`D1_ERROR: ${err.message}`);
    }
  }
  async all() {
    this.db.calls += 1;
    return { results: this._exec("all"), success: true, meta: {} };
  }
  async first(column) {
    this.db.calls += 1;
    const row = this._exec("all")[0] ?? null;
    return column && row ? row[column] : row;
  }
  async run() {
    this.db.calls += 1;
    const info = this._exec("run");
    return { success: true, meta: { changes: info.changes } };
  }
}

export class D1Shim {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.calls = 0; // appels à D1 (un lot compte pour un)
    this.queries = 0;
  }
  prepare(sql) {
    this.queries += 1;
    return new Statement(this.db, sql);
  }
  get calls() {
    return this.db.calls;
  }
  async batch(statements) {
    this.db.calls += 1;
    this.db.exec("BEGIN");
    try {
      const out = statements.map((s) => ({ results: s._exec(/^\s*select/i.test(s.sql) ? "all" : "run"), success: true }));
      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 1 };
  }
}
