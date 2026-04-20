"use client";

import { EvaluationResultCard } from "@/components/EvaluationResultCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { extractJobHeadline } from "@/lib/jobPreview";
import type { EvaluationResultAny } from "@/types";

export type JobRun = {
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
  result?: EvaluationResultAny;
  error?: string;
};

type Props = {
  run: JobRun;
  index: number;
  onSave: () => void;
  onRetry?: () => void;
};

export function JobRunCard({ run, index, onSave, onRetry }: Props) {
  return (
    <section className="rounded-xl border border-white/10 bg-surface/40 p-4 sm:p-5">
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
            onClick={onSave}
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
          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <span>{run.error ?? "Unbekannter Fehler."}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-md border border-red-400/50 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
            >
              Erneut versuchen
            </button>
          )}
        </div>
      )}

      {run.status === "done" && run.result && (
        <EvaluationResultCard result={run.result} />
      )}
    </section>
  );
}
