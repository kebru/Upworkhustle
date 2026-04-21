import { parseEvaluationResultV2, parseEvaluationResultQuickCash } from "@/lib/parseEvaluationResult";
import {
  MIN_RISKS,
  MIN_NEXT_STEPS,
  MIN_CLARIFYING_QUESTIONS,
  MIN_OFFER_MESSAGE_LENGTH,
  MAX_OFFER_MESSAGE_LENGTH,
  MIN_REASONING_LENGTH,
} from "@/lib/constants";

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
  const cjk = (t.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  if (cjk >= 4) return false;
  const lower = t.toLowerCase();
  let score = 0;
  const words = lower.match(
    /\b(und|oder|nicht|dass|für|mit|ohne|bitte|kann|könnte|soll|muss|aufwand|anforderungen|allerdings|außerdem|beachten|deshalb|deutlich|eigentlich|erfordert|geeignet|grundsätzlich|insgesamt|komplex|machbar|möglich|schwierig|überschaubar|umfangreich|wahrscheinlich|zusätzlich|zunächst|zeitlich|ebenfalls|jedoch)\b/g,
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

export function checkSemanticQuality(
  result: { reasoning: string; risks: string[]; overall_score: number; criteria: { scope_clarity: number; low_integration_ops_complexity: number; solo_delivery_fit: number; ai_coding_fit: number } },
  jobText: string,
): { warnings: string[] } {
  const warnings: string[] = [];
  const jobWords = new Set(
    jobText.toLowerCase().replace(/[^\w\sÄäÖöÜüß]/g, "").split(/\s+/).filter((w) => w.length > 4),
  );
  const reasoningLower = result.reasoning.toLowerCase();
  const sharedWords = Array.from(jobWords).filter((w) => reasoningLower.includes(w));
  if (sharedWords.length < 2) {
    warnings.push("reasoning enthält kaum Bezug zum konkreten Jobtext.");
  }

  const uniqueRisks = new Set(result.risks.map((r) => r.trim().toLowerCase()));
  if (uniqueRisks.size < result.risks.length * 0.7) {
    warnings.push("Risiken enthalten Duplikate oder sind sehr ähnlich.");
  }
  const numberedPattern = result.risks.filter((r) => /^(risiko|risk)\s*\d/i.test(r.trim()));
  if (numberedPattern.length >= 2) {
    warnings.push("Risiken sind generisch nummeriert statt inhaltlich.");
  }

  const { scope_clarity, low_integration_ops_complexity, solo_delivery_fit, ai_coding_fit } = result.criteria;
  const avgCriteria = (scope_clarity + low_integration_ops_complexity + solo_delivery_fit + ai_coding_fit) / 4;
  if (avgCriteria >= 8 && result.overall_score < 5) {
    warnings.push("Inkonsistenz: Alle Kriterien hoch, aber overall_score niedrig.");
  }
  if (avgCriteria <= 3 && result.overall_score > 6) {
    warnings.push("Inkonsistenz: Alle Kriterien niedrig, aber overall_score hoch.");
  }

  return { warnings };
}

export function hasBadPlaceholders(result: {
  effort_hours: string;
  risks: string[];
  steps: string[];
  reasoning: string;
}): boolean {
  const joined = [result.effort_hours, result.reasoning, ...result.risks, ...result.steps]
    .join("\n")
    .toLowerCase();
  return (
    /\bn\/a\b/.test(joined) ||
    /nicht\s+anwendbar/.test(joined) ||
    /\bnicht-anwendbar\b/.test(joined) ||
    /not applicable/.test(joined) ||
    /na -/.test(joined)
  );
}

export function isSchemaGoodEnough(result: {
  risks: string[];
  next_steps: string[];
  clarifying_questions: string[];
  offer_message: string;
  reasoning: string;
}): boolean {
  if (!Array.isArray(result.risks)) return false;
  if (result.risks.length < MIN_RISKS) return false;
  if (!Array.isArray(result.next_steps) || result.next_steps.length < MIN_NEXT_STEPS) return false;
  if (!Array.isArray(result.clarifying_questions) || result.clarifying_questions.length < MIN_CLARIFYING_QUESTIONS) return false;
  if (typeof result.offer_message !== "string" || result.offer_message.trim().length < MIN_OFFER_MESSAGE_LENGTH) return false;
  if (result.offer_message.length > MAX_OFFER_MESSAGE_LENGTH) return false;
  if (typeof result.reasoning !== "string" || result.reasoning.trim().length < MIN_REASONING_LENGTH) return false;
  return true;
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

export function validateResultDetailed(parsed: unknown): {
  ok: true;
  result: NonNullable<ReturnType<typeof parseEvaluationResultV2>>;
} | {
  ok: false;
  errors: string[];
} {
  const result = parseEvaluationResultV2(parsed);
  if (!result) {
    return { ok: false, errors: ["JSON konnte nicht als gültiges Evaluierungs-Schema geparst werden."] };
  }

  const errors: string[] = [];

  if (!Array.isArray(result.risks) || result.risks.length < MIN_RISKS) {
    errors.push(`Zu wenige Risiken (${result.risks?.length ?? 0} statt min. ${MIN_RISKS}).`);
  }
  if (!Array.isArray(result.next_steps) || result.next_steps.length < MIN_NEXT_STEPS) {
    errors.push(`Zu wenige next_steps (${result.next_steps?.length ?? 0} statt min. ${MIN_NEXT_STEPS}).`);
  }
  if (!Array.isArray(result.clarifying_questions) || result.clarifying_questions.length < MIN_CLARIFYING_QUESTIONS) {
    errors.push(`Zu wenige clarifying_questions (${result.clarifying_questions?.length ?? 0} statt min. ${MIN_CLARIFYING_QUESTIONS}).`);
  }
  if (typeof result.offer_message !== "string" || result.offer_message.trim().length < MIN_OFFER_MESSAGE_LENGTH) {
    errors.push(`offer_message zu kurz (${result.offer_message?.trim().length ?? 0} statt min. ${MIN_OFFER_MESSAGE_LENGTH} Zeichen).`);
  }
  if (typeof result.offer_message === "string" && result.offer_message.length > MAX_OFFER_MESSAGE_LENGTH) {
    errors.push(`offer_message zu lang (${result.offer_message.length} statt max. ${MAX_OFFER_MESSAGE_LENGTH} Zeichen).`);
  }
  if (typeof result.reasoning !== "string" || result.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`reasoning zu kurz (${result.reasoning?.trim().length ?? 0} statt min. ${MIN_REASONING_LENGTH} Zeichen).`);
  }
  if (hasBadPlaceholders(result)) {
    errors.push("Enthält Platzhalter wie 'N/A' oder 'nicht anwendbar'.");
  }

  const germanText = [result.reasoning, ...result.steps, ...result.risks].join("\n");
  if (!isLikelyGerman(germanText)) {
    errors.push("Texte sind nicht auf Deutsch verfasst.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, result };
}

export function validateResult(parsed: unknown): ReturnType<typeof parseEvaluationResultV2> {
  const detailed = validateResultDetailed(parsed);
  return detailed.ok ? detailed.result : null;
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
  if (typeof result.proposal_de !== "string" || result.proposal_de.trim().length < 120) {
    errors.push("proposal_de ist zu kurz (min. 120 Zeichen).");
  }
  if (typeof result.reasoning !== "string" || result.reasoning.trim().length < MIN_REASONING_LENGTH) {
    errors.push(`reasoning zu kurz (${result.reasoning?.trim().length ?? 0} statt min. ${MIN_REASONING_LENGTH} Zeichen).`);
  }
  if (hasBadPlaceholders({ effort_hours: result.effort, risks: result.red_flags, steps: result.why, reasoning: result.reasoning })) {
    errors.push("Enthält Platzhalter wie 'N/A' oder 'nicht anwendbar'.");
  }

  const germanText = [result.reasoning, result.proposal_de, ...result.why, ...result.questions, ...result.red_flags].join("\n");
  if (!isLikelyGerman(germanText)) {
    errors.push("Texte sind nicht auf Deutsch verfasst.");
  }

  // Ensure backward-compat fields exist and are reasonable
  if (!Array.isArray(result.risks) || result.risks.length !== result.red_flags.length) {
    // not fatal, but indicates bad transform
    errors.push("Interner Fehler: risks mapping stimmt nicht.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, result };
}

export function validateQuickCashResult(parsed: unknown): ReturnType<typeof parseEvaluationResultQuickCash> {
  const detailed = validateQuickCashResultDetailed(parsed);
  return detailed.ok ? detailed.result : null;
}
