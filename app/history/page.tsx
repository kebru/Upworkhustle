"use client";

import { useState } from "react";
import { EvaluationResultCard } from "@/components/EvaluationResultCard";
import { useEvaluationHistory } from "@/hooks/useEvaluationHistory";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function titlePreview(snippet: string): string {
  const t = snippet.trim();
  if (t.length <= 60) return t || "(Kein Text)";
  return `${t.slice(0, 60)}…`;
}

export default function HistoryPage() {
  const { entries, remove, hydrated } = useEvaluationHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <div className="text-sm text-muted" aria-hidden>
        Lädt…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">Keine Einträge</h1>
        <p className="mt-2 text-sm text-muted">
          Noch keine Bewertungen gespeichert. Auf der Startseite eine Bewertung
          speichern, um sie hier zu sehen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Gespeicherte Bewertungen
        </h1>
        <p className="mt-2 text-sm text-muted">
          {entries.length}{" "}
          {entries.length === 1 ? "Eintrag" : "Einträge"} lokal in diesem
          Browser.
        </p>
      </div>

      <ul className="space-y-3">
        {entries.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-surface/60"
            >
              <div className="flex items-stretch gap-2 px-2 py-2 sm:px-4 sm:py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((id) => (id === item.id ? null : item.id))
                  }
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">
                      {titlePreview(item.jobSnippet)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Gespeichert: {formatDate(item.savedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.evaluation.viable
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                          : "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                      }`}
                    >
                      {item.evaluation.viable ? "Ja" : "Nein"}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-accent">
                      {item.evaluation.overall_score}/10
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    remove(item.id);
                    if (expandedId === item.id) setExpandedId(null);
                  }}
                  className="shrink-0 self-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-500/20 sm:text-sm"
                >
                  Löschen
                </button>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-white/10 px-4 py-4">
                  <div>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Jobtext
                    </h2>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-white/90">
                      {item.jobSnippet}
                    </pre>
                  </div>
                  <EvaluationResultCard result={item.evaluation} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
