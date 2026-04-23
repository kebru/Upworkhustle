import { NextResponse } from "next/server";

type PendingRec =
  | { id: string; createdAt: number; kind: "jobText"; text: string }
  | { id: string; createdAt: number; kind: "jobs"; json: string };

const store: Map<string, PendingRec> = (() => {
  const g = globalThis as unknown as { __upworkPendingJobs?: Map<string, PendingRec> };
  if (!g.__upworkPendingJobs) g.__upworkPendingJobs = new Map<string, PendingRec>();
  return g.__upworkPendingJobs;
})();

const TTL_MS = 10 * 60 * 1000;

function gc() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, rec] of Array.from(store.entries())) {
    if (rec.createdAt < cutoff) store.delete(id);
  }
}

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function POST(req: Request) {
  gc();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const hasJobs = body && typeof body === "object" && "jobs" in body;
  if (hasJobs) {
    const jobs = (body as { jobs?: unknown }).jobs;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: "jobs fehlt/leer." }, { status: 400 });
    }
    const json = JSON.stringify({ jobs });
    if (json.length < 50) {
      return NextResponse.json({ error: "jobs payload zu kurz." }, { status: 400 });
    }
    const id = makeId();
    store.set(id, { id, createdAt: Date.now(), kind: "jobs", json });
    return NextResponse.json({ id }, { status: 200 });
  }

  const text = (body && typeof body === "object" && "jobText" in body)
    ? String((body as { jobText?: unknown }).jobText ?? "").trim()
    : "";
  if (!text || text.length < 50) {
    return NextResponse.json({ error: "jobText fehlt/zu kurz." }, { status: 400 });
  }
  const id = makeId();
  store.set(id, { id, createdAt: Date.now(), kind: "jobText", text });
  return NextResponse.json({ id }, { status: 200 });
}

export async function GET(req: Request) {
  gc();
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  const rec = store.get(id);
  if (!rec) return NextResponse.json({ error: "Unbekannte id (evtl. abgelaufen)." }, { status: 404 });
  if (rec.kind === "jobs") {
    const parsed = JSON.parse(rec.json) as { jobs?: unknown };
    return NextResponse.json({ jobs: parsed.jobs }, { status: 200 });
  }
  return NextResponse.json({ jobText: rec.text }, { status: 200 });
}

