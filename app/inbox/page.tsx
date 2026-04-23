"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { InboxJobRow, InboxJobStatus, EvalMode } from "@/types";
import { jobTextHash } from "@/hooks/useSeenJobs";
import { EvaluationResultCard } from "@/components/EvaluationResultCard";
import type { EvaluationResultAny } from "@/types";

type InboxResp = { jobs?: InboxJobRow[]; error?: string };

function statusLabel(s: InboxJobStatus): string {
  switch (s) {
    case "new": return "Neu";
    case "evaluating": return "Bewertung läuft";
    case "evaluated": return "Bewertet";
    case "archived": return "Archiv";
    case "skipped_seen": return "Gesehen";
  }
}

export default function InboxPageWrapper() {
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}

function InboxPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<InboxJobStatus>("new");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<InboxJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evalLoading, setEvalLoading] = useState<string | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalResultById, setEvalResultById] = useState<Record<string, EvaluationResultAny>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = showAll ? "" : `?status=${encodeURIComponent(status)}`;
      const res = await fetch(`/api/inbox${q}`, { method: "GET" });
      const data = (await res.json().catch(() => ({}))) as InboxResp;
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [showAll, status]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const autoImportId = searchParams.get("autoImportId");
    if (!autoImportId) return;
    const modeParam = searchParams.get("mode");
    const desiredMode: EvalMode | null = modeParam === "quick_cash" ? "quick_cash" : null;

    (async () => {
      try {
        // load pending jobs from server
        const res = await fetch(`/api/extension/pending?id=${encodeURIComponent(autoImportId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.jobs)) {
          throw new Error(typeof data?.error === "string" ? data.error : "Konnte Pending-Import nicht laden.");
        }

        // import into inbox
        const imp = await fetch("/api/inbox/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: data.jobs }),
        });
        const payload = await imp.json().catch(() => ({}));
        if (!imp.ok) throw new Error(payload?.error ?? "Import fehlgeschlagen.");

        // after successful import, refresh list
        await reload();

        // optional: set mode default by switching filter to new
        if (desiredMode) {
          setEvalError(null);
        }
      } catch (e) {
        setError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Import fehlgeschlagen.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function patchJob(id: string, patch: Partial<{ status: InboxJobStatus; evaluationId: string; lastEvalMode: EvalMode }>) {
    await fetch(`/api/inbox/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function markSeen(job: InboxJobRow) {
    const hash = jobTextHash(job.jobText);
    await fetch("/api/seen-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ hash, upworkJobId: job.upworkJobId }] }),
    });
    await patchJob(job.upworkJobId, { status: "skipped_seen" });
    await reload();
  }

  async function archive(job: InboxJobRow) {
    await patchJob(job.upworkJobId, { status: "archived" });
    await reload();
  }

  async function evaluateOne(job: InboxJobRow, mode: EvalMode) {
    setEvalLoading(job.upworkJobId);
    setEvalError(null);
    try {
      await patchJob(job.upworkJobId, { status: "evaluating", lastEvalMode: mode });
      const endpoint = mode === "quick_cash" ? "/api/evaluate-quick" : "/api/evaluate";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          async: true,
          jobText: job.jobText,
          meta: { source: job.source, title: job.title, jobUrl: job.jobUrl, upworkJobId: job.upworkJobId },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.jobId !== "string") {
        throw new Error(data?.error ?? "Konnte Bewertung nicht starten.");
      }
      const jobId = data.jobId as string;
      await patchJob(job.upworkJobId, { evaluationId: jobId, lastEvalMode: mode });

      // poll until done (single job only)
      for (let i = 0; i < 90; i++) {
        const pr = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, { method: "GET" });
        const pd = await pr.json().catch(() => ({}));
        if (pd?.status === "done" && pd?.result) {
          setEvalResultById((prev) => ({ ...prev, [job.upworkJobId]: pd.result }));
          await patchJob(job.upworkJobId, { status: "evaluated" });
          await reload();
          return;
        }
        if (pd?.status === "error") {
          throw new Error(typeof pd?.error === "string" ? pd.error : "Bewertung fehlgeschlagen.");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Timeout beim Warten auf Ergebnis.");
    } catch (e) {
      setEvalError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Bewertung fehlgeschlagen.");
      await patchJob(job.upworkJobId, { status: "new" });
    } finally {
      setEvalLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            Importiere Jobs per Chrome Extension. Hier wird dedupliziert und du bewertest selektiv.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-muted transition hover:text-white">
            Zur Bewertung
          </Link>
          <button type="button" onClick={reload} className="rounded-lg border border-accent/50 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10">
            Aktualisieren
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-surface/40 p-3">
        <label className="text-xs font-medium text-muted">Filter</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as InboxJobStatus)}
          disabled={showAll}
          className="rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        >
          <option value="new">Neu</option>
          <option value="evaluating">Bewertung läuft</option>
          <option value="evaluated">Bewertet</option>
          <option value="skipped_seen">Gesehen</option>
          <option value="archived">Archiv</option>
        </select>
        <label className="ml-2 inline-flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-accent" />
          Alle anzeigen
        </label>
        <div className="ml-auto text-xs text-muted">
          {loading ? "Lädt…" : `${jobs.length} Jobs`}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {evalError && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {evalError}
        </div>
      )}

      <ul className="space-y-3">
        {jobs.map((job) => {
          const isExpanded = expanded === job.upworkJobId;
          const isEval = evalLoading === job.upworkJobId;
          const result = evalResultById[job.upworkJobId];
          return (
            <li key={job.upworkJobId} className="rounded-xl border border-white/10 bg-surface/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{job.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {statusLabel(job.status)} · {job.budget ? `Budget ${job.budget}` : "—"} · {job.postedOn ?? "—"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-white/80">
                    {job.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isEval}
                    onClick={() => evaluateOne(job, "quick_cash")}
                    className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
                  >
                    Quick Cash bewerten
                  </button>
                  <button
                    type="button"
                    disabled={isEval}
                    onClick={() => evaluateOne(job, "sidehustle")}
                    className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    Sidehustle bewerten
                  </button>
                  <button
                    type="button"
                    disabled={isEval}
                    onClick={() => markSeen(job)}
                    className="rounded-md border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
                  >
                    Gesehen
                  </button>
                  <button
                    type="button"
                    disabled={isEval}
                    onClick={() => archive(job)}
                    className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-muted transition hover:text-white disabled:opacity-50"
                  >
                    Archiv
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : job.upworkJobId)}
                    className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-muted transition hover:text-white"
                  >
                    {isExpanded ? "Zu" : "Details"}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  <div className="text-xs text-muted">
                    <span className="font-semibold text-white/80">URL</span>:{" "}
                    <a className="text-accent hover:underline" href={job.jobUrl} target="_blank" rel="noreferrer">
                      {job.jobUrl}
                    </a>
                  </div>
                  {Array.isArray(job.skills) && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {job.skills.slice(0, 12).map((s) => (
                        <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm text-accent underline decoration-accent/50 underline-offset-2">Jobtext</summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/90">
                      {job.jobText}
                    </pre>
                  </details>
                  {result && <EvaluationResultCard result={result} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!loading && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-white">Keine Jobs</h2>
          <p className="mt-2 text-sm text-muted">Importiere Jobs über die Chrome Extension, dann tauchen sie hier auf.</p>
        </div>
      )}
    </div>
  );
}

