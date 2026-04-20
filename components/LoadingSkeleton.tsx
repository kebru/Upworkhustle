export function LoadingSkeleton() {
  return (
    <div
      className="animate-pulse space-y-4 rounded-xl border border-white/10 bg-surface/50 p-6"
      aria-busy
      aria-label="Bewertung wird geladen"
    >
      <div className="h-4 w-40 rounded bg-white/10" />
      <div className="flex gap-3">
        <div className="h-8 w-32 rounded-full bg-white/10" />
        <div className="h-8 flex-1 rounded bg-white/10" />
      </div>
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="h-3 w-full rounded-full bg-white/10" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
      </div>
    </div>
  );
}
