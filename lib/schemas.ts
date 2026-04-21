import { z } from "zod";

const score1to10 = z.union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === "number") return Math.round(val);
    const n = parseInt(String(val).trim().replace(",", "."), 10);
    return Number.isNaN(n) ? -1 : Math.round(n);
  })
  .pipe(z.number().min(1).max(10));

const viableBool = z.union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === "boolean") return val;
    const s = String(val).toLowerCase().trim();
    if (s === "true" || s === "yes" || s === "ja") return true;
    if (s === "false" || s === "no" || s === "nein") return false;
    return undefined;
  })
  .pipe(z.boolean());

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

// ── V1 Schema ──

export const evaluationCriteriaV1Schema = z.object({
  clear_requirements: score1to10,
  no_complex_backend: score1to10,
});

export const evaluationResultV1Schema = z.object({
  viable: viableBool,
  effort_hours: flexString,
  overall_score: score1to10,
  criteria: evaluationCriteriaV1Schema,
  risks: stringArray,
  steps: stringArray,
  reasoning: flexString,
});

// ── V2 Schema ──

export const evaluationCriteriaV2Schema = z.object({
  scope_clarity: score1to10,
  low_integration_ops_complexity: score1to10,
  solo_delivery_fit: score1to10,
  ai_coding_fit: score1to10.optional().default(5),
});

export const evaluationResultV2Schema = z.object({
  viable_build_20h: viableBool,
  viable_consulting: viableBool,
  confidence: score1to10,
  effort_hours: flexString,
  timeline_days: flexString,
  price_range: flexString,
  overall_score: score1to10,
  criteria: evaluationCriteriaV2Schema,
  risks: stringArray,
  next_steps: stringArray,
  clarifying_questions: stringArray,
  offer_message: flexString,
  learning_path: stringArray,
  reasoning: flexString,
  steps: stringArray,
}).transform((val) => ({
  ...val,
  viable: val.viable_build_20h || val.viable_consulting,
}));

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
  // Backward-compat fields for existing UI/history code paths
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
  jobType: z.enum(["Automatisch", "Web Development", "Data & ML", "Design", "Consulting"]).optional(),
  offerTemplate: z.string().max(2000).optional(),
});

// ── Inferred Types ──

export type EvaluationResultV1Parsed = z.output<typeof evaluationResultV1Schema>;
export type EvaluationResultV2Parsed = z.output<typeof evaluationResultV2Schema>;
export type EvaluationResultQuickCashParsed = z.output<typeof evaluationResultQuickCashSchema>;
