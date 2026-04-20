import { describe, it, expect } from "vitest";
import { formatEffortForDisplay } from "@/lib/formatEffortDisplay";

describe("formatEffortForDisplay", () => {
  it("returns dash for empty string", () => {
    expect(formatEffortForDisplay("")).toBe("—");
    expect(formatEffortForDisplay("   ")).toBe("—");
  });

  it("appends Stunden if no unit present", () => {
    expect(formatEffortForDisplay("4-8")).toBe("4-8 Stunden");
    expect(formatEffortForDisplay("12")).toBe("12 Stunden");
  });

  it("does not append if Stunden already present", () => {
    expect(formatEffortForDisplay("4-8 Stunden")).toBe("4-8 Stunden");
    expect(formatEffortForDisplay("12 Stunde")).toBe("12 Stunde");
  });

  it("does not append if hours present", () => {
    expect(formatEffortForDisplay("4-8 hours")).toBe("4-8 hours");
  });

  it("does not append if h suffix present with space", () => {
    expect(formatEffortForDisplay("8 h")).toBe("8 h");
  });
});
