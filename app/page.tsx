"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ParsedJob, EvaluationResultQuickCash } from "@/types";
import { parseJobs, fetchPendingJobText, startEval, pollEval, streamEval } from "@/lib/api-client";
import type { PollResp } from "@/lib/api-client";
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, CONCURRENCY } from "@/lib/constants";
import BatchProgress from "@/components/BatchProgress";
import ResultsTable from "@/components/ResultsTable";

// ── Types ──

type JobRunStatus = "pending" | "running" | "done" | "error" | "skipped";

interface JobRun {
  id: string;
  job: ParsedJob;
  status: JobRunStatus;
  result?: EvaluationResultQuickCash;
  error?: string;
}

type BatchPhase = "idle" | "loading" | "parsing" | "running" | "done" | "error";

interface BatchState {
  phase: BatchPhase;
  runs: JobRun[];
  errorMsg?: string;
}

// ── Helpers ──

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitVisible(): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", handler); resolve(); } };
    document.addEventListener("visibilitychange", handler);
  });
}

async function pollUntilDone(
  jobId: string,
  signal: AbortSignal,
): Promise<PollResp> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline && !signal.aborted) {
    await waitVisible();
    if (signal.aborted) break;
    const resp = await pollEval(jobId);
    if (resp.status === "done" || resp.status === "error") return resp;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { jobId, status: "error", error: "Timeout beim Warten auf Ergebnis." };
}

// ── BatchEvaluator ──

function BatchEvaluator({ onBatchDone }: { onBatchDone: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<BatchState>({ phase: "idle", runs: [] });
  const abortRef = useRef<AbortController | null>(null);

  const autoEvalId = searchParams.get("autoEvalId");

  // Auto-trigger when extension opens page with autoEvalId
  useEffect(() => {
    if (autoEvalId && state.phase === "idle") {
      runBatch(autoEvalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEvalId]);

  const runBatch = useCallback(async (pendingId: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ phase: "loading", runs: [] });

    try {
      // 1. Load raw text from pending store
      const rawText = await fetchPendingJobText(pendingId);

      // 2. Parse jobs
      setState({ phase: "parsing", runs: [] });
      const parsed = await parseJobs(rawText);
      if (parsed.length === 0) {
        setState({ phase: "error", runs: [], errorMsg: "Keine Jobs im Text gefunden." });
        return;
      }

      // 3. Dedup: load known upworkJobIds from DB
      const knownIds = new Set<string>();
      try {
        const resp = await fetch("/api/evaluations?minScore=0");
        const data = await resp.json() as { entries?: Array<{ upworkJobId?: string }> };
        (data.entries ?? []).forEach((e) => { if (e.upworkJobId) knownIds.add(e.upworkJobId); });
      } catch { /* best-effort */ }

      // 4. Build runs, mark already-seen as skipped
      const runs: JobRun[] = parsed.slice(0, 50).map((job) => {
        const uid = job.jobUrl?.match(/~(\d{10,})/)?.[1];
        const skipped = !!(uid && knownIds.has(uid));
        return { id: makeId(), job, status: skipped ? "skipped" : "pending" };
      });

      setState({ phase: "running", runs });

      // 5. Concurrent evaluation
      const pending = runs.filter((r) => r.status === "pending");
      const queue = [...pending];

      const updateRun = (id: string, patch: Partial<JobRun>) => {
        setState((prev) => ({
          ...prev,
          runs: prev.runs.map((r) => r.id === id ? { ...r, ...patch } : r),
        }));
      };

      const evalOne = async (run: JobRun) => {
        updateRun(run.id, { status: "running" });
        try {
          const meta: Record<string, unknown> = {
            source: run.job.source,
            title: run.job.title,
            jobUrl: run.job.jobUrl,
            budget: run.job.budget,
            duration: run.job.duration,
            skills: run.job.skills,
            contractorTier: run.job.contractorTier,
          };

          let done = false;

          // Try SSE stream first
          const jobId = await startEval(run.job.jobText, meta);

          await new Promise<void>((resolve) => {
            const stopStream = streamEval(
              jobId,
              (data) => {
                if (data.status === "done" && data.result) {
                  updateRun(run.id, { status: "done", result: data.result as EvaluationResultQuickCash });
                  done = true;
                  resolve();
                } else if (data.status === "error") {
                  updateRun(run.id, { status: "error", error: data.error ?? "Fehler" });
                  done = true;
                  resolve();
                }
              },
              resolve,
            );
            ctrl.signal.addEventListener("abort", () => { stopStream(); resolve(); });
          });

          // Fallback polling if SSE gave no result — reuse same jobId, don't start a new eval
          if (!done) {
            const resp = await pollUntilDone(jobId, ctrl.signal);
            if (resp.status === "done" && resp.result) {
              updateRun(run.id, { status: "done", result: resp.result as EvaluationResultQuickCash });
            } else {
              updateRun(run.id, { status: "error", error: resp.error ?? "Fehler" });
            }
          }
        } catch (e) {
          if (!ctrl.signal.aborted) {
            updateRun(run.id, { status: "error", error: e instanceof Error ? e.message : "Fehler" });
          }
        }
      }

      // Run with concurrency limit
      let idx = 0;
      const worker = async () => {
        while (idx < queue.length && !ctrl.signal.aborted) {
          const run = queue[idx++];
          await evalOne(run);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

      setState((prev) => ({ ...prev, phase: "done" }));

      // Clear URL param after done
      router.replace("/?tab=eval", { scroll: false });

      // Notify parent to switch to results after 2s
      setTimeout(() => onBatchDone(), 2000);

    } catch (e) {
      if (!ctrl.signal.aborted) {
        setState({
          phase: "error", runs: [],
          errorMsg: e instanceof Error ? e.message : "Unbekannter Fehler.",
        });
      }
    }
  }, [router, onBatchDone]);

  const { phase, runs, errorMsg } = state;
  const done = runs.filter((r) => r.status === "done").length;
  const skipped = runs.filter((r) => r.status === "skipped").length;
  const errors = runs.filter((r) => r.status === "error").length;

  // ── Idle state ──
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="text-5xl">🔌</div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
          Chrome Extension verbinden
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md text-sm">
          Öffne Upwork Search, klicke im Extension-Popup auf{" "}
          <strong>&quot;Quick Cash Evaluate&quot;</strong> — die Jobs werden hier automatisch bewertet.
        </p>
        <p className="text-xs text-gray-400">
          Bis zu 50 Jobs pro Batch · Duplikate werden automatisch übersprungen
        </p>
      </div>
    );
  }

  // ── Loading / parsing ──
  if (phase === "loading" || phase === "parsing") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <svg className="animate-spin h-8 w-8 text-emerald-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-gray-500 text-sm">{phase === "loading" ? "Jobs werden geladen…" : "Jobs werden verarbeitet…"}</p>
      </div>
    );
  }

  // ── Error ──
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
        <p className="text-red-500 font-medium">{errorMsg ?? "Fehler"}</p>
        <button
          onClick={() => setState({ phase: "idle", runs: [] })}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Zurücksetzen
        </button>
      </div>
    );
  }

  // ── Running / Done ──
  return (
    <div className="space-y-6">
      <BatchProgress total={runs.length} done={done} skipped={skipped} errors={errors} />

      {phase === "done" && (
        <div className="text-center py-3">
          <p className="text-emerald-600 dark:text-emerald-400 font-medium text-sm">
            ✓ Batch abgeschlossen — {done} neue Bewertungen gespeichert
          </p>
          <button
            onClick={onBatchDone}
            className="mt-2 text-sm text-blue-500 hover:underline"
          >
            → Zu den Ergebnissen
          </button>
        </div>
      )}

      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.id}
            className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${
              run.status === "done"
                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20"
                : run.status === "error"
                ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                : run.status === "skipped"
                ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60"
                : run.status === "running"
                ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            }`}
          >
            {/* Status icon */}
            <span className="flex-shrink-0 mt-0.5">
              {run.status === "done" && <span className="text-emerald-500">✓</span>}
              {run.status === "error" && <span className="text-red-500">✕</span>}
              {run.status === "skipped" && <span className="text-gray-400">–</span>}
              {run.status === "running" && (
                <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {run.status === "pending" && <span className="text-gray-300">○</span>}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                {run.job.title ?? run.job.jobText.slice(0, 60)}
              </p>
              {run.status === "done" && run.result && (
                <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
                  <span className={`font-bold ${
                    run.result.quick_cash_score >= 80 ? "text-emerald-600" :
                    run.result.quick_cash_score >= 70 ? "text-yellow-600" : "text-orange-500"
                  }`}>
                    Score: {run.result.quick_cash_score}
                  </span>
                  {run.result.effort && <span>⏱ {run.result.effort}</span>}
                  {run.job.budget && <span>💰 {run.job.budget}</span>}
                </div>
              )}
              {run.status === "skipped" && <p className="text-xs text-gray-400">Bereits bewertet</p>}
              {run.status === "error" && <p className="text-xs text-red-500">{run.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──

type Tab = "eval" | "results";

function AppContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "results" ? "results" : "eval",
  );

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("autoEvalId");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Quick Cash Evaluator
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Upwork Jobs schnell auf Quick-Cash-Potenzial bewerten
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => switchTab("eval")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "eval"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Bewertung
          </button>
          <button
            onClick={() => switchTab("results")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "results"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Ergebnisse
          </button>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "eval" && (
            <BatchEvaluator onBatchDone={() => switchTab("results")} />
          )}
          {activeTab === "results" && (
            <ResultsTable />
          )}
        </div>

      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
