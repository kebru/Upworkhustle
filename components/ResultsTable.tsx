"use client";

import { useState, useEffect, useCallback } from "react";
import type { SavedEvaluation, EvaluationResultQuickCash } from "@/types";
import { fetchEvaluations, deleteEvaluation, deleteManyEvaluations, generateCoverLetter } from "@/lib/api-client";
import CoverLetterPanel from "./CoverLetterPanel";

const SCORE_FILTERS = [
  { label: "Alle", value: undefined },
  { label: "70+", value: 70 },
  { label: "80+", value: 80 },
  { label: "90+", value: 90 },
] as const;

function scoreBadgeBg(score: number): string {
  if (score >= 80) return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
  if (score >= 70) return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300";
  if (score >= 50) return "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300";
  return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "gerade eben";
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  if (d === 1) return "gestern";
  if (d < 7) return `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

interface JobRowProps {
  entry: SavedEvaluation;
  selected: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function JobRow({ entry, selected, onToggle, onDelete }: JobRowProps) {
  const r = entry.evaluation as EvaluationResultQuickCash;
  const [expanded, setExpanded] = useState(false);
  const [coverText, setCoverText] = useState("");
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [tone, setTone] = useState<"direkt" | "freundlich" | "professionell">("direkt");

  async function handleGenerate() {
    setCoverLoading(true);
    setCoverError(undefined);
    try {
      const text = await generateCoverLetter(entry.id, {
        hourlyRate: hourlyRate || undefined,
        tone,
      });
      setCoverText(text);
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setCoverLoading(false);
    }
  }

  function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    onDelete(entry.id);
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle(entry.id); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 mt-1.5 flex-shrink-0 accent-emerald-600 cursor-pointer"
        />
        {/* Score badge */}
        <div className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[52px] font-bold text-lg ${scoreBadgeBg(r.quick_cash_score)}`}>
          {r.quick_cash_score}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {entry.title ?? "Kein Titel"}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {r.effort && <span>⏱ {r.effort}</span>}
                {entry.budget && <span>💰 {entry.budget}</span>}
                {entry.jobUrl && (
                  <a
                    href={entry.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-500 hover:underline"
                  >
                    Upwork ↗
                  </a>
                )}
                <span className="text-gray-400">{relativeDate(entry.savedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  confirming
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                }`}
                title="Löschen"
                onBlur={() => setConfirming(false)}
              >
                {confirming ? "Sicher?" : "✕"}
              </button>
            </div>
          </div>
        </div>

        <span className={`text-xs text-gray-400 flex-shrink-0 mt-1 ${expanded ? "rotate-180" : ""} transition-transform`}>▼</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {r.reasoning && (
            <p className="text-sm text-gray-600 dark:text-gray-400 italic">{r.reasoning}</p>
          )}

          {r.why && r.why.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Warum Quick Cash</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                {r.why.map((w, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-500">✓</span>{w}</li>)}
              </ul>
            </div>
          )}

          {r.red_flags && r.red_flags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Red Flags</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                {r.red_flags.map((f, i) => <li key={i} className="flex gap-1.5"><span className="text-red-400">⚠</span>{f}</li>)}
              </ul>
            </div>
          )}

          {r.questions && r.questions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Offene Fragen</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                {r.questions.map((q, i) => <li key={i} className="flex gap-1.5"><span className="text-blue-400">?</span>{q}</li>)}
              </ul>
            </div>
          )}

          {!coverText && !coverLoading && (
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="text"
                placeholder="Stundensatz (z.B. 45€/h)"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-sm px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                onClick={(e) => e.stopPropagation()}
                className="text-sm px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="direkt">Direkt</option>
                <option value="freundlich">Freundlich</option>
                <option value="professionell">Professionell</option>
              </select>
            </div>
          )}
          <CoverLetterPanel
            text={coverText}
            loading={coverLoading}
            error={coverError}
            onGenerate={handleGenerate}
          />
        </div>
      )}
    </div>
  );
}

export default function ResultsTable() {
  const [entries, setEntries] = useState<SavedEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState<number | undefined>(70);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvaluations({ minScore, search: debouncedSearch || undefined });
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [minScore, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  function handleToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    deleteEvaluation(id).catch(() => load());
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    setEntries((prev) => prev.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    try {
      await deleteManyEvaluations(ids);
    } catch {
      load();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {SCORE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setMinScore(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                minScore === f.value
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          onClick={load}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          title="Aktualisieren"
        >
          ↻
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex justify-center py-12 text-gray-400">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-8 text-red-500 text-sm">{error}</div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <p className="text-2xl mb-2">📭</p>
          <p>Keine Bewertungen gefunden.</p>
          {minScore !== undefined && (
            <button onClick={() => setMinScore(undefined)} className="mt-2 text-emerald-500 hover:underline text-xs">
              Filter entfernen
            </button>
          )}
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{entries.length} Ergebnis{entries.length !== 1 ? "se" : ""}</p>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{selected.size} ausgewählt</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="text-xs px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  {bulkDeleting ? "Löschen…" : "Löschen"}
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Abwählen
                </button>
              </div>
            )}
          </div>
          {entries.map((entry) => (
            <JobRow
              key={entry.id}
              entry={entry}
              selected={selected.has(entry.id)}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
