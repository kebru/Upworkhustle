import { describe, it, expect } from "vitest";
import { getOverallScoreLabel } from "@/lib/scoreLabel";

describe("getOverallScoreLabel", () => {
  it("returns correct labels for score ranges", () => {
    expect(getOverallScoreLabel(10)).toBe("Sehr gut geeignet");
    expect(getOverallScoreLabel(9)).toBe("Sehr gut geeignet");
    expect(getOverallScoreLabel(8)).toBe("Gut geeignet");
    expect(getOverallScoreLabel(7)).toBe("Gut geeignet");
    expect(getOverallScoreLabel(6)).toBe("Mittelmäßig geeignet");
    expect(getOverallScoreLabel(5)).toBe("Mittelmäßig geeignet");
    expect(getOverallScoreLabel(4)).toBe("Anspruchsvoll");
    expect(getOverallScoreLabel(3)).toBe("Anspruchsvoll");
    expect(getOverallScoreLabel(2)).toBe("Wenig geeignet");
    expect(getOverallScoreLabel(1)).toBe("Wenig geeignet");
  });

  it("rounds float scores", () => {
    expect(getOverallScoreLabel(8.7)).toBe("Sehr gut geeignet");
    expect(getOverallScoreLabel(6.4)).toBe("Mittelmäßig geeignet");
  });
});
