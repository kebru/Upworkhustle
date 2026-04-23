"use client";

import { useState } from "react";
import type { EvaluationResultQuickCash } from "@/types";

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
  result: EvaluationResultQuickCash;
};

export function EvaluationResultCard({ result }: Props) {
  const scoreColor =
    result.quick_cash_score >= 80
      ? "text-emerald-400"
      : result.quick_cash_score >= 70
      ? "text-yellow-400"
      : "text-orange-400";

  return (
    <div className="space-y-5 rounded-xl border border-white/10 bg-surface/80 p-5 shadow-lg">
      <section className="flex flex-wrap items-center gap-3">
        <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>
          {result.quick_cash_score}
          <span className="text-sm font-normal text-white/50">/100</span>
        </span>
        <span className="text-sm text-white/80">⏱ {result.effort}</span>
        {result.confidence !== undefined && (
          <span className="text-sm text-white/60">Confidence: {result.confidence}/10</span>
        )}
      </section>

      {result.reasoning && (
        <section>
          <p className="text-sm leading-relaxed text-white/85">{result.reasoning}</p>
        </section>
      )}

      {result.why && result.why.length > 0 && (
        <CollapsibleSection title="Warum geeignet" defaultOpen>
          <ul className="list-inside list-disc space-y-1 text-sm text-white/85">
            {result.why.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </CollapsibleSection>
      )}

      {result.red_flags && result.red_flags.length > 0 && (
        <CollapsibleSection title="Red Flags" defaultOpen={result.quick_cash_score < 70}>
          <ul className="list-inside list-disc space-y-1 text-sm text-red-300/90">
            {result.red_flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </CollapsibleSection>
      )}

      {result.questions && result.questions.length > 0 && (
        <CollapsibleSection title="Offene Fragen" defaultOpen={false}>
          <ul className="list-inside list-disc space-y-1 text-sm text-white/85">
            {result.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </CollapsibleSection>
      )}

      {result.proposal_de && (
        <div>
          <div className="mb-2 flex items-center">
            <h3 className="font-medium text-white text-sm">Proposal (DE)</h3>
            <CopyButton text={result.proposal_de} />
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/90">
            {result.proposal_de}
          </pre>
        </div>
      )}
    </div>
  );
}
