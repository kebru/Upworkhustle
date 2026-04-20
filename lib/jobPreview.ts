/**
 * Eine Zeile „Titel“ aus Job-Klartext (Feed-Snippet), ohne Nav-Noise.
 */
export function extractJobHeadline(text: string, maxLen = 140): string {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const skip = (line: string) => {
    if (/^skip to content$/i.test(line)) return true;
    if (/^slide\s+\d+$/i.test(line)) return true;
    if (/^posted\s+(yesterday|today|\d+)/i.test(line)) return true;
    if (/^hourly:/i.test(line)) return true;
    if (/^fixed[- ]price/i.test(line)) return true;
    if (/^moreabout\s+"/i.test(line)) return true;
    if (line.length < 6) return true;
    return false;
  };

  for (const line of lines) {
    if (skip(line)) continue;
    if (line.length <= maxLen) return line;
    return `${line.slice(0, maxLen - 1)}…`;
  }

  const flat = text.trim().replace(/\s+/g, " ");
  if (!flat) return "(Kein Text)";
  return flat.length <= maxLen ? flat : `${flat.slice(0, maxLen - 1)}…`;
}
