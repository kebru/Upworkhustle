import type { EvaluationResult, EvaluationResultV2 } from "@/types";
import { evaluationResultV1Schema, evaluationResultV2Schema } from "@/lib/schemas";

export function parseEvaluationResult(raw: unknown): EvaluationResult | null {
  const result = evaluationResultV1Schema.safeParse(raw);
  if (!result.success) return null;
  return result.data as EvaluationResult;
}

export function parseEvaluationResultV2(raw: unknown): EvaluationResultV2 | null {
  const result = evaluationResultV2Schema.safeParse(raw);
  if (!result.success) return null;
  return result.data as EvaluationResultV2;
}
