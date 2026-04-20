"use client";

import { useEffect, useState } from "react";

const PHASES = [
  { label: "Wird gesendet…", minMs: 0 },
  { label: "KI analysiert den Job…", minMs: 2000 },
  { label: "Ergebnis wird verarbeitet…", minMs: 8000 },
] as const;

export function LoadingSkeleton() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 400);
    return () => clearInterval(id);
  }, []);

  const phase = [...PHASES].reverse().find((p) => elapsed >= p.minMs) ?? PHASES[0];
  const progressPct = Math.min(90, (elapsed / 15000) * 90);

  return (
    <div
      className="space-y-3 rounded-xl border border-white/10 bg-surface/50 p-6"
      aria-busy
      aria-label="Bewertung wird geladen"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-5 w-5">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        </div>
        <span className="text-sm font-medium text-white/90">{phase.label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent/70 transition-[width] duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
      </div>
    </div>
  );
}
