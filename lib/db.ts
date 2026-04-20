import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { SavedEvaluation, EvaluationResultAny } from "@/types";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "evaluations.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      saved_at TEXT NOT NULL,
      job_snippet TEXT NOT NULL,
      evaluation TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      starred INTEGER DEFAULT 0
    )
  `);

  return _db;
}

function rowToEntry(row: {
  id: string;
  saved_at: string;
  job_snippet: string;
  evaluation: string;
  tags: string;
  starred: number;
}): SavedEvaluation {
  return {
    id: row.id,
    savedAt: row.saved_at,
    jobSnippet: row.job_snippet,
    evaluation: JSON.parse(row.evaluation) as EvaluationResultAny,
    tags: JSON.parse(row.tags) as string[],
    starred: row.starred === 1,
  };
}

export function dbGetAll(options?: {
  search?: string;
  viable?: boolean;
  starred?: boolean;
}): SavedEvaluation[] {
  const db = getDb();
  let sql = "SELECT * FROM evaluations ORDER BY saved_at DESC";
  const params: unknown[] = [];

  const conditions: string[] = [];
  if (options?.search) {
    conditions.push("job_snippet LIKE ?");
    params.push(`%${options.search}%`);
  }
  if (options?.starred !== undefined) {
    conditions.push("starred = ?");
    params.push(options.starred ? 1 : 0);
  }

  if (conditions.length > 0) {
    sql = `SELECT * FROM evaluations WHERE ${conditions.join(" AND ")} ORDER BY saved_at DESC`;
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    saved_at: string;
    job_snippet: string;
    evaluation: string;
    tags: string;
    starred: number;
  }>;

  let entries = rows.map(rowToEntry);

  if (options?.viable !== undefined) {
    entries = entries.filter((e) => e.evaluation.viable === options.viable);
  }

  return entries;
}

export function dbGetById(id: string): SavedEvaluation | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as {
    id: string;
    saved_at: string;
    job_snippet: string;
    evaluation: string;
    tags: string;
    starred: number;
  } | undefined;
  return row ? rowToEntry(row) : undefined;
}

export function dbInsert(entry: SavedEvaluation): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO evaluations (id, saved_at, job_snippet, evaluation, tags, starred) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    entry.id,
    entry.savedAt,
    entry.jobSnippet,
    JSON.stringify(entry.evaluation),
    JSON.stringify(entry.tags ?? []),
    entry.starred ? 1 : 0,
  );
}

export function dbInsertMany(entries: SavedEvaluation[]): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO evaluations (id, saved_at, job_snippet, evaluation, tags, starred) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertAll = db.transaction((items: SavedEvaluation[]) => {
    for (const e of items) {
      stmt.run(
        e.id,
        e.savedAt,
        e.jobSnippet,
        JSON.stringify(e.evaluation),
        JSON.stringify(e.tags ?? []),
        e.starred ? 1 : 0,
      );
    }
  });
  insertAll(entries);
}

export function dbUpdate(
  id: string,
  patch: Partial<Pick<SavedEvaluation, "tags" | "starred">>,
): void {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    params.push(JSON.stringify(patch.tags));
  }
  if (patch.starred !== undefined) {
    sets.push("starred = ?");
    params.push(patch.starred ? 1 : 0);
  }

  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE evaluations SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function dbDelete(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM evaluations WHERE id = ?").run(id);
}

export function dbDeleteMany(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM evaluations WHERE id IN (${placeholders})`).run(...ids);
}
