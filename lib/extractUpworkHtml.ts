import * as cheerio from "cheerio";

function collapseText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +/g, " ")
    .trim();
}

const DESCRIPTION_SELECTORS = [
  '[data-test="job-description"]',
  '[data-test="JobDescription"]',
  '[data-test="job-description-text"]',
  '[data-test="description"]',
  "section[class*=\"job-description\"]",
  "[class*=\"air3-job-details\"] [class*=\"description\"]",
  "[class*=\"JobDescription\"]",
  "[class*=\"job-description\"]",
];

const TITLE_SELECTORS = [
  '[data-test="job-title"] h2',
  '[data-test="job-title"]',
  '[data-test="JobTitle"]',
  "h2[class*=\"job-title\"]",
  "h1[class*=\"title\"]",
];

/**
 * Versucht aus eingefügtem Upwork-HTML Titel + Beschreibung (+ optional Skills) zu lesen.
 * Nur serverseitig nutzen (Cheerio).
 */
export function extractFromUpworkHtml(html: string): string | null {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe").remove();
  $("nav, footer, [role=\"navigation\"], [aria-label*=\"breadcrumb\"]").remove();
  $("[class*=\"carousel\"], [class*=\"Carousel\"], [data-test*=\"carousel\"]").remove();

  let description = "";
  for (const sel of DESCRIPTION_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const t = collapseText(el.text());
      if (t.length >= 80) {
        description = t;
        break;
      }
    }
  }

  if (!description) {
    const main = $("main, [role=\"main\"], article").first();
    if (main.length) {
      main.find("nav, footer, aside, header").remove();
      const t = collapseText(main.text());
      if (t.length >= 120) description = t;
    }
  }

  if (!description) {
    const body = $("body");
    if (body.length) {
      body.find("nav, footer, header, script, style").remove();
      const t = collapseText(body.text());
      if (t.length >= 200) description = t;
    }
  }

  if (!description || description.length < 60) return null;

  let title = "";
  for (const sel of TITLE_SELECTORS) {
    const t = collapseText($(sel).first().text());
    if (t.length > 8 && t.length < 400) {
      title = t;
      break;
    }
  }

  let skills = "";
  const sk = $('[data-test="skills"], [data-test="Skills"]').first();
  if (sk.length) {
    const t = collapseText(sk.text());
    if (t.length > 15 && t.length < 8000) skills = t;
  }

  if (title && description.startsWith(title.slice(0, Math.min(24, title.length)))) {
    title = "";
  }

  const parts: string[] = [];
  if (title) parts.push(title);
  parts.push(description);
  if (skills && !description.includes(skills.slice(0, Math.min(60, skills.length)))) {
    parts.push(`Skills / expertise: ${skills}`);
  }

  return collapseText(parts.join("\n\n"));
}
