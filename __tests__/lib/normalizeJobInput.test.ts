import { describe, it, expect } from "vitest";
import { normalizeJobText, looksLikeHtml, stripHtmlToText } from "@/lib/normalizeJobInput";

describe("looksLikeHtml", () => {
  it("detects HTML with div tags", () => {
    expect(looksLikeHtml("<div>Hello</div>")).toBe(true);
  });

  it("detects HTML with Upwork class", () => {
    expect(looksLikeHtml('<span class="air3-test">Hello</span>')).toBe(true);
  });

  it("rejects plain text", () => {
    expect(looksLikeHtml("Just a plain job description")).toBe(false);
  });

  it("rejects text with angle brackets that is not HTML", () => {
    expect(looksLikeHtml("salary > 50k and age < 30")).toBe(false);
  });
});

describe("stripHtmlToText", () => {
  it("removes HTML tags and preserves text", () => {
    const result = stripHtmlToText("<p>Hello <strong>world</strong></p>");
    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).not.toContain("<");
  });

  it("converts br to newline", () => {
    const result = stripHtmlToText("Line 1<br/>Line 2");
    expect(result).toContain("Line 1\nLine 2");
  });

  it("decodes HTML entities", () => {
    const result = stripHtmlToText("&amp; &lt; &gt; &quot;");
    expect(result).toContain("& < > \"");
  });

  it("removes script and style tags", () => {
    const result = stripHtmlToText("<script>alert(1)</script><style>.x{}</style><p>Content</p>");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".x");
    expect(result).toContain("Content");
  });
});

describe("normalizeJobText", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeJobText("")).toBe("");
    expect(normalizeJobText("   ")).toBe("");
  });

  it("strips HTML from job text", () => {
    const result = normalizeJobText("<div>Build a <b>landing page</b></div>");
    expect(result).toContain("Build a landing page");
    expect(result).not.toContain("<div>");
  });

  it("collapses excessive whitespace", () => {
    const result = normalizeJobText("Hello\n\n\n\n\nWorld");
    expect(result).not.toContain("\n\n\n");
  });

  it("removes Upwork UI noise", () => {
    const result = normalizeJobText("Slide 1 Unlock new proposal Real content here");
    expect(result).toContain("Real content here");
    expect(result).not.toMatch(/Slide\s+1/i);
  });
});
