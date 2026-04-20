"use client";

import { useEffect, useMemo, useState } from "react";
import type { SavedEvaluation } from "@/types";

const STORAGE_KEY = "upwork_evaluations_v2";

function loadEntries(): SavedEvaluation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedEvaluation[]) : [];
  } catch {
    return [];
  }
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 120 }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] text-muted">{d.value || ""}</span>
          <div className="w-full rounded-t" style={{ height: `${(d.value / max) * 100}%`, backgroundColor: color, minHeight: d.value > 0 ? 4 : 0 }} />
          <span className="text-[9px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  let cumulative = 0;
  const r = 40, cx = 50, cy = 50;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28">
        {slices.filter((s) => s.value > 0).map((slice) => {
          const start = cumulative / total;
          cumulative += slice.value;
          const end = cumulative / total;
          const startAngle = start * 2 * Math.PI - Math.PI / 2;
          const endAngle = end * 2 * Math.PI - Math.PI / 2;
          const largeArc = end - start > 0.5 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${cx + r * Math.cos(startAngle)} ${cy + r * Math.sin(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${cx + r * Math.cos(endAngle)} ${cy + r * Math.sin(endAngle)} Z`;
          return <path key={slice.label} d={d} fill={slice.color} />;
        })}
      </svg>
      <div className="space-y-1">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-white/80">{s.label}: {s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [entries, setEntries] = useState<SavedEvaluation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(loadEntries());
    setHydrated(true);
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;

    const scores = entries.map((e) => e.evaluation.overall_score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const viableCount = entries.filter((e) => e.evaluation.viable).length;
    const notViable = entries.length - viableCount;

    // Score distribution
    const scoreDist = Array.from({ length: 10 }, (_, i) => ({
      label: `${i + 1}`,
      value: scores.filter((s) => Math.round(s) === i + 1).length,
    }));

    // Jobs per day (last 14 days)
    const now = Date.now();
    const dayMs = 86400000;
    const dailyCounts = Array.from({ length: 14 }, (_, i) => {
      const dayStart = now - (13 - i) * dayMs;
      const dayEnd = dayStart + dayMs;
      const label = new Date(dayStart).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
      const value = entries.filter((e) => {
        const t = new Date(e.savedAt).getTime();
        return t >= dayStart && t < dayEnd;
      }).length;
      return { label, value };
    });

    // Top risks
    const riskMap = new Map<string, number>();
    entries.forEach((e) => {
      e.evaluation.risks.forEach((r) => {
        const key = r.length > 50 ? r.slice(0, 50) + "…" : r;
        riskMap.set(key, (riskMap.get(key) ?? 0) + 1);
      });
    });
    const topRisks = Array.from(riskMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Tags
    const tagMap = new Map<string, number>();
    entries.forEach((e) => (e.tags ?? []).forEach((t) => tagMap.set(t, (tagMap.get(t) ?? 0) + 1)));
    const topTags = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return { avgScore, viableCount, notViable, scoreDist, dailyCounts, topRisks, topTags };
  }, [entries]);

  if (!hydrated) return <div className="text-sm text-muted">Lädt…</div>;

  if (!stats) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">Statistiken</h1>
        <p className="mt-2 text-sm text-muted">Noch keine Daten. Speichere Bewertungen um Statistiken zu sehen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">Statistiken</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Jobs gesamt</p>
          <p className="mt-1 text-2xl font-bold text-white">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Ø Score</p>
          <p className="mt-1 text-2xl font-bold text-accent">{stats.avgScore.toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Viable</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{stats.viableCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Nicht Viable</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{stats.notViable}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Score-Verteilung</h2>
          <BarChart data={stats.scoreDist} color="#f0924a" />
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Viability</h2>
          <PieChart slices={[
            { label: "Viable", value: stats.viableCount, color: "#10b981" },
            { label: "Nicht Viable", value: stats.notViable, color: "#ef4444" },
          ]} />
        </div>
      </div>

      {/* Jobs per day */}
      <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Jobs pro Tag (letzte 14 Tage)</h2>
        <BarChart data={stats.dailyCounts} color="#60a5fa" />
      </div>

      {/* Top Risks */}
      {stats.topRisks.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Häufigste Risiken</h2>
          <ul className="space-y-2 text-sm">
            {stats.topRisks.map(([risk, count]) => (
              <li key={risk} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-white/80">{risk}</span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted">{count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Tags */}
      {stats.topTags.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(([tag, count]) => (
              <span key={tag} className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">
                {tag} ({count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
