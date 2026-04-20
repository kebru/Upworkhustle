import { describe, it, expect } from "vitest";
import {
  stripMarkdownFences,
  isLikelyGerman,
  hasBadPlaceholders,
  isSchemaGoodEnough,
  parseJsonStrict,
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
  it("detects German text", () => {
    expect(isLikelyGerman("Das ist ein Test und es funktioniert nicht ohne Aufwand")).toBe(true);
  });

  it("rejects English text", () => {
    expect(isLikelyGerman("This is a test and it works")).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isLikelyGerman("")).toBe(false);
  });

  it("detects umlauts as German indicator", () => {
    expect(isLikelyGerman("Änderungen für die Überprüfung")).toBe(true);
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
