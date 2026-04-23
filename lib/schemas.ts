import { z } from "zod";

const score1to10 = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === "number") return Math.round(val);
    const n = parseInt(String(val).trim().replace(",", "."), 10);
    return Number.isNaN(n) ? -1 : Math.round(n);
  })
  .pipe(z.number().min(1).max(10));

const flexString = z.union([z.string(), z.number()])
  .transform((val) => String(val).trim())
  .pipe(z.string().min(1));

const stringArray = z.preprocess((val) => {
  if (val === undefined || val === null) return [];
  if (typeof val === "string") return val.trim() ? [val.trim()] : [];
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== null && item !== undefined)
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter((s) => s.length > 0);
  }
  return [];
}, z.array(z.string()));

// ── Quick-Cash Schema ──

export const evaluationResultQuickCashSchema = z.object({
  reasoning: flexString,
  quick_cash_score: z.union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "number" ? v : parseInt(String(v).trim().replace(",", "."), 10);
      return Number.isFinite(n) ? Math.round(n) : -1;
    })
    .pipe(z.number().min(0).max(100)),
  confidence: score1to10,
  effort: flexString,
  why: stringArray,
  questions: stringArray,
  proposal_de: flexString,
  red_flags: stringArray,
}).transform((val) => ({
  ...val,
  viable: val.quick_cash_score >= 70,
  overall_score: Math.min(10, Math.max(1, Math.round(val.quick_cash_score / 10))),
  effort_hours: val.effort,
  steps: Array.isArray(val.why) ? val.why.slice(0, 8) : [],
  risks: Array.isArray(val.red_flags) ? val.red_flags : [],
}));

// ── API Request Schemas ──

export const parseRequestSchema = z.object({
  rawText: z.string().min(1, "Bitte rawText angeben."),
});

export const evaluateRequestSchema = z.object({
  jobText: z.string().min(1, "Bitte einen Jobtext (jobText) angeben."),
  async: z.boolean().optional().default(false),
  meta: z.record(z.string(), z.unknown()).optional(),
});

// ── Inferred Types ──

export type EvaluationResultQuickCashParsed = z.output<typeof evaluationResultQuickCashSchema>;
