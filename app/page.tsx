"use client";

import { useEffect, useState } from "react";
import { JobForm } from "@/components/JobForm";
import { JobRunCard } from "@/components/JobRunCard";
import type { JobRun } from "@/components/JobRunCard";
import { useEvaluationHistory } from "@/hooks/useEvaluationHistory";
import { normalizeJobText } from "@/lib/normalizeJobInput";
import { splitJobPostings } from "@/lib/splitJobs";
import { parseJobs, startEvaluation, pollEvaluation } from "@/lib/api-client";
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, CONCURRENCY } from "@/lib/constants";
import type { EvaluationResultAny, ParsedJob } from "@/types";

function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Gespeichert");

  const { save, saveMany } = useEvaluationHistory();

  useEffect(() => {
    if (!toastVisible) return;
    const t = window.setTimeout(() => setToastVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [toastVisible]);

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
  }

  async function handleSubmit(jobText: string) {
    setError(null);
    setRuns([]);

    let parsedJobs: ParsedJob[];
    try {
      parsedJobs = await parseJobs(jobText);
    } catch {
      const rawParts = splitJobPostings(jobText);
      const jobs = rawParts
        .map((p) => normalizeJobText(p))
        .filter((t) => t.length > 0);
      parsedJobs = jobs.map((t): ParsedJob => ({ source: "text", jobText: t }));
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
      const startAndPollOne = async (i: number) => {
        setRuns((prev) =>
          prev.map((r, j) => (j === i ? { ...r, status: "loading" as const } : r)),
        );

        const run = initialRuns[i];
        const jobId = await startEvaluation(run.jobText, {
          source: run.source,
          feedHasMoreToggle: run.feedHasMoreToggle,
          likelyTruncated: run.likelyTruncated,
          descriptionCharLength: run.descriptionCharLength,
          jobTextCharLength: run.jobTextCharLength,
          wasTrimmed: run.wasTrimmed,
          title: run.title,
          jobUrl: run.jobUrl,
          postedOn: run.postedOn,
          jobType: run.jobType,
          budget: run.budget,
          duration: run.duration,
          contractorTier: run.contractorTier,
          skillsCount: run.skills?.length ?? 0,
        });

        setRuns((prev) =>
          prev.map((r, j) => (j === i ? { ...r, evaluationJobId: jobId } : r)),
        );

        const started = Date.now();
        while (Date.now() - started < POLL_TIMEOUT_MS) {
          const p = await pollEvaluation(jobId);
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
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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

      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, initialRuns.length) }).map(
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

  function handleSaveOne(run: JobRun) {
    if (!run.result || !run.jobText.trim()) return;
    save({ jobSnippet: run.jobText, evaluation: run.result });
    showToast("Gespeichert");
  }

  function handleSaveAll() {
    const done = runs.filter(
      (r): r is JobRun & { result: EvaluationResultAny } =>
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
        ? "Gespeichert"
        : `${done.length} Jobs gespeichert`,
    );
  }

  const doneCount = runs.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-8">
      <JobForm onSubmit={handleSubmit} loading={loading} />

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
            <JobRunCard
              key={run.id}
              run={run}
              index={index}
              onSave={() => handleSaveOne(run)}
            />
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
