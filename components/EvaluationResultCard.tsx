"use client";

import type { EvaluationResult, EvaluationResultAny, EvaluationResultV2 } from "@/types";
import { formatEffortForDisplay } from "@/lib/formatEffortDisplay";
import { getOverallScoreLabel } from "@/lib/scoreLabel";

type Props = {
  result: EvaluationResultAny;
};

export function EvaluationResultCard({ result }: Props) {
  const pct = Math.min(100, Math.max(0, (result.overall_score / 10) * 100));
  const isV2 = (r: EvaluationResultAny): r is EvaluationResultV2 =>
    typeof (r as { viable_build_20h?: unknown }).viable_build_20h === "boolean" &&
    typeof (r as { viable_consulting?: unknown }).viable_consulting === "boolean" &&
    typeof (r as { offer_message?: unknown }).offer_message === "string";

  const v2 = isV2(result) ? result : null;
  const v1: EvaluationResult | null = v2 ? null : (result as EvaluationResult);

  return (
    <div className="space-y-6 rounded-xl border border-white/10 bg-surface/80 p-6 shadow-lg">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Schnellentscheidung
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              result.viable
                ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                : "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
            }`}
          >
            Cursor-lösbar? {result.viable ? "Ja" : "Nein"}
          </span>
          {v2 && (
            <>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                  v2.viable_build_20h
                    ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "bg-white/10 text-white/80 ring-1 ring-white/15"
                }`}
              >
                Build ≤20h: {v2.viable_build_20h ? "Ja" : "Nein"}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                  v2.viable_consulting
                    ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "bg-white/10 text-white/80 ring-1 ring-white/15"
                }`}
              >
                Consulting-Setup: {v2.viable_consulting ? "Ja" : "Nein"}
              </span>
              {typeof v2.confidence === "number" && (
                <span className="text-sm text-white/90">
                  Confidence: {v2.confidence}/10
                </span>
              )}
            </>
          )}
          <span className="text-sm text-white/90">
            Aufwandsschätzung: ca. {formatEffortForDisplay(result.effort_hours)}
          </span>
          {v2 && (
            <span className="text-sm text-white/90">
              Preis: {v2.price_range} · Timeline (Tage): {v2.timeline_days}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Score
        </h2>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold text-accent">
            {result.overall_score}/10
          </span>
          <span className="text-sm text-white/80">
            {getOverallScoreLabel(result.overall_score)}
          </span>
        </div>
        <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted">Klare Anforderungen</span>
            <span className="font-medium tabular-nums text-white">
              {v2 ? v2.criteria.scope_clarity : v1?.criteria.clear_requirements}/10
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">Kein komplexes Backend</span>
            <span className="font-medium tabular-nums text-white">
              {v2
                ? v2.criteria.low_integration_ops_complexity
                : v1?.criteria.no_complex_backend}
              /10
            </span>
          </div>
          {v2 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted">Solo-Delivery Fit</span>
              <span className="font-medium tabular-nums text-white">
                {v2.criteria.solo_delivery_fit}/10
              </span>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Detaillierter Report
        </h2>
        <div className="space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="mb-2 font-medium text-white">Risiken</h3>
            <ul className="list-inside list-disc space-y-1 text-white/85">
              {result.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-medium text-white">Nächste Schritte</h3>
            <ul className="list-inside list-disc space-y-1 text-white/85">
              {(v2 ? v2.next_steps : v1?.steps ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          {v2 && Array.isArray(v2.clarifying_questions) && (
            <div>
              <h3 className="mb-2 font-medium text-white">Rückfragen</h3>
              <ul className="list-inside list-disc space-y-1 text-white/85">
                {v2.clarifying_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {v2 && typeof v2.offer_message === "string" && (
            <div>
              <h3 className="mb-2 font-medium text-white">Angebotstext (Upwork)</h3>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-white/90">
                {v2.offer_message}
              </pre>
            </div>
          )}
          {v2 && Array.isArray(v2.learning_path) && v2.learning_path.length > 0 && (
            <div>
              <h3 className="mb-2 font-medium text-white">Lernpfad</h3>
              <ul className="list-inside list-disc space-y-1 text-white/85">
                {v2.learning_path.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 font-medium text-white">Begründung</h3>
            <p className="text-white/85">{result.reasoning}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
