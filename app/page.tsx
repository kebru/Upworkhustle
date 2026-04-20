"use client";

import { useEffect, useState } from "react";
import { EvaluationResultCard } from "@/components/EvaluationResultCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useEvaluationHistory } from "@/hooks/useEvaluationHistory";
import { extractJobHeadline } from "@/lib/jobPreview";
import { normalizeJobText } from "@/lib/normalizeJobInput";
import { splitJobPostings } from "@/lib/splitJobs";
import type { EvaluationResult } from "@/types";

type JobRun = {
  id: string;
  jobText: string;
  title?: string;
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  skills?: string[];
  feedHasMoreToggle?: boolean;
  likelyTruncated?: boolean;
  descriptionCharLength?: number;
  jobTextCharLength?: number;
  wasTrimmed?: boolean;
  jobUrl?: string;
  source?: "upwork_feed" | "text";
  evaluationJobId?: string;
  status: "pending" | "loading" | "done" | "error";
  result?: EvaluationResult;
  error?: string;
};

function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function HomePage() {
  const [jobText, setJobText] = useState("");
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("✓ Gespeichert");

  const { save, saveMany } = useEvaluationHistory();
  /**
   * Viele Seiten (z. B. Upwork) legen beim Kopieren reichhaltiges HTML in die
   * Zwischenablage, aber kaum text/plain. Ein normales Textarea zeigt dann
   * „nichts“ – der Button blieb leer. Wenn HTML vorhanden ist und Klartext
   * fehlt oder viel kürzer ist, fügen wir das HTML ein.
   */
  function handleJobPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    if (!html || html.length < 80) return;

    const plainT = plain.trim();
    const htmlT = html.trim();
    const plainTooShort = plainT.length < 40;
    const htmlMuchLarger = htmlT.length > plainT.length * 3 + 200;
    if (!plainTooShort && !htmlMuchLarger) return;

    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const insert = htmlT;
    setJobText((prev) => prev.slice(0, start) + insert + prev.slice(end));
    const caret = start + insert.length;
    requestAnimationFrame(() => {
      ta.selectionStart = caret;
      ta.selectionEnd = caret;
    });
  }

  useEffect(() => {
    if (!toastVisible) return;
    const t = window.setTimeout(() => setToastVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [toastVisible]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRuns([]);

    // 1) Serverseitig strukturieren (Upwork-Feed HTML → Tiles)
    type ParsedJob = {
      source: "upwork_feed" | "text";
      jobText: string;
      title?: string;
      postedOn?: string;
      jobType?: string;
      budget?: string;
      duration?: string;
      contractorTier?: string;
      skills?: string[];
      feedHasMoreToggle?: boolean;
      likelyTruncated?: boolean;
      descriptionCharLength?: number;
      jobTextCharLength?: number;
      wasTrimmed?: boolean;
      jobUrl?: string;
    };

    let parsedJobs: ParsedJob[] = [];
    try {
      const pres = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: jobText }),
      });
      const pdata = (await pres.json()) as {
        error?: string;
        jobs?: ParsedJob[];
      };
      if (!pres.ok || !Array.isArray(pdata.jobs)) {
        throw new Error(
          typeof pdata.error === "string" ? pdata.error : "Parse fehlgeschlagen.",
        );
      }
      parsedJobs = pdata.jobs;
    } catch {
      // Fallback: bisherige Client-Splits (Klartext)
      const rawParts = splitJobPostings(jobText);
      const jobs = rawParts
        .map((p) => normalizeJobText(p))
        .filter((t) => t.length > 0);
      parsedJobs = jobs.map((t) => ({ source: "text" as const, jobText: t }));
    }

    if (parsedJobs.length === 0) {
      setError(
        "Bitte mindestens einen Job-Text einfügen. Wenn du aus dem Feed kopierst: für Volltext Job öffnen (Detailseite) und dort Titel + Beschreibung kopieren.",
      );
      return;
    }

    const initialRuns: JobRun[] = parsedJobs.map((j) => ({
      id: makeRunId(),
      jobText: j.jobText,
      title: j.title,
      postedOn: j.postedOn,
      jobType: j.jobType,
      budget: j.budget,
      duration: j.duration,
      contractorTier: j.contractorTier,
      skills: j.skills,
      feedHasMoreToggle: j.feedHasMoreToggle,
      likelyTruncated: j.likelyTruncated,
      descriptionCharLength: j.descriptionCharLength,
      jobTextCharLength: j.jobTextCharLength,
      wasTrimmed: j.wasTrimmed,
      jobUrl: j.jobUrl,
      source: j.source,
      status: "pending",
    }));
    setRuns(initialRuns);
    setLoading(true);

    try {
      type StartResp = { jobId?: string; error?: string };
      type PollResp = {
        jobId: string;
        status: "queued" | "running" | "done" | "error";
        error?: string;
        jobTextUsed?: string;
        result?: EvaluationResult;
      };

      const pollOnce = async (jobId: string): Promise<PollResp> => {
        const res = await fetch(`/api/evaluate?jobId=${encodeURIComponent(jobId)}`, {
          method: "GET",
        });
        const data = (await res.json()) as PollResp & { error?: string };
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Polling fehlgeschlagen.");
        }
        return data;
      };

      const startAndPollOne = async (i: number) => {
        setRuns((prev) =>
          prev.map((r, j) => (j === i ? { ...r, status: "loading" as const } : r)),
        );

        const startRes = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            async: true,
            jobText: initialRuns[i].jobText,
            meta: {
              source: initialRuns[i].source,
              feedHasMoreToggle: initialRuns[i].feedHasMoreToggle,
              likelyTruncated: initialRuns[i].likelyTruncated,
              descriptionCharLength: initialRuns[i].descriptionCharLength,
              jobTextCharLength: initialRuns[i].jobTextCharLength,
              wasTrimmed: initialRuns[i].wasTrimmed,
              title: initialRuns[i].title,
              jobUrl: initialRuns[i].jobUrl,
              postedOn: initialRuns[i].postedOn,
              jobType: initialRuns[i].jobType,
              budget: initialRuns[i].budget,
              duration: initialRuns[i].duration,
              contractorTier: initialRuns[i].contractorTier,
              skillsCount: initialRuns[i].skills?.length ?? 0,
            },
          }),
        });

        const startData = (await startRes.json()) as StartResp;
        if (!startRes.ok || typeof startData.jobId !== "string") {
          throw new Error(
            typeof startData.error === "string"
              ? startData.error
              : "Konnte Bewertung nicht starten.",
          );
        }
        const jobId = startData.jobId;
        setRuns((prev) =>
          prev.map((r, j) => (j === i ? { ...r, evaluationJobId: jobId } : r)),
        );

        const started = Date.now();
        const maxWaitMs = 120_000;
        const pollIntervalMs = 800;

        while (Date.now() - started < maxWaitMs) {
          const p = await pollOnce(jobId);
          if (p.status === "done" && p.result) {
            setRuns((prev) =>
              prev.map((r, j) =>
                j === i
                  ? {
                      ...r,
                      status: "done" as const,
                      result: p.result,
                      jobText:
                        typeof p.jobTextUsed === "string" && p.jobTextUsed.length > 0
                          ? p.jobTextUsed
                          : r.jobText,
                    }
                  : r,
              ),
            );
            return;
          }
          if (p.status === "error") {
            setRuns((prev) =>
              prev.map((r, j) =>
                j === i
                  ? {
                      ...r,
                      status: "error" as const,
                      error:
                        typeof p.error === "string" && p.error.length > 0
                          ? p.error
                          : "Bewertung fehlgeschlagen.",
                    }
                  : r,
              ),
            );
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        setRuns((prev) =>
          prev.map((r, j) =>
            j === i
              ? {
                  ...r,
                  status: "error" as const,
                  error: "Timeout beim Warten auf die Bewertung. Bitte erneut versuchen.",
                }
              : r,
          ),
        );
      };

      // Run with small parallelism so UI is responsive and API isn't flooded
      const concurrency = 2;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, initialRuns.length) }).map(
        async () => {
          while (cursor < initialRuns.length) {
            const i = cursor++;
            try {
              await startAndPollOne(i);
            } catch (err) {
              setRuns((prev) =>
                prev.map((r, j) =>
                  j === i
                    ? {
                        ...r,
                        status: "error" as const,
                        error:
                          err && typeof err === "object" && "message" in err
                            ? String((err as { message: unknown }).message)
                            : "Bewertung fehlgeschlagen.",
                      }
                    : r,
                ),
              );
            }
          }
        },
      );

      await Promise.all(workers);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
  }

  function handleSaveOne(run: JobRun) {
    if (!run.result || !run.jobText.trim()) return;
    save({ jobSnippet: run.jobText, evaluation: run.result });
    showToast("✓ Gespeichert");
  }

  function handleSaveAll() {
    const done = runs.filter(
      (r): r is JobRun & { result: EvaluationResult } =>
        r.status === "done" && !!r.result,
    );
    if (done.length === 0) return;
    saveMany(
      done.map((r) => ({
        jobSnippet: r.jobText,
        evaluation: r.result,
      })),
    );
    showToast(
      done.length === 1
        ? "✓ Gespeichert"
        : `✓ ${done.length} Jobs gespeichert`,
    );
  }

  const doneCount = runs.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Job bewerten
        </h1>
        <p className="mt-2 text-sm text-muted">
          Du kannst <strong className="text-white/90">alles markieren und
          einfügen</strong> (z. B. Strg+A auf der Job-Seite oder in der
          Suchergebnis-Liste). HTML wird serverseitig reduziert.{" "}
          <strong className="text-white/90">Mehrere Jobs:</strong> entweder
          automatisch getrennt an Zeilen wie{" "}
          <code className="rounded bg-white/10 px-1 text-accent">
            Posted yesterday
          </code>{" "}
          /{" "}
          <code className="rounded bg-white/10 px-1 text-accent">
            Posted 4 hours ago
          </code>{" "}
          (Upwork-Feed), oder manuell mit einer Zeile nur{" "}
          <code className="rounded bg-white/10 px-1 text-accent">---</code>{" "}
          zwischen den Postings (nicht <code className="rounded bg-white/10 px-1 text-accent">___</code>
          : kommt in Kopien oft vor).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="job"
            className="mb-2 block text-sm font-medium text-white"
          >
            Job Posting einfügen
          </label>
          <textarea
            id="job"
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            onPaste={handleJobPaste}
            rows={18}
            className="w-full resize-y rounded-lg border border-white/15 bg-surface p-4 text-sm text-white placeholder:text-white/35 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder={`Job 1 Text hier…\n\n---\n\nJob 2 Text hier…\n\n---\n\nJob 3…`}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? "Bewerte…" : "Jetzt bewerten"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Ergebnisse{" "}
              <span className="text-sm font-normal text-muted">
                ({runs.length} {runs.length === 1 ? "Job" : "Jobs"})
              </span>
            </h2>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={handleSaveAll}
                className="rounded-lg border border-accent/50 bg-transparent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                Alle in Liste speichern
              </button>
            )}
          </div>

          {runs.map((run, index) => (
            <section
              key={run.id}
              className="rounded-xl border border-white/10 bg-surface/40 p-4 sm:p-5"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Job {index + 1}
                  </span>
                  <p className="mt-1 text-sm font-medium leading-snug text-white">
                    {run.title || extractJobHeadline(run.jobText)}
                  </p>
                  {(run.postedOn ||
                    run.jobType ||
                    run.budget ||
                    run.duration ||
                    run.contractorTier) && (
                    <p className="mt-1 text-xs text-muted">
                      {[run.postedOn && `Posted ${run.postedOn}`, run.jobType, run.contractorTier, run.duration, run.budget && `Budget ${run.budget}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {run.likelyTruncated && (
                    <p className="mt-2 text-xs text-amber-200/90">
                      Hinweis: Der Beschreibungstext wirkt gekürzt. Für Volltext
                      bitte den Job öffnen (Detailseite) und dort Titel +
                      Beschreibung kopieren.
                    </p>
                  )}
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none text-sm text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1">
                        Vollständigen Jobtext
                        <span className="text-xs font-normal text-muted">
                          ({run.jobText.length.toLocaleString("de-DE")} Zeichen)
                        </span>
                      </span>
                    </summary>
                    <pre className="mt-3 max-h-[min(70vh,28rem)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/35 p-3 text-xs leading-relaxed text-white/90">
                      {run.jobText}
                    </pre>
                  </details>
                </div>
                {run.status === "done" && run.result && (
                  <button
                    type="button"
                    onClick={() => handleSaveOne(run)}
                    className="shrink-0 rounded-lg border border-accent/50 bg-transparent px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 sm:text-sm"
                  >
                    In Liste speichern
                  </button>
                )}
              </div>

              {run.status === "loading" && <LoadingSkeleton />}

              {run.status === "error" && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                >
                  {run.error ?? "Unbekannter Fehler."}
                </div>
              )}

              {run.status === "done" && run.result && (
                <EvaluationResultCard result={run.result} />
              )}
            </section>
          ))}
        </div>
      )}

      {toastVisible && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-surface px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-accent/40"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
