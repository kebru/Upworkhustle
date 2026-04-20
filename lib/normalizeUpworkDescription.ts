const SECTION_CUT = /(^(#|##|###)\s*)?(TO APPLY|HOW TO APPLY|SCREENING QUESTIONS?)\b/i;

function decodeEntitiesBasic(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    });
}

function stripMarkdownEmphasis(line: string): string {
  // Keep content, remove heavy formatting.
  return line
    .replace(/^\s{0,3}#{1,6}\s+/g, "") // headings
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function normalizeBullets(line: string): string {
  // Normalize various bullet styles to "- "
  const t = line.trim();
  if (/^[-*•]\s+/.test(t)) return `- ${t.replace(/^[-*•]\s+/, "")}`;
  return line;
}

function trimSections(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (SECTION_CUT.test(line.trim())) break;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Ziel: feed-Description in stabilem Klartext, ohne unnötige Redundanz/Formatierung,
 * aber ohne wichtige Anforderungen zu verlieren.
 */
export function normalizeUpworkDescription(raw: string): string {
  let s = raw.replace(/\u00a0/g, " ");
  s = decodeEntitiesBasic(s);
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = trimSections(s);

  const lines = s.split("\n").map((l) => {
    let x = l;
    x = stripMarkdownEmphasis(x);
    x = normalizeBullets(x);
    return x.trimEnd();
  });

  s = lines.join("\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

