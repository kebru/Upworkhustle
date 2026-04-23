import { parseEvaluationResultQuickCash } from "@/lib/parseEvaluationResult";
import { MIN_REASONING_LENGTH, MIN_OFFER_MESSAGE_LENGTH } from "@/lib/constants";

export function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    const firstNl = s.indexOf("\n");
    if (firstNl !== -1) s = s.slice(firstNl + 1);
    const endFence = s.lastIndexOf("```");
    if (endFence !== -1) s = s.slice(0, endFence);
  }
  return s.trim();
}

export function isLikelyGerman(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const cjk = (t.match(/[぀-ヿ㐀-䶿一-鿿]/g) ?? []).length;
  if (cjk >= 4) return false;
  const lower = t.toLowerCase();
  let score = 0;
  const words = lower.match(
    /\b(und|oder|nicht|dass|für|mit|ohne|bitte|kann|könnte|soll|muss|wird|werden|wurde|haben|hatte|sein|wäre|wenn|weil|also|aber|doch|noch|schon|sehr|mehr|nur|hier|dort|nach|über|unter|zwischen|durch|gegen|auf|aus|bei|zum|zur|vom|beim|seit|gut|schnell|einfach|klar|direkt|fertig|aufwand|anforderungen|allerdings|außerdem|beachten|deshalb|deutlich|eigentlich|erfordert|geeignet|grundsätzlich|insgesamt|komplex|machbar|möglich|schwierig|überschaubar|umfangreich|wahrscheinlich|zusätzlich|zunächst|zeitlich|ebenfalls|jedoch|bereits|dabei|damit|dafür|darauf|davon|dazu|sodass|sowohl|sowie|zwar|kurz|groß|klein|lang|weit)\b/g,
  ) ?? [];
  score += words.length;
  if (lower.includes("ß")) score += 2;
  if (/ä/.test(lower)) score += 2;
  if (/ö/.test(lower)) score += 2;
  if (/ü/.test(lower)) score += 2;
  const bigrams = (lower.match(/\b(es gibt|zum beispiel|das heißt|in der|auf der|bei der|vor allem|im rahmen)\b/g) ?? []).length;
  score += bigrams * 2;
  return score >= 4;
}

export function parseJsonStrict(
  raw: string,
): { ok: true; parsed: unknown; cleaned: string } | { ok: false; cleaned: string } {
  const cleaned = stripMarkdownFences(raw);
  try {
    return { ok: true, parsed: JSON.parse(cleaned), cleaned };
  } catch {
    return { ok: false, cleaned };
  }
}

function hasBadPlaceholders(texts: string[]): boolean {
  const joined = texts.join("\n").toLowerCase();
  return (
    /\bn\/a\b/.test(joined) ||
    /n\s*\/\s*a/.test(joined) ||
    /nicht\s+anwendbar/.test(joined) ||
    /\bnicht-anwendbar\b/.test(joined) ||
    /not applicable/.test(joined) ||
    /na -/.test(joined) ||
    /\btbd\b/.test(joined) ||
    /\btba\b/.test(joined) ||
    /\b(tk|t\.k\.)\b/.test(joined)
  );
}

export function validateQuickCashResultDetailed(parsed: unknown): {
  ok: true;
  result: NonNullable<ReturnType<typeof parseEvaluationResultQuickCash>>;
} | {
  ok: false;
  errors: string[];
} {
  const result = parseEvaluationResultQuickCash(parsed);
  if (!result) {
    return { ok: false, errors: ["JSON konnte nicht als gültiges Quick-Cash Schema geparst werden."] };
  }

  const errors: string[] = [];

  if (typeof result.quick_cash_score !== "number" || result.quick_cash_score < 0 || result.quick_cash_score > 100) {
    errors.push("quick_cash_score muss 0..100 sein.");
  }
  if (!Array.isArray(result.why) || result.why.length < 1) {
    errors.push("why muss mindestens 1 Punkt enthalten.");
  }
  if (!Array.isArray(result.questions) || result.questions.length < 2) {
    errors.push("questions muss mindestens 2 Fragen enthalten.");
  }
  if (typeof result.proposal_de !== "string" || result.proposal_de.trim().length < MIN_OFFER_MESSAGE_LENGTH) {
    errors.push(`proposal_de ist zu kurz (min. ${MIN_OFFER_MESSAGE_LENGTH} Zeichen).`);
  }
  if (typeof result.reasoning !== "string" || result.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`reasoning zu kurz (min. ${MIN_REASONING_LENGTH} Zeichen).`);
  }
  if (hasBadPlaceholders([result.effort, result.reasoning, result.proposal_de, ...result.why, ...result.red_flags])) {
    errors.push("Enthält Platzhalter wie 'N/A' oder 'nicht anwendbar'.");
  }

  const germanText = [result.reasoning, result.proposal_de, ...result.why, ...result.questions, ...result.red_flags].join("\n");
  if (!isLikelyGerman(germanText)) {
    errors.push("Texte sind nicht auf Deutsch verfasst.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, result };
}

export function validateQuickCashResult(parsed: unknown): ReturnType<typeof parseEvaluationResultQuickCash> {
  const detailed = validateQuickCashResultDetailed(parsed);
  return detailed.ok ? detailed.result : null;
}
