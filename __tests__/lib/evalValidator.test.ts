import { describe, it, expect } from "vitest";
import {
  stripMarkdownFences,
  isLikelyGerman,
  parseJsonStrict,
  validateQuickCashResult,
  validateQuickCashResultDetailed,
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

const validQC = {
  quick_cash_score: 82,
  confidence: 8,
  effort: "3-4h",
  effort_hours: "3-4",
  why: ["TypeScript-Aufgabe mit klarem Scope", "Passt gut zum Stack"],
  questions: ["Gibt es bereits Tests?", "Welche Node-Version wird verwendet?"],
  proposal_de: "Guten Tag, ich habe Ihren Auftrag gelesen und verstehe genau was gebraucht wird. Ich würde das mit TypeScript und React umsetzen und kann in 3-4 Stunden liefern.",
  red_flags: [],
  reasoning: "Klarer Auftrag, passt gut zum bestehenden Stack und ist gut umsetzbar.",
  viable: true,
  overall_score: 8,
  steps: ["Feature implementieren", "Tests schreiben"],
  risks: [],
};

describe("validateQuickCashResult", () => {
  it("accepts valid Quick Cash result", () => {
    const result = validateQuickCashResult(validQC);
    expect(result).not.toBeNull();
    expect(result!.quick_cash_score).toBe(82);
  });

  it("rejects null input", () => {
    expect(validateQuickCashResult(null)).toBeNull();
  });

  it("rejects missing quick_cash_score", () => {
    expect(validateQuickCashResult({ ...validQC, quick_cash_score: undefined })).toBeNull();
  });

  it("rejects out-of-range score", () => {
    expect(validateQuickCashResult({ ...validQC, quick_cash_score: 150 })).toBeNull();
  });
});

describe("validateQuickCashResultDetailed", () => {
  it("returns errors for null input", () => {
    const result = validateQuickCashResultDetailed(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("accepts valid result with no errors", () => {
    const result = validateQuickCashResultDetailed(validQC);
    expect(result.ok).toBe(true);
  });

  it("collects errors for invalid input", () => {
    const result = validateQuickCashResultDetailed({
      quick_cash_score: 200,
      confidence: 15,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    }
  });
});
