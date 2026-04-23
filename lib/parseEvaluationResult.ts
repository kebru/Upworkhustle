import type { EvaluationResultQuickCash } from "@/types";
import { evaluationResultQuickCashSchema } from "@/lib/schemas";

export function parseEvaluationResultQuickCash(raw: unknown): EvaluationResultQuickCash | null {
  const result = evaluationResultQuickCashSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data as EvaluationResultQuickCash;
}
