import path from "path";
import fs from "fs";
import type { CanonicalUpworkJob, InboxJobRow, InboxJobSource, InboxJobStatus, SavedEvaluation, EvaluationResultAny, EvalMode } from "@/types";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "evaluations.db");

type SqliteDb = {
  pragma: (sql: string, opts?: { simple?: boolean }) => unknown;
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown | undefined;
    run: (...params: unknown[]) => unknown;
  };
  transaction: <TArgs extends unknown[]>(
    fn: (...args: TArgs) => void,
  ) => (...args: TArgs) => void;
};

let _db: SqliteDb | null = null;
let _mode: "sqlite" | "memory" = "sqlite";
let _warned = false;

// In-memory fallback (Dev-friendly when native addon fails)
const memEvaluations = new Map<string, SavedEvaluation>();
const memSeenByHash = new Map<string, { upworkJobId?: string; seenAt: string }>();
const memInboxJobs = new Map<string, InboxJobRow>();

function warnOnce(msg: string, extra?: unknown) {
  if (_warned) return;
  _warned = true;
  const debug =
    process.env.DB_DEBUG?.trim() === "1" ||
    process.env.DB_DEBUG?.trim()?.toLowerCase() === "true";

  if (debug && extra) {
    // eslint-disable-next-line no-console
    console.warn(msg, extra);
    return;
  }

  const extraMsg =
    extra && typeof extra === "object" && "message" in extra
      ? String((extra as { message: unknown }).message)
      : undefined;
  const extraOneLine = extraMsg
    ? extraMsg.replace(/\s+/g, " ").trim().slice(0, 260)
    : undefined;
  // eslint-disable-next-line no-console
  console.warn(msg + (extraOneLine ? ` (${extraOneLine})` : ""));
}

function tryLoadSqlite(): SqliteDb | null {
  try {
    // IMPORTANT: lazy-load so native addon errors don't crash the whole server bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as new (filename: string) => SqliteDb;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        saved_at TEXT NOT NULL,
        job_snippet TEXT NOT NULL,
        evaluation TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        starred INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS seen_jobs (
        hash TEXT PRIMARY KEY,
        upwork_job_id TEXT,
        seen_at TEXT NOT NULL
      )
    `);

    const version = (db.pragma("user_version", { simple: true }) as number) ?? 0;
    if (version < 1) {
      db.exec(`
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

    if (version < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS inbox_jobs (
          upwork_job_id TEXT PRIMARY KEY,
          job_url TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          skills TEXT NOT NULL DEFAULT '[]',
          posted_on TEXT,
          job_type TEXT,
          budget TEXT,
          duration TEXT,
          contractor_tier TEXT,
          source TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          imported_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          evaluation_id TEXT,
          last_eval_mode TEXT,
          job_text TEXT NOT NULL,
          raw_json TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_job_url ON inbox_jobs(job_url);
        CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_inbox_last_seen_at ON inbox_jobs(last_seen_at);
        PRAGMA user_version = 2;
      `);
    }

    return db;
  } catch (e) {
    warnOnce(
      "[db] better-sqlite3 konnte nicht geladen werden – fallback auf In-Memory Storage (Dev). " +
        "Ursache ist meist ein Node-ABI-Mismatch. Fix: 'npm rebuild better-sqlite3' mit der Node-Version, die den Dev-Server startet.",
      e,
    );
    return null;
  }
}

function ensureBackend() {
  if (_mode === "memory") return;
  if (_db) return;
  const loaded = tryLoadSqlite();
  if (loaded) {
    _db = loaded;
    _mode = "sqlite";
    return;
  }
  _mode = "memory";
}

function getDb(): SqliteDb | null {
  ensureBackend();
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

interface InboxRow {
  upwork_job_id: string;
  job_url: string;
  title: string;
  description: string;
  skills: string;
  posted_on?: string | null;
  job_type?: string | null;
  budget?: string | null;
  duration?: string | null;
  contractor_tier?: string | null;
  source: string;
  status: string;
  imported_at: string;
  last_seen_at: string;
  evaluation_id?: string | null;
  last_eval_mode?: string | null;
  job_text: string;
  raw_json?: string | null;
}

function rowToInboxJob(row: InboxRow): InboxJobRow {
  return {
    upworkJobId: row.upwork_job_id,
    jobUrl: row.job_url,
    title: row.title,
    description: row.description,
    skills: JSON.parse(row.skills || "[]") as string[],
    postedOn: row.posted_on ?? undefined,
    jobType: row.job_type ?? undefined,
    budget: row.budget ?? undefined,
    duration: row.duration ?? undefined,
    contractorTier: row.contractor_tier ?? undefined,
    source: row.source as InboxJobSource,
    status: row.status as InboxJobStatus,
    importedAt: row.imported_at,
    lastSeenAt: row.last_seen_at,
    evaluationId: row.evaluation_id ?? undefined,
    lastEvalMode: (row.last_eval_mode as EvalMode | null) ?? undefined,
    jobText: row.job_text,
  };
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
  ensureBackend();
  if (_mode === "memory") {
    let entries = Array.from(memEvaluations.values());
    entries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));

    if (options?.search) {
      const q = options.search.toLowerCase();
      entries = entries.filter((e) => {
        const hay = `${e.jobSnippet ?? ""}\n${e.title ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (options?.starred !== undefined) {
      entries = entries.filter((e) => e.starred === options.starred);
    }
    if (options?.viable !== undefined) {
      entries = entries.filter((e) => e.evaluation.viable === options.viable);
    }
    return entries;
  }

  const db = getDb();
  if (!db) return [];
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
  ensureBackend();
  if (_mode === "memory") return memEvaluations.get(id);

  const db = getDb();
  if (!db) return undefined;
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
  ensureBackend();
  if (_mode === "memory") {
    memEvaluations.set(entry.id, entry);
    return;
  }
  const db = getDb();
  if (!db) {
    memEvaluations.set(entry.id, entry);
    return;
  }
  db.prepare(INSERT_SQL).run(...entryParams(entry));
}

export function dbInsertMany(entries: SavedEvaluation[]): void {
  ensureBackend();
  if (_mode === "memory") {
    for (const e of entries) memEvaluations.set(e.id, e);
    return;
  }
  const db = getDb();
  if (!db) {
    for (const e of entries) memEvaluations.set(e.id, e);
    return;
  }
  const stmt = db.prepare(INSERT_SQL);
  const insertAll = db.transaction((items: SavedEvaluation[]) => {
    for (const e of items) stmt.run(...entryParams(e));
  });
  insertAll(entries);
}

export function dbFindByUpworkJobId(upworkJobId: string): SavedEvaluation | undefined {
  ensureBackend();
  if (_mode === "memory") {
    for (const e of Array.from(memEvaluations.values())) {
      if (e.upworkJobId && e.upworkJobId === upworkJobId) return e;
    }
    return undefined;
  }
  const db = getDb();
  if (!db) return undefined;
  const row = db.prepare("SELECT * FROM evaluations WHERE upwork_job_id = ? LIMIT 1").get(upworkJobId) as EvalRow | undefined;
  return row ? rowToEntry(row) : undefined;
}

export function dbUpdate(
  id: string,
  patch: Partial<Pick<SavedEvaluation, "tags" | "starred">>,
): void {
  ensureBackend();
  if (_mode === "memory") {
    const current = memEvaluations.get(id);
    if (!current) return;
    memEvaluations.set(id, {
      ...current,
      ...(patch.tags !== undefined ? { tags: patch.tags } : null),
      ...(patch.starred !== undefined ? { starred: patch.starred } : null),
    });
    return;
  }
  const db = getDb();
  if (!db) return;
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
  ensureBackend();
  if (_mode === "memory") {
    memEvaluations.delete(id);
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare("DELETE FROM evaluations WHERE id = ?").run(id);
}

export function dbDeleteMany(ids: string[]): void {
  if (ids.length === 0) return;
  ensureBackend();
  if (_mode === "memory") {
    for (const id of ids) memEvaluations.delete(id);
    return;
  }
  const db = getDb();
  if (!db) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM evaluations WHERE id IN (${placeholders})`).run(...ids);
}

// ── Seen Jobs ──

export function dbMarkSeen(entries: Array<{ hash: string; upworkJobId?: string }>): void {
  if (entries.length === 0) return;
  ensureBackend();
  if (_mode === "memory") {
    const now = new Date().toISOString();
    for (const e of entries) {
      if (memSeenByHash.has(e.hash)) continue;
      memSeenByHash.set(e.hash, { upworkJobId: e.upworkJobId, seenAt: now });
    }
    return;
  }
  const db = getDb();
  if (!db) {
    const now = new Date().toISOString();
    for (const e of entries) {
      if (memSeenByHash.has(e.hash)) continue;
      memSeenByHash.set(e.hash, { upworkJobId: e.upworkJobId, seenAt: now });
    }
    return;
  }
  const stmt = db.prepare("INSERT OR IGNORE INTO seen_jobs (hash, upwork_job_id, seen_at) VALUES (?, ?, ?)");
  const now = new Date().toISOString();
  const insertAll = db.transaction((items: typeof entries) => {
    for (const e of items) stmt.run(e.hash, e.upworkJobId ?? null, now);
  });
  insertAll(entries);
}

export function dbGetAllSeenHashes(): string[] {
  ensureBackend();
  if (_mode === "memory") return Array.from(memSeenByHash.keys());
  const db = getDb();
  if (!db) return Array.from(memSeenByHash.keys());
  const rows = db.prepare("SELECT hash FROM seen_jobs").all() as Array<{ hash: string }>;
  return rows.map((r) => r.hash);
}

export function dbGetAllSeenUpworkJobIds(): string[] {
  ensureBackend();
  if (_mode === "memory") {
    const out = new Set<string>();
    for (const v of Array.from(memSeenByHash.values())) {
      if (v.upworkJobId) out.add(v.upworkJobId);
    }
    return Array.from(out);
  }
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare("SELECT DISTINCT upwork_job_id FROM seen_jobs WHERE upwork_job_id IS NOT NULL").all() as Array<{ upwork_job_id: string }>;
  return rows.map((r) => r.upwork_job_id);
}

export function dbGetAllEvaluationUpworkJobIds(): string[] {
  ensureBackend();
  if (_mode === "memory") {
    const out = new Set<string>();
    for (const e of Array.from(memEvaluations.values())) {
      if (e.upworkJobId) out.add(e.upworkJobId);
    }
    return Array.from(out);
  }
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare("SELECT DISTINCT upwork_job_id FROM evaluations WHERE upwork_job_id IS NOT NULL")
    .all() as Array<{ upwork_job_id: string }>;
  return rows.map((r) => r.upwork_job_id);
}

// ── Inbox Jobs ──

function buildJobTextForInbox(job: Pick<CanonicalUpworkJob, "title" | "description" | "skills" | "postedOn" | "jobType" | "budget" | "duration" | "contractorTier" | "jobUrl">): string {
  const parts: string[] = [];
  parts.push(`TITLE: ${job.title}`);
  if (job.postedOn) parts.push(`POSTED: ${job.postedOn}`);
  if (job.jobType) parts.push(`TYPE: ${job.jobType}`);
  if (job.contractorTier) parts.push(`LEVEL: ${job.contractorTier}`);
  if (job.duration) parts.push(`DURATION: ${job.duration}`);
  if (job.budget) parts.push(`BUDGET: ${job.budget}`);
  parts.push(`URL: ${job.jobUrl}`);
  if (job.skills.length) parts.push(`SKILLS: ${job.skills.slice(0, 10).join(", ")}`);
  parts.push("");
  parts.push("DESCRIPTION:");
  parts.push(job.description);
  return parts.join("\n");
}

export function dbInboxUpsertMany(jobs: CanonicalUpworkJob[]): { imported: number; updated: number } {
  if (jobs.length === 0) return { imported: 0, updated: 0 };
  ensureBackend();

  const now = new Date().toISOString();
  const normalizeSkills = (skills: string[]) =>
    Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean))).slice(0, 30);

  if (_mode === "memory") {
    let imported = 0;
    let updated = 0;
    for (const j of jobs) {
      const skills = normalizeSkills(j.skills ?? []);
      const jobText = buildJobTextForInbox({ ...j, skills });
      const prev = memInboxJobs.get(j.upworkJobId);
      if (prev) {
        updated++;
        memInboxJobs.set(j.upworkJobId, {
          ...prev,
          title: j.title,
          description: j.description,
          skills,
          postedOn: j.postedOn,
          jobType: j.jobType,
          budget: j.budget,
          duration: j.duration,
          contractorTier: j.contractorTier,
          jobUrl: j.jobUrl,
          source: j.source,
          lastSeenAt: now,
          jobText,
        });
      } else {
        imported++;
        memInboxJobs.set(j.upworkJobId, {
          upworkJobId: j.upworkJobId,
          jobUrl: j.jobUrl,
          title: j.title,
          description: j.description,
          skills,
          postedOn: j.postedOn,
          jobType: j.jobType,
          budget: j.budget,
          duration: j.duration,
          contractorTier: j.contractorTier,
          source: j.source,
          status: "new",
          importedAt: now,
          lastSeenAt: now,
          jobText,
        });
      }
    }
    return { imported, updated };
  }

  const db = getDb();
  if (!db) {
    // fallback to mem store
    _mode = "memory";
    return dbInboxUpsertMany(jobs);
  }

  const stmt = db.prepare(`
    INSERT INTO inbox_jobs
      (upwork_job_id, job_url, title, description, skills, posted_on, job_type, budget, duration, contractor_tier,
       source, status, imported_at, last_seen_at, evaluation_id, last_eval_mode, job_text, raw_json)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(upwork_job_id) DO UPDATE SET
      job_url=excluded.job_url,
      title=excluded.title,
      description=excluded.description,
      skills=excluded.skills,
      posted_on=excluded.posted_on,
      job_type=excluded.job_type,
      budget=excluded.budget,
      duration=excluded.duration,
      contractor_tier=excluded.contractor_tier,
      source=excluded.source,
      last_seen_at=excluded.last_seen_at,
      job_text=excluded.job_text,
      raw_json=excluded.raw_json
  `);

  const existsStmt = db.prepare("SELECT upwork_job_id FROM inbox_jobs WHERE upwork_job_id = ? LIMIT 1");

  let imported = 0;
  let updated = 0;

  const runAll = db.transaction((items: CanonicalUpworkJob[]) => {
    for (const j of items) {
      const skills = normalizeSkills(j.skills ?? []);
      const jobText = buildJobTextForInbox({ ...j, skills });
      const exists = existsStmt.get(j.upworkJobId) as { upwork_job_id: string } | undefined;
      if (exists) updated++; else imported++;
      stmt.run(
        j.upworkJobId,
        j.jobUrl,
        j.title,
        j.description,
        JSON.stringify(skills),
        j.postedOn ?? null,
        j.jobType ?? null,
        j.budget ?? null,
        j.duration ?? null,
        j.contractorTier ?? null,
        j.source,
        "new",
        now,
        now,
        jobText,
        j.raw ? JSON.stringify(j.raw) : null,
      );
    }
  });
  runAll(jobs);
  return { imported, updated };
}

export function dbInboxList(options?: { status?: InboxJobStatus; limit?: number; offset?: number }): InboxJobRow[] {
  ensureBackend();
  const status = options?.status;
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
  const offset = Math.max(0, options?.offset ?? 0);

  if (_mode === "memory") {
    let arr = Array.from(memInboxJobs.values());
    if (status) arr = arr.filter((j) => j.status === status);
    arr.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0));
    return arr.slice(offset, offset + limit);
  }

  const db = getDb();
  if (!db) return [];
  const where = status ? "WHERE status = ?" : "";
  const params: unknown[] = [];
  if (status) params.push(status);
  params.push(limit, offset);
  const rows = db.prepare(`SELECT * FROM inbox_jobs ${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).all(...params) as InboxRow[];
  return rows.map(rowToInboxJob);
}

export function dbInboxGet(upworkJobId: string): InboxJobRow | undefined {
  ensureBackend();
  if (_mode === "memory") return memInboxJobs.get(upworkJobId);
  const db = getDb();
  if (!db) return undefined;
  const row = db.prepare("SELECT * FROM inbox_jobs WHERE upwork_job_id = ? LIMIT 1").get(upworkJobId) as InboxRow | undefined;
  return row ? rowToInboxJob(row) : undefined;
}

export function dbInboxSetStatus(upworkJobId: string, status: InboxJobStatus, patch?: { evaluationId?: string; lastEvalMode?: EvalMode }): void {
  ensureBackend();
  const now = new Date().toISOString();
  if (_mode === "memory") {
    const cur = memInboxJobs.get(upworkJobId);
    if (!cur) return;
    memInboxJobs.set(upworkJobId, { ...cur, status, lastSeenAt: now, ...(patch?.evaluationId ? { evaluationId: patch.evaluationId } : null), ...(patch?.lastEvalMode ? { lastEvalMode: patch.lastEvalMode } : null) });
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare("UPDATE inbox_jobs SET status = ?, last_seen_at = ?, evaluation_id = COALESCE(?, evaluation_id), last_eval_mode = COALESCE(?, last_eval_mode) WHERE upwork_job_id = ?")
    .run(status, now, patch?.evaluationId ?? null, patch?.lastEvalMode ?? null, upworkJobId);
}
