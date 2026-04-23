"use client";

interface BatchProgressProps {
  total: number;
  done: number;
  skipped: number;
  errors: number;
}

export default function BatchProgress({ total, done, skipped, errors }: BatchProgressProps) {
  const evaluated = done + errors;
  const pct = total > 0 ? Math.round((evaluated / total) * 100) : 0;
  const remaining = total - evaluated - skipped;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>
          <span className="font-semibold text-gray-900 dark:text-white">{done}</span> bewertet
          {skipped > 0 && <> · <span className="text-yellow-600">{skipped} übersprungen</span></>}
          {errors > 0 && <> · <span className="text-red-500">{errors} Fehler</span></>}
          {remaining > 0 && <> · <span className="text-gray-400">{remaining} ausstehend</span></>}
        </span>
        <span className="font-mono text-xs">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right">
        {evaluated} / {total} Jobs verarbeitet
      </p>
    </div>
  );
}
