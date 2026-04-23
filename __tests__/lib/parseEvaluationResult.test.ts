import { describe, it, expect } from "vitest";
import { parseEvaluationResultQuickCash } from "@/lib/parseEvaluationResult";

const validQC = {
  quick_cash_score: 82,
  confidence: 8,
  effort: "3-4h",
  effort_hours: "3-4",
  why: ["Clear scope"],
  questions: ["Any existing tests?"],
  proposal_de: "Guten Tag, ich würde das umsetzen...",
  red_flags: [],
  reasoning: "Klarer Auftrag.",
  viable: true,
  overall_score: 8,
  steps: ["Implement"],
  risks: [],
};

describe("parseEvaluationResultQuickCash", () => {
  it("parses valid Quick Cash result", () => {
    const result = parseEvaluationResultQuickCash(validQC);
    expect(result).not.toBeNull();
    expect(result!.quick_cash_score).toBe(82);
    expect(result!.viable).toBe(true);
  });

  it("returns null for null input", () => {
    expect(parseEvaluationResultQuickCash(null)).toBeNull();
  });

  it("returns null for missing quick_cash_score", () => {
    expect(parseEvaluationResultQuickCash({ ...validQC, quick_cash_score: undefined })).toBeNull();
  });

  it("returns null for score out of range", () => {
    expect(parseEvaluationResultQuickCash({ ...validQC, quick_cash_score: 150 })).toBeNull();
  });

  it("accepts string score and coerces to number", () => {
    const result = parseEvaluationResultQuickCash({ ...validQC, quick_cash_score: "75" });
    expect(result).not.toBeNull();
    expect(result!.quick_cash_score).toBe(75);
  });

  it("defaults missing arrays to empty arrays", () => {
    const result = parseEvaluationResultQuickCash({ ...validQC, why: undefined, red_flags: undefined });
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.why)).toBe(true);
    expect(Array.isArray(result!.red_flags)).toBe(true);
  });
});
