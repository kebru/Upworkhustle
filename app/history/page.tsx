"use client";

import { useMemo, useRef, useState } from "react";
import { EvaluationResultCard } from "@/components/EvaluationResultCard";
import { useEvaluationHistory } from "@/hooks/useEvaluationHistory";
import type { SavedEvaluation } from "@/types";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function titlePreview(snippet: string): string {
  const t = snippet.trim();
  if (t.length <= 60) return t || "(Kein Text)";
  return `${t.slice(0, 60)}…`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAsJson(entries: SavedEvaluation[]) {
  downloadFile(JSON.stringify(entries, null, 2), `upwork-evaluations-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

function exportAsCsv(entries: SavedEvaluation[]) {
  const header = "ID,Gespeichert,Viable,Score,Aufwand,Tags,Jobtext (Auszug)\n";
  const rows = entries.map((e) => {
    const snippet = e.jobSnippet.replace(/"/g, '""').slice(0, 200);
    const tags = (e.tags ?? []).join(";");
    return `"${e.id}","${e.savedAt}","${e.evaluation.viable ? "Ja" : "Nein"}","${e.evaluation.overall_score}","${e.evaluation.effort_hours}","${tags}","${snippet}"`;
  });
  downloadFile(header + rows.join("\n"), `upwork-evaluations-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

type SortKey = "date-desc" | "date-asc" | "score-desc" | "score-asc";
type ViableFilter = "all" | "yes" | "no";
type DateFilter = "all" | "7" | "30";

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-accent/60 hover:text-accent">×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && input.trim()) {
            e.preventDefault();
            const v = input.trim().replace(/,/g, "");
            if (v && !tags.includes(v)) onChange([...tags, v]);
            setInput("");
          }
          if (e.key === "Backspace" && !input && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        placeholder="Tag…"
        className="w-16 bg-transparent text-xs text-white outline-none placeholder:text-muted"
      />
    </div>
  );
}

export default function HistoryPage() {
  const { entries, remove, update, toggleStar, removeMany, updateMany, toggleStarMany, hydrated } = useEvaluationHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [viableFilter, setViableFilter] = useState<ViableFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => (e.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const now = Date.now();
    const dateCutoff = dateFilter === "all" ? 0 : now - Number(dateFilter) * 86400000;

    const list = entries.filter((e) => {
      if (starredOnly && !e.starred) return false;
      if (viableFilter === "yes" && !e.evaluation.viable) return false;
      if (viableFilter === "no" && e.evaluation.viable) return false;
      if (dateCutoff && new Date(e.savedAt).getTime() < dateCutoff) return false;
      if (tagFilter && !(e.tags ?? []).includes(tagFilter)) return false;
      if (q) {
        const haystack = `${e.jobSnippet} ${(e.tags ?? []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sort) {
        case "date-asc": return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
        case "score-desc": return b.evaluation.overall_score - a.evaluation.overall_score;
        case "score-asc": return a.evaluation.overall_score - b.evaluation.overall_score;
        default: return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      }
    });
    return list;
  }, [entries, search, sort, viableFilter, dateFilter, starredOnly, tagFilter]);

  if (!hydrated) {
    return <div className="text-sm text-muted" aria-hidden>Lädt…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">Keine Einträge</h1>
        <p className="mt-2 text-sm text-muted">Noch keine Bewertungen gespeichert.</p>
      </div>
    );
  }

  const selectCls = "rounded-md border border-white/15 bg-surface px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gespeicherte Bewertungen</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} von {entries.length} {entries.length === 1 ? "Eintrag" : "Einträgen"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => exportAsJson(filtered)} className="rounded-lg border border-accent/50 bg-transparent px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 sm:text-sm">JSON</button>
          <button type="button" onClick={() => exportAsCsv(filtered)} className="rounded-lg border border-accent/50 bg-transparent px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 sm:text-sm">CSV</button>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <span className="text-sm font-medium text-white">{selectedIds.size} ausgewählt</span>
          <div className="mx-1 h-5 w-px bg-white/15" />
          {selectedIds.size >= 2 && selectedIds.size <= 3 && (
            <a
              href={`/compare?ids=${Array.from(selectedIds).join(",")}`}
              className="rounded-md border border-accent/50 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/10"
            >
              Vergleichen
            </a>
          )}
          <button
            type="button"
            onClick={() => toggleStarMany(Array.from(selectedIds))}
            className="rounded-md border border-yellow-400/40 px-2.5 py-1 text-xs text-yellow-300 transition hover:bg-yellow-400/10"
          >
            ★ Toggle
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBulkTagInput(!showBulkTagInput)}
              className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-muted transition hover:text-white"
            >
              Tag hinzufügen
            </button>
            {showBulkTagInput && (
              <div className="absolute left-0 top-full z-40 mt-1 flex items-center gap-1 rounded-lg border border-white/20 bg-surface p-2 shadow-xl">
                <input
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && bulkTagInput.trim()) {
                      updateMany(Array.from(selectedIds), { tags: [bulkTagInput.trim()] });
                      setBulkTagInput("");
                      setShowBulkTagInput(false);
                    }
                    if (e.key === "Escape") setShowBulkTagInput(false);
                  }}
                  placeholder="Tag…"
                  autoFocus
                  className="w-28 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (bulkTagInput.trim()) {
                      updateMany(Array.from(selectedIds), { tags: [bulkTagInput.trim()] });
                      setBulkTagInput("");
                      setShowBulkTagInput(false);
                    }
                  }}
                  className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-background"
                >
                  OK
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { removeMany(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-500/20"
          >
            {selectedIds.size} löschen
          </button>
          <div className="mx-1 h-5 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setShowBulkTagInput(false); }}
            className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-muted transition hover:text-white"
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-surface/40 p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche…"
          className="w-48 rounded-md border border-white/15 bg-surface px-3 py-1.5 text-xs text-white outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
          <option value="date-desc">Neueste zuerst</option>
          <option value="date-asc">Älteste zuerst</option>
          <option value="score-desc">Score ↓</option>
          <option value="score-asc">Score ↑</option>
        </select>
        <select value={viableFilter} onChange={(e) => setViableFilter(e.target.value as ViableFilter)} className={selectCls}>
          <option value="all">Viable: Alle</option>
          <option value="yes">Viable: Ja</option>
          <option value="no">Viable: Nein</option>
        </select>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className={selectCls}>
          <option value="all">Zeitraum: Alle</option>
          <option value="7">Letzte 7 Tage</option>
          <option value="30">Letzte 30 Tage</option>
        </select>
        <button
          type="button"
          onClick={() => setStarredOnly(!starredOnly)}
          className={`rounded-md border px-2 py-1.5 text-xs transition ${starredOnly ? "border-yellow-400/50 bg-yellow-400/20 text-yellow-300" : "border-white/15 text-muted hover:text-white"}`}
        >
          ★ Favoriten
        </button>
        {allTags.length > 0 && (
          <select value={tagFilter ?? ""} onChange={(e) => setTagFilter(e.target.value || null)} className={selectCls}>
            <option value="">Tag: Alle</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <ul className="space-y-3">
        {filtered.map((item) => {
          const expanded = expandedId === item.id;
          const isSelected = selectedIds.has(item.id);
          return (
            <li key={item.id} className={`overflow-hidden rounded-xl border bg-surface/60 ${isSelected ? "border-accent/50" : "border-white/10"}`}>
              <div className="flex items-stretch gap-2 px-2 py-2 sm:px-4 sm:py-3">
                {/* Selection checkbox */}
                <label className="flex shrink-0 cursor-pointer items-center self-center px-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className="h-3.5 w-3.5 rounded border-white/30 accent-accent"
                  />
                </label>

                {/* Star */}
                <button
                  type="button"
                  onClick={() => toggleStar(item.id)}
                  className={`shrink-0 self-center text-lg transition ${item.starred ? "text-yellow-400" : "text-white/20 hover:text-yellow-400/60"}`}
                >
                  ★
                </button>

                {/* Main content button */}
                <button
                  type="button"
                  onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{titlePreview(item.jobSnippet)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDate(item.savedAt)}
                      {(item.tags ?? []).length > 0 && (
                        <span className="ml-2">
                          {(item.tags ?? []).map((t) => (
                            <span key={t} className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">{t}</span>
                          ))}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${item.evaluation.viable ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40" : "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"}`}>
                      {item.evaluation.viable ? "Ja" : "Nein"}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-accent">{item.evaluation.overall_score}/10</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { remove(item.id); if (expandedId === item.id) setExpandedId(null); }}
                  className="shrink-0 self-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-500/20 sm:text-sm"
                >
                  Löschen
                </button>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-white/10 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</span>
                    <TagInput tags={item.tags ?? []} onChange={(tags) => update(item.id, { tags })} />
                  </div>
                  <div>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Jobtext</h2>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-white/90">{item.jobSnippet}</pre>
                  </div>
                  <EvaluationResultCard result={item.evaluation} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">Keine Einträge für die aktuelle Filterung.</p>
      )}
    </div>
  );
}
