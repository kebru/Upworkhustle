/**
 * Anzeige der Aufwandsschätzung: vermeidet „… Stunden Stunden“, wenn das Modell
 * „Stunden“ oder „h“ schon im String hat.
 */
export function formatEffortForDisplay(effortHours: string): string {
  const t = effortHours.trim();
  if (!t) return "—";
  if (/\bStunden?\b/i.test(t) || /\bhours?\b/i.test(t) || /\bh\s*$/i.test(t)) {
    return t;
  }
  return `${t} Stunden`;
}
