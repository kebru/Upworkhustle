/** Kurzes deutsches Label für den Gesamt-Score (1–10). */
export function getOverallScoreLabel(score: number): string {
  const s = Math.round(score);
  if (s >= 9) return "Perfekter Sidehustle-Job";
  if (s >= 7) return "Gut geeignet";
  if (s >= 5) return "Grenzwertig";
  if (s >= 3) return "Zu viele Risiken";
  return "Nicht geeignet";
}
