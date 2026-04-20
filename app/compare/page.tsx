"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EvaluationResultAny, EvaluationResultV2, SavedEvaluation } from "@/types";
import { formatEffortForDisplay } from "@/lib/formatEffortDisplay";

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

function titlePreview(s: string): string {
  const t = s.trim();
  return t.length <= 50 ? t || "(Kein Text)" : `${t.slice(0, 50)}...`;
}

function isV2(r: EvaluationResultAny): r is EvaluationResultV2 {
  return typeof (r as EvaluationResultV2).viable_build_20h === "boolean";
}

function RadarChart({ items }: { items: { label: string; values: number[] }[] }) {
  const n = items.length;
  if (n === 0) return null;
  const cx = 100, cy = 100, r = 80;
  const colors = ["#f0924a", "#10b981", "#60a5fa"];
  const count = items[0].values.length;

  const angleStep = (2 * Math.PI) / n;
  const pointAt = (i: number, val: number) => {
    const a = -Math.PI / 2 + i * angleStep;
    const d = (val / 10) * r;
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) };
  };

  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-64 w-64">
      {[2, 4, 6, 8, 10].map((lv) => (
        <polygon key={lv} points={items.map((_, i) => { const p = pointAt(i, lv); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="currentColor" strokeWidth="0.5" className="text-white/10" />
      ))}
      {items.map((_, i) => {
        const p = pointAt(i, 10);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="0.5" className="text-white/10" />;
      })}
      {Array.from({ length: count }).map((_, ci) => (
        <polygon key={ci} points={items.map((item, i) => { const p = pointAt(i, item.values[ci]); return `${p.x},${p.y}`; }).join(" ")} fill={colors[ci]} fillOpacity="0.15" stroke={colors[ci]} strokeWidth="1.5" />
      ))}
      {items.map((item, i) => {
        const p = pointAt(i, 11.5);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-white/70 text-[7px]">{item.label}</text>;
      })}
    </svg>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const [items, setItems] = useState<SavedEvaluation[]>([]);

  useEffect(() => {
    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0) return;
    const all = loadEntries();
    setItems(ids.map((id) => all.find((e) => e.id === id)).filter(Boolean) as SavedEvaluation[]);
  }, [idsParam]);

  if (items.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">Job-Vergleich</h1>
        <p className="mt-2 text-sm text-muted">Bitte mindestens 2 Jobs in der History auswählen und &quot;Vergleichen&quot; klicken.</p>
      </div>
    );
  }

  const radarAxes = [
    { label: "Score", values: items.map((i) => i.evaluation.overall_score) },
    { label: "Scope", values: items.map((i) => isV2(i.evaluation) ? i.evaluation.criteria.scope_clarity : (i.evaluation as { criteria: { clear_requirements: number } }).criteria.clear_requirements) },
    { label: "Complexity", values: items.map((i) => isV2(i.evaluation) ? i.evaluation.criteria.low_integration_ops_complexity : (i.evaluation as { criteria: { no_complex_backend: number } }).criteria.no_complex_backend) },
    { label: "Solo Fit", values: items.map((i) => isV2(i.evaluation) ? i.evaluation.criteria.solo_delivery_fit : 5) },
    { label: "Confidence", values: items.map((i) => isV2(i.evaluation) ? i.evaluation.confidence : 5) },
  ];

  const colors = ["text-accent", "text-emerald-400", "text-blue-400"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">Job-Vergleich</h1>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${i === 0 ? "bg-accent" : i === 1 ? "bg-emerald-400" : "bg-blue-400"}`} />
            <span className="text-sm text-white/80">{titlePreview(item.jobSnippet)}</span>
          </div>
        ))}
      </div>

      {/* Radar */}
      <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
        <RadarChart items={radarAxes} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Metrik</th>
              {items.map((item, i) => (
                <th key={item.id} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${colors[i]}`}>
                  Job {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr>
              <td className="px-4 py-2 text-muted">Score</td>
              {items.map((item) => <td key={item.id} className="px-4 py-2 font-semibold text-white">{item.evaluation.overall_score}/10</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-muted">Viable</td>
              {items.map((item) => <td key={item.id} className="px-4 py-2 text-white">{item.evaluation.viable ? "Ja" : "Nein"}</td>)}
            </tr>
            <tr>
              <td className="px-4 py-2 text-muted">Aufwand</td>
              {items.map((item) => <td key={item.id} className="px-4 py-2 text-white">{formatEffortForDisplay(item.evaluation.effort_hours)}</td>)}
            </tr>
            {items.some((i) => isV2(i.evaluation)) && (
              <>
                <tr>
                  <td className="px-4 py-2 text-muted">Preis</td>
                  {items.map((item) => <td key={item.id} className="px-4 py-2 text-white">{isV2(item.evaluation) ? item.evaluation.price_range : "–"}</td>)}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-muted">Timeline</td>
                  {items.map((item) => <td key={item.id} className="px-4 py-2 text-white">{isV2(item.evaluation) ? `${item.evaluation.timeline_days} Tage` : "–"}</td>)}
                </tr>
                <tr>
                  <td className="px-4 py-2 text-muted">Confidence</td>
                  {items.map((item) => <td key={item.id} className="px-4 py-2 text-white">{isV2(item.evaluation) ? `${item.evaluation.confidence}/10` : "–"}</td>)}
                </tr>
              </>
            )}
            <tr>
              <td className="px-4 py-2 text-muted">Risiken</td>
              {items.map((item) => <td key={item.id} className="px-4 py-2 text-white/80 text-xs">{item.evaluation.risks.length} Risiken</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Risks side by side */}
      <div className={`grid gap-4 ${items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {items.map((item, i) => (
          <div key={item.id} className="rounded-xl border border-white/10 bg-surface/40 p-4">
            <h3 className={`mb-2 text-sm font-semibold ${colors[i]}`}>Job {i + 1} — Risiken</h3>
            <ul className="list-inside list-disc space-y-1 text-xs text-white/80">
              {item.evaluation.risks.map((r, ri) => <li key={ri}>{r}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Lädt…</div>}>
      <CompareContent />
    </Suspense>
  );
}
