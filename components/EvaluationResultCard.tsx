"use client";

import { useState } from "react";
import type { EvaluationResult, EvaluationResultAny, EvaluationResultQuickCash, EvaluationResultV2 } from "@/types";
import { formatEffortForDisplay } from "@/lib/formatEffortDisplay";
import { getOverallScoreLabel } from "@/lib/scoreLabel";

function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = score <= 3 ? "#ef4444" : score <= 6 ? "#f59e0b" : "#10b981";
  return (
    <div className="relative inline-flex h-20 w-20 items-center justify-center">
      <svg className="-rotate-90" width="72" height="72" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-white/10" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
      </svg>
      <span className="absolute text-lg font-bold text-white">{score}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="ml-2 inline-flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
    >
      {copied ? "✓ Kopiert" : "Kopieren"}
    </button>
  );
}

function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center gap-2 font-medium text-white">
        <span className={`inline-block text-xs transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {title}
      </button>
      {open && children}
    </div>
  );
}

type Props = {
  result: EvaluationResultAny;
};

export function EvaluationResultCard({ result }: Props) {
  const isV2 = (r: EvaluationResultAny): r is EvaluationResultV2 =>
    typeof (r as { viable_build_20h?: unknown }).viable_build_20h === "boolean" &&
    typeof (r as { viable_consulting?: unknown }).viable_consulting === "boolean" &&
    typeof (r as { offer_message?: unknown }).offer_message === "string";

  const isQuick = (r: EvaluationResultAny): r is EvaluationResultQuickCash =>
    typeof (r as { quick_cash_score?: unknown }).quick_cash_score === "number" &&
    typeof (r as { proposal_de?: unknown }).proposal_de === "string";

  const v2 = isV2(result) ? result : null;
  const quick = isQuick(result) ? result : null;
  const v1: EvaluationResult | null = v2 || quick ? null : (result as EvaluationResult);

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
          {quick && (
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/85 ring-1 ring-white/15">
              Modus: Quick Cash · Score: {quick.quick_cash_score}/100
            </span>
          )}
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
        <div className="mb-4 flex items-center gap-4">
          <ScoreRing score={result.overall_score} />
          <div>
            <span className="text-2xl font-bold text-accent">
              {result.overall_score}/10
            </span>
            <p className="text-sm text-white/80">
              {getOverallScoreLabel(result.overall_score)}
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {v2 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted">AI-Coding Fit</span>
              <span className="font-medium tabular-nums text-white">
                {v2.criteria.ai_coding_fit}/10
              </span>
            </div>
          )}
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
          {quick && Array.isArray(quick.questions) && quick.questions.length > 0 && (
            <CollapsibleSection title="Rückfragen" defaultOpen={result.overall_score < 7}>
              <ul className="list-inside list-disc space-y-1 text-white/85">
                {quick.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
          <CollapsibleSection title="Risiken" defaultOpen={result.overall_score < 7}>
            <ul className="list-inside list-disc space-y-1 text-white/85">
              {result.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </CollapsibleSection>
          <CollapsibleSection title="Nächste Schritte" defaultOpen={result.overall_score < 7}>
            <ul className="list-inside list-disc space-y-1 text-white/85">
              {(v2 ? v2.next_steps : v1?.steps ?? result.steps ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CollapsibleSection>
          {v2 && Array.isArray(v2.clarifying_questions) && (
            <CollapsibleSection title="Rückfragen" defaultOpen={result.overall_score < 7}>
              <ul className="list-inside list-disc space-y-1 text-white/85">
                {v2.clarifying_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
          {quick && typeof quick.proposal_de === "string" && (
            <div>
              <div className="mb-2 flex items-center">
                <h3 className="font-medium text-white">Proposal (DE)</h3>
                <CopyButton text={quick.proposal_de} />
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-white/90">
                {quick.proposal_de}
              </pre>
            </div>
          )}
          {v2 && typeof v2.offer_message === "string" && (
            <div>
              <div className="mb-2 flex items-center">
                <h3 className="font-medium text-white">Angebotstext (Upwork)</h3>
                <CopyButton text={v2.offer_message} />
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-white/90">
                {v2.offer_message}
              </pre>
            </div>
          )}
          {v2 && Array.isArray(v2.learning_path) && v2.learning_path.length > 0 && (
            <CollapsibleSection title="Lernpfad" defaultOpen={false}>
              <ul className="list-inside list-disc space-y-1 text-white/85">
                {v2.learning_path.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
          <CollapsibleSection title="Begründung" defaultOpen={false}>
            <p className="text-white/85">{result.reasoning}</p>
          </CollapsibleSection>
        </div>
      </section>
    </div>
  );
}
