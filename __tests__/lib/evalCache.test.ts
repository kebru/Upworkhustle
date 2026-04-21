import { describe, it, expect } from "vitest";
import { getCached, setCache, jobTextHash } from "@/lib/eval-cache";

describe("jobTextHash", () => {
  it("returns a hex string", () => {
    const h = jobTextHash("test job text");
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("returns consistent hash for same input", () => {
    expect(jobTextHash("hello world")).toBe(jobTextHash("hello world"));
  });

  it("normalizes whitespace before hashing", () => {
    expect(jobTextHash("hello   world")).toBe(jobTextHash("hello world"));
  });

  it("normalizes case before hashing", () => {
    expect(jobTextHash("Hello World")).toBe(jobTextHash("hello world"));
  });

  it("produces different hashes for different inputs", () => {
    expect(jobTextHash("job A")).not.toBe(jobTextHash("job B"));
  });

  it("produces 16-char hex strings (64-bit truncated SHA-256)", () => {
    expect(jobTextHash("any text here")).toHaveLength(16);
  });
});

describe("setCache + getCached", () => {
  it("round-trips a cached entry", () => {
    const result = { score: 8 };
    setCache("my unique job text abc", result, "my unique job text abc", { model: "test" }, "sidehustle");
    const cached = getCached("my unique job text abc", "sidehustle");
    expect(cached).not.toBeNull();
    expect(cached!.result).toEqual(result);
    expect(cached!.jobTextUsed).toBe("my unique job text abc");
  });

  it("isolates namespaces", () => {
    const resultA = { mode: "sidehustle" };
    const resultB = { mode: "quick_cash" };
    setCache("namespace test job xyz", resultA, "namespace test job xyz", {}, "sidehustle");
    setCache("namespace test job xyz", resultB, "namespace test job xyz", {}, "quick_cash");

    const cachedA = getCached("namespace test job xyz", "sidehustle");
    const cachedB = getCached("namespace test job xyz", "quick_cash");
    expect(cachedA!.result).toEqual(resultA);
    expect(cachedB!.result).toEqual(resultB);
  });

  it("returns null for uncached keys", () => {
    expect(getCached("definitely not cached 12345", "sidehustle")).toBeNull();
  });
});
