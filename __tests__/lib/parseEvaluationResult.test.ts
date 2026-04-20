import { describe, it, expect } from "vitest";
import { parseEvaluationResult, parseEvaluationResultV2 } from "@/lib/parseEvaluationResult";

describe("parseEvaluationResult (V1)", () => {
  const validV1 = {
    viable: true,
    effort_hours: "4-8",
    overall_score: 7,
    criteria: { clear_requirements: 8, no_complex_backend: 6 },
    risks: ["Risk 1"],
    steps: ["Step 1"],
    reasoning: "Good reasoning here",
  };

  it("parses valid V1 result", () => {
    const result = parseEvaluationResult(validV1);
    expect(result).not.toBeNull();
    expect(result!.viable).toBe(true);
    expect(result!.overall_score).toBe(7);
  });

  it("returns null for null input", () => {
    expect(parseEvaluationResult(null)).toBeNull();
  });

  it("returns null for missing viable", () => {
    expect(parseEvaluationResult({ ...validV1, viable: undefined })).toBeNull();
  });

  it("accepts string scores", () => {
    const result = parseEvaluationResult({ ...validV1, overall_score: "7" });
    expect(result).not.toBeNull();
    expect(result!.overall_score).toBe(7);
  });

  it("accepts German boolean values", () => {
    const result = parseEvaluationResult({ ...validV1, viable: "ja" });
    expect(result).not.toBeNull();
    expect(result!.viable).toBe(true);
  });
});

describe("parseEvaluationResultV2", () => {
  const validV2 = {
    viable_build_20h: true,
    viable_consulting: false,
    confidence: 8,
    effort_hours: "4-8",
    timeline_days: "2-4",
    price_range: "300-600",
    overall_score: 7,
    criteria: {
      scope_clarity: 8,
      low_integration_ops_complexity: 7,
      solo_delivery_fit: 9,
      ai_coding_fit: 8,
    },
    risks: ["Risk 1", "Risk 2", "Risk 3"],
    next_steps: ["Step 1"],
    clarifying_questions: ["Q1"],
    offer_message: "Guten Tag, ich biete...",
    learning_path: ["Learn X"],
    reasoning: "Detailed reasoning",
    steps: ["Step 1"],
    viable: true,
  };

  it("parses valid V2 result", () => {
    const result = parseEvaluationResultV2(validV2);
    expect(result).not.toBeNull();
    expect(result!.viable_build_20h).toBe(true);
    expect(result!.viable_consulting).toBe(false);
    expect(result!.viable).toBe(true);
  });

  it("returns null without required string fields", () => {
    expect(parseEvaluationResultV2({ ...validV2, effort_hours: undefined })).toBeNull();
    expect(parseEvaluationResultV2({ ...validV2, timeline_days: "" })).toBeNull();
    expect(parseEvaluationResultV2({ ...validV2, price_range: "" })).toBeNull();
  });

  it("sets viable from build OR consulting", () => {
    const result = parseEvaluationResultV2({ ...validV2, viable_build_20h: false, viable_consulting: true });
    expect(result).not.toBeNull();
    expect(result!.viable).toBe(true);
  });

  it("defaults ai_coding_fit to 5 when missing (backward compat)", () => {
    const { ai_coding_fit: _, ...criteriaWithout } = validV2.criteria;
    const result = parseEvaluationResultV2({ ...validV2, criteria: criteriaWithout });
    expect(result).not.toBeNull();
    expect(result!.criteria.ai_coding_fit).toBe(5);
  });
});
