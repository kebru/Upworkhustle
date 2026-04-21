import { describe, it, expect } from "vitest";
import { extractUpworkJobId } from "@/lib/upwork-job-id";

describe("extractUpworkJobId", () => {
  it("extracts ID from Upwork job URL", () => {
    expect(extractUpworkJobId("https://www.upwork.com/jobs/~021912345678901234"))
      .toBe("021912345678901234");
  });

  it("extracts ID from URL with query params", () => {
    expect(extractUpworkJobId("https://www.upwork.com/jobs/~021912345678901234?source=rss"))
      .toBe("021912345678901234");
  });

  it("extracts ID embedded in text", () => {
    expect(extractUpworkJobId("Check this job ~021912345678901234 for details"))
      .toBe("021912345678901234");
  });

  it("returns undefined for text without tilde-prefixed ID", () => {
    expect(extractUpworkJobId("No job ID here")).toBeUndefined();
  });

  it("returns undefined for short numeric sequences after tilde", () => {
    expect(extractUpworkJobId("~12345")).toBeUndefined();
  });

  it("extracts the first match when multiple IDs present", () => {
    expect(extractUpworkJobId("~0219123456789 and ~0219987654321"))
      .toBe("0219123456789");
  });

  it("returns undefined for empty string", () => {
    expect(extractUpworkJobId("")).toBeUndefined();
  });

  it("handles detail modal URLs", () => {
    expect(extractUpworkJobId("/nx/find-work/best-matches/details/~021946180392054927455?_modalInfo=true"))
      .toBe("021946180392054927455");
  });
});
