import { describe, it, expect } from "vitest";
import { getOverallScoreLabel } from "@/lib/scoreLabel";

describe("getOverallScoreLabel", () => {
  it("returns correct labels for score ranges", () => {
    expect(getOverallScoreLabel(10)).toBe("Perfekter Sidehustle-Job");
    expect(getOverallScoreLabel(9)).toBe("Perfekter Sidehustle-Job");
    expect(getOverallScoreLabel(8)).toBe("Gut geeignet");
    expect(getOverallScoreLabel(7)).toBe("Gut geeignet");
    expect(getOverallScoreLabel(6)).toBe("Grenzwertig");
    expect(getOverallScoreLabel(5)).toBe("Grenzwertig");
    expect(getOverallScoreLabel(4)).toBe("Zu viele Risiken");
    expect(getOverallScoreLabel(3)).toBe("Zu viele Risiken");
    expect(getOverallScoreLabel(2)).toBe("Nicht geeignet");
    expect(getOverallScoreLabel(1)).toBe("Nicht geeignet");
  });

  it("rounds float scores", () => {
    expect(getOverallScoreLabel(8.7)).toBe("Perfekter Sidehustle-Job");
    expect(getOverallScoreLabel(6.4)).toBe("Grenzwertig");
  });
});
