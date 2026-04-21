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

  _db.exec(`
    CREATE TABLE IF NOT EXISTS seen_jobs (
      hash TEXT PRIMARY KEY,
      upwork_job_id TEXT,
      seen_at TEXT NOT NULL
    )
  `);

  const version = (_db.pragma("user_version", { simple: true }) as number) ?? 0;
  if (version < 1) {
    _db.exec(`
      ALTER TABLE evaluations ADD COLUMN title TEXT;
      ALTER TABLE evaluations ADD COLUMN job_url TEXT;
      ALTER TABLE evaluations ADD COLUMN upwork_job_id TEXT;
      ALTER TABLE evaluations ADD COLUMN budget TEXT;
      ALTER TABLE evaluations ADD COLUMN duration TEXT;
      ALTER TABLE evaluations ADD COLUMN skills TEXT DEFAULT '[]';
      ALTER TABLE evaluations ADD COLUMN source TEXT;
      CREATE INDEX IF NOT EXISTS idx_eval_upwork_job_id ON evaluations(upwork_job_id);
      CREATE INDEX IF NOT EXISTS idx_seen_upwork_id ON seen_jobs(upwork_job_id);
      PRAGMA user_version = 1;
    `);
  }

  return _db;
}

interface EvalRow {
  id: string;
  saved_at: string;
  job_snippet: string;
  evaluation: string;
  tags: string;
  starred: number;
  title?: string | null;
  job_url?: string | null;
  upwork_job_id?: string | null;
  budget?: string | null;
  duration?: string | null;
  skills?: string | null;
  source?: string | null;
}

function rowToEntry(row: EvalRow): SavedEvaluation {
  return {
    id: row.id,
    savedAt: row.saved_at,
    jobSnippet: row.job_snippet,
    evaluation: JSON.parse(row.evaluation) as EvaluationResultAny,
    tags: JSON.parse(row.tags) as string[],
    starred: row.starred === 1,
    title: row.title ?? undefined,
    jobUrl: row.job_url ?? undefined,
    upworkJobId: row.upwork_job_id ?? undefined,
    budget: row.budget ?? undefined,
    duration: row.duration ?? undefined,
    skills: row.skills ? JSON.parse(row.skills) as string[] : undefined,
    source: (row.source as SavedEvaluation["source"]) ?? undefined,
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
    conditions.push("(job_snippet LIKE ? OR title LIKE ?)");
    params.push(`%${options.search}%`, `%${options.search}%`);
  }
  if (options?.starred !== undefined) {
    conditions.push("starred = ?");
    params.push(options.starred ? 1 : 0);
  }

  if (conditions.length > 0) {
    sql = `SELECT * FROM evaluations WHERE ${conditions.join(" AND ")} ORDER BY saved_at DESC`;
  }

  const rows = db.prepare(sql).all(...params) as EvalRow[];

  let entries = rows.map(rowToEntry);

  if (options?.viable !== undefined) {
    entries = entries.filter((e) => e.evaluation.viable === options.viable);
  }

  return entries;
}

export function dbGetById(id: string): SavedEvaluation | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as EvalRow | undefined;
  return row ? rowToEntry(row) : undefined;
}

const INSERT_SQL = `INSERT OR REPLACE INTO evaluations
  (id, saved_at, job_snippet, evaluation, tags, starred, title, job_url, upwork_job_id, budget, duration, skills, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function entryParams(e: SavedEvaluation) {
  return [
    e.id, e.savedAt, e.jobSnippet, JSON.stringify(e.evaluation),
    JSON.stringify(e.tags ?? []), e.starred ? 1 : 0,
    e.title ?? null, e.jobUrl ?? null, e.upworkJobId ?? null,
    e.budget ?? null, e.duration ?? null,
    e.skills ? JSON.stringify(e.skills) : null, e.source ?? null,
  ];
}

export function dbInsert(entry: SavedEvaluation): void {
  const db = getDb();
  db.prepare(INSERT_SQL).run(...entryParams(entry));
}

export function dbInsertMany(entries: SavedEvaluation[]): void {
  const db = getDb();
  const stmt = db.prepare(INSERT_SQL);
  const insertAll = db.transaction((items: SavedEvaluation[]) => {
    for (const e of items) stmt.run(...entryParams(e));
  });
  insertAll(entries);
}

export function dbFindByUpworkJobId(upworkJobId: string): SavedEvaluation | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM evaluations WHERE upwork_job_id = ? LIMIT 1").get(upworkJobId) as EvalRow | undefined;
  return row ? rowToEntry(row) : undefined;
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

// ── Seen Jobs ──

export function dbMarkSeen(entries: Array<{ hash: string; upworkJobId?: string }>): void {
  if (entries.length === 0) return;
  const db = getDb();
  const stmt = db.prepare("INSERT OR IGNORE INTO seen_jobs (hash, upwork_job_id, seen_at) VALUES (?, ?, ?)");
  const now = new Date().toISOString();
  const insertAll = db.transaction((items: typeof entries) => {
    for (const e of items) stmt.run(e.hash, e.upworkJobId ?? null, now);
  });
  insertAll(entries);
}

export function dbGetAllSeenHashes(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT hash FROM seen_jobs").all() as Array<{ hash: string }>;
  return rows.map((r) => r.hash);
}

export function dbGetAllSeenUpworkJobIds(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT upwork_job_id FROM seen_jobs WHERE upwork_job_id IS NOT NULL").all() as Array<{ upwork_job_id: string }>;
  return rows.map((r) => r.upwork_job_id);
}
