import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractUpworkFeedTiles } from "@/lib/extractUpworkFeedTiles";

const FIXTURES_DIR = join(__dirname, "../../fixtures/upwork-html");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("extractUpworkFeedTiles — Feed Fixture", () => {
  const html = loadFixture("upwork_jobs.feed.html");
  const jobs = extractUpworkFeedTiles(html);

  it("extracts at least one job from feed HTML", () => {
    expect(jobs).not.toBeNull();
    expect(jobs!.length).toBeGreaterThan(0);
  });

  it("every job has title, description, and source", () => {
    for (const j of jobs!) {
      expect(j.title).toBeTruthy();
      expect(j.description).toBeTruthy();
      expect(j.source).toBe("upwork_feed");
    }
  });

  it("extracts skills as non-empty arrays where present", () => {
    const withSkills = jobs!.filter((j) => j.skills.length > 0);
    expect(withSkills.length).toBeGreaterThan(0);
    for (const j of withSkills) {
      for (const s of j.skills) {
        expect(typeof s).toBe("string");
        expect(s.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("extracts jobUrl starting with https://www.upwork.com/jobs/", () => {
    const withUrl = jobs!.filter((j) => j.jobUrl);
    expect(withUrl.length).toBeGreaterThan(0);
    for (const j of withUrl) {
      expect(j.jobUrl).toMatch(/^https:\/\/www\.upwork\.com\/jobs\//);
    }
  });
});

describe("extractUpworkFeedTiles — Search Fixture", () => {
  const html = loadFixture("search_jobs.entry_level.html");
  const jobs = extractUpworkFeedTiles(html);

  it("extracts at least one job from search HTML", () => {
    expect(jobs).not.toBeNull();
    expect(jobs!.length).toBeGreaterThan(0);
  });

  it("every job has title, description, and source", () => {
    for (const j of jobs!) {
      expect(j.title).toBeTruthy();
      expect(j.description).toBeTruthy();
      expect(j.source).toBe("upwork_feed");
    }
  });

  it("extracts jobType from search pages (uses job-type-label selector)", () => {
    const withJobType = jobs!.filter((j) => j.jobType);
    expect(withJobType.length).toBeGreaterThan(0);
  });

  it("extracts skills from search pages", () => {
    const withSkills = jobs!.filter((j) => j.skills.length > 0);
    expect(withSkills.length).toBeGreaterThan(0);
  });

  it("extracts jobUrl from search pages", () => {
    const withUrl = jobs!.filter((j) => j.jobUrl);
    expect(withUrl.length).toBeGreaterThan(0);
    for (const j of withUrl) {
      expect(j.jobUrl).toMatch(/^https:\/\/www\.upwork\.com\/jobs\//);
    }
  });

  it("detects truncation flag correctly", () => {
    for (const j of jobs!) {
      expect(typeof j.likelyTruncated).toBe("boolean");
      expect(typeof j.feedHasMoreToggle).toBe("boolean");
      expect(typeof j.descriptionCharLength).toBe("number");
    }
  });
});

describe("extractUpworkFeedTiles — edge cases", () => {
  it("returns null for empty HTML", () => {
    expect(extractUpworkFeedTiles("")).toBeNull();
  });

  it("returns null for HTML without job tiles", () => {
    expect(extractUpworkFeedTiles("<html><body><div>No jobs</div></body></html>")).toBeNull();
  });
});
