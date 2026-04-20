import { describe, it, expect } from "vitest";
import {
  stripMarkdownFences,
  isLikelyGerman,
  hasBadPlaceholders,
  isSchemaGoodEnough,
  parseJsonStrict,
  checkSemanticQuality,
  validateResultDetailed,
} from "@/lib/eval-validator";

describe("stripMarkdownFences", () => {
  it("removes code fences", () => {
    expect(stripMarkdownFences("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });

  it("returns clean JSON unchanged", () => {
    expect(stripMarkdownFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("isLikelyGerman", () => {
  it("detects German text with multiple keywords", () => {
    expect(isLikelyGerman("Das ist ein Test und es funktioniert nicht ohne Aufwand und zusätzlich")).toBe(true);
  });

  it("rejects English text", () => {
    expect(isLikelyGerman("This is a test and it works fine for everyone")).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isLikelyGerman("")).toBe(false);
  });

  it("detects umlauts as strong German indicator", () => {
    expect(isLikelyGerman("Änderungen für die Überprüfung")).toBe(true);
  });

  it("detects bigrams", () => {
    expect(isLikelyGerman("Es gibt viele Möglichkeiten, zum Beispiel das hier")).toBe(true);
  });

  it("requires higher threshold than before", () => {
    expect(isLikelyGerman("und oder")).toBe(false);
  });

  it("detects ß and umlauts as strong indicators", () => {
    expect(isLikelyGerman("Außerdem ist das Projekt grundsätzlich machbar und überschaubar")).toBe(true);
  });
});

describe("hasBadPlaceholders", () => {
  it("detects N/A", () => {
    expect(hasBadPlaceholders({
      effort_hours: "N/A",
      risks: [],
      steps: [],
      reasoning: "test",
    })).toBe(true);
  });

  it("detects nicht anwendbar", () => {
    expect(hasBadPlaceholders({
      effort_hours: "4-8",
      risks: ["nicht anwendbar"],
      steps: [],
      reasoning: "test",
    })).toBe(true);
  });

  it("accepts valid content", () => {
    expect(hasBadPlaceholders({
      effort_hours: "4-8",
      risks: ["API could be slow"],
      steps: ["Check docs"],
      reasoning: "Looks feasible",
    })).toBe(false);
  });
});

describe("isSchemaGoodEnough", () => {
  it("rejects too few risks", () => {
    expect(isSchemaGoodEnough({
      risks: ["Risk 1"],
      next_steps: ["1", "2", "3", "4", "5"],
      clarifying_questions: ["Q1", "Q2", "Q3"],
      offer_message: "A".repeat(100),
      reasoning: "A".repeat(30),
    })).toBe(false);
  });

  it("accepts valid schema", () => {
    expect(isSchemaGoodEnough({
      risks: ["R1", "R2", "R3"],
      next_steps: ["S1", "S2", "S3", "S4", "S5"],
      clarifying_questions: ["Q1", "Q2", "Q3"],
      offer_message: "A".repeat(100),
      reasoning: "A".repeat(30),
    })).toBe(true);
  });
});

describe("parseJsonStrict", () => {
  it("parses valid JSON", () => {
    const result = parseJsonStrict('{"key": "value"}');
    expect(result.ok).toBe(true);
  });

  it("fails on invalid JSON", () => {
    const result = parseJsonStrict("{invalid}");
    expect(result.ok).toBe(false);
  });

  it("strips markdown fences before parsing", () => {
    const result = parseJsonStrict('```json\n{"key": "value"}\n```');
    expect(result.ok).toBe(true);
  });
});

describe("checkSemanticQuality", () => {
  const baseResult = {
    reasoning: "Dieser Job erfordert eine Landing Page mit Next.js und Tailwind CSS. Das passt zum Profil.",
    risks: ["Figma-Designs könnten komplex sein", "Stripe braucht Testumgebung", "Responsive Edge-Cases"],
    overall_score: 8,
    criteria: { scope_clarity: 8, low_integration_ops_complexity: 7, solo_delivery_fit: 9, ai_coding_fit: 8 },
  };

  it("returns no warnings for good result", () => {
    const { warnings } = checkSemanticQuality(baseResult, "Build a landing page with Next.js and Tailwind CSS");
    expect(warnings).toHaveLength(0);
  });

  it("warns when reasoning has no job reference", () => {
    const { warnings } = checkSemanticQuality(
      { ...baseResult, reasoning: "Das ist ein guter Job und es passt zum Profil." },
      "Build a complex microservice architecture with Kubernetes",
    );
    expect(warnings.some((w) => w.includes("reasoning"))).toBe(true);
  });

  it("warns on numbered risks", () => {
    const { warnings } = checkSemanticQuality(
      { ...baseResult, risks: ["Risiko 1: etwas", "Risiko 2: etwas anderes", "Risk 3: noch etwas"] },
      "Build a landing page with Next.js",
    );
    expect(warnings.some((w) => w.includes("nummeriert"))).toBe(true);
  });

  it("warns on score inconsistency (high criteria, low overall)", () => {
    const { warnings } = checkSemanticQuality(
      { ...baseResult, overall_score: 3, criteria: { scope_clarity: 9, low_integration_ops_complexity: 9, solo_delivery_fit: 9, ai_coding_fit: 9 } },
      "Build a landing page",
    );
    expect(warnings.some((w) => w.includes("Inkonsistenz"))).toBe(true);
  });
});

describe("validateResultDetailed", () => {
  it("returns errors for null input", () => {
    const result = validateResultDetailed(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("collects multiple errors", () => {
    const result = validateResultDetailed({
      viable_build_20h: true,
      viable_consulting: false,
      confidence: 7,
      effort_hours: "4-8",
      timeline_days: "3-5",
      price_range: "500-800",
      overall_score: 7,
      criteria: { scope_clarity: 8, low_integration_ops_complexity: 7, solo_delivery_fit: 8, ai_coding_fit: 8 },
      risks: ["R1"],
      next_steps: ["S1"],
      clarifying_questions: [],
      offer_message: "Short",
      learning_path: [],
      reasoning: "Kurz",
      steps: ["Step 1"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});
