import { describe, it, expect } from "vitest";
import { splitJobPostings } from "@/lib/splitJobs";

describe("splitJobPostings", () => {
  it("returns empty array for empty input", () => {
    expect(splitJobPostings("")).toEqual([]);
    expect(splitJobPostings("   ")).toEqual([]);
  });

  it("returns single job if no separator", () => {
    const result = splitJobPostings("Some job description here");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Some job description");
  });

  it("splits on manual --- separator", () => {
    const input = "Job 1 description\n---\nJob 2 description";
    const result = splitJobPostings(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("Job 1");
    expect(result[1]).toContain("Job 2");
  });

  it("splits on multiple --- separators", () => {
    const input = "Job A\n---\nJob B\n---\nJob C";
    const result = splitJobPostings(input);
    expect(result).toHaveLength(3);
  });

  it("splits on Posted yesterday pattern", () => {
    const input =
      "Posted yesterday\nHourly: $20\nFirst job description\nPosted 4 hours ago\nFixed-price\nSecond job";
    const result = splitJobPostings(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("does not split on ___ (underscore)", () => {
    const input = "Job with ___underscores___ in the text";
    const result = splitJobPostings(input);
    expect(result).toHaveLength(1);
  });

  it("normalizes CRLF line endings", () => {
    const input = "Job 1\r\n---\r\nJob 2";
    const result = splitJobPostings(input);
    expect(result).toHaveLength(2);
  });
});
