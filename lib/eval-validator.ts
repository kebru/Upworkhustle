import { parseEvaluationResultV2 } from "@/lib/parseEvaluationResult";
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
  const hits =
    (lower.match(/\b(und|oder|nicht|dass|für|mit|ohne|bitte|kann|könnte|soll|muss|aufwand|anforderungen)\b/g) ?? [])
      .length + (lower.includes("ß") ? 1 : 0) + (/[äöü]/.test(lower) ? 1 : 0);
  return hits >= 2;
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

export function validateResult(parsed: unknown): ReturnType<typeof parseEvaluationResultV2> {
  const result = parseEvaluationResultV2(parsed);
  if (
    result &&
    isSchemaGoodEnough(result) &&
    !hasBadPlaceholders(result) &&
    isLikelyGerman([result.reasoning, ...result.steps, ...result.risks].join("\n"))
  ) {
    return result;
  }
  return null;
}
