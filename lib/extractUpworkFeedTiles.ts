import * as cheerio from "cheerio";

export type UpworkFeedJobItem = {
  source: "upwork_feed";
  title: string;
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  skills: string[];
  description: string;
  feedHasMoreToggle: boolean;
  likelyTruncated: boolean;
  descriptionCharLength: number;
  jobUrl?: string;
};

function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +/g, " ")
    .trim();
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function looksTruncatedByContent(description: string, feedHasMoreToggle: boolean): boolean {
  const d = description.trim();
  if (!feedHasMoreToggle) return false;
  if (!d) return false;

  const len = d.length;
  const endsWithEllipsis = /(\.\.\.|…)\s*$/.test(d);

  // Mid-word / mid-sentence heuristic (very rough)
  const endsAbruptly = /[A-Za-z0-9,;:]$/.test(d) && !/[.!?]$/.test(d);

  // If it's already long and structured, treat as likely full even if UI shows "more"
  const structured = d.includes("\n") || /(^|\n)\s*[-*•]\s+/.test(d);
  if (len >= 900 && structured) return false;

  if (len < 400 && (endsWithEllipsis || endsAbruptly)) return true;
  if (len < 250) return true;
  return false;
}

/**
 * Extrahiert Job-Karten aus Upwork "Best Matches"/Feed HTML.
 * Nutzt stabile `data-test` Attribute statt fragilem Text-Splitting.
 *
 * Erwartet HTML wie in `upwork_jobs.html`:
 * - Container: div[data-test="job-tile-list"]
 * - Tiles: section.air3-card-section[...] mit data-ev-opening_uid/data-ev-position
 */
export function extractUpworkFeedTiles(html: string): UpworkFeedJobItem[] | null {
  const $ = cheerio.load(html);

  // Path A: "Best Matches" feed container
  const list = $('[data-test="job-tile-list"]').first();
  const tilesA = list.length
    ? list.find('section.air3-card-section[data-ev-opening_uid]')
    : $();

  // Path B: "Search Jobs" results use <article data-test="JobTile">
  const tilesB = $('article[data-test="JobTile"]');

  const tiles = tilesA.length ? tilesA : tilesB;
  if (!tiles.length) return null;

  const results: UpworkFeedJobItem[] = [];

  tiles.each((_, el) => {
    const tile = $(el);

    // Title + URL: support both DOMs
    const titleAnchor =
      tile
        .find('[data-test*="job-tile-title-link"]')
        .filter((_, a) => {
          const href = $(a).attr("href");
          return typeof href === "string" && href.startsWith("/jobs/");
        })
        .first()
        .add(tile.find("h3.job-tile-title a").filter((_, a) => {
          const href = $(a).attr("href");
          return typeof href === "string" && href.startsWith("/jobs/");
        }).first())
        .first();

    const title = cleanText(titleAnchor.text());
    if (!title) return;

    const jobUrlRaw = titleAnchor.attr("href");
    const jobUrl =
      typeof jobUrlRaw === "string" && jobUrlRaw.startsWith("/jobs/")
        ? `https://www.upwork.com${jobUrlRaw}`
        : undefined;

    const postedOn =
      cleanText(tile.find('[data-test="posted-on"]').first().text()) ||
      cleanText(tile.find('[data-test="job-pubilshed-date"]').first().text());

    const jobType =
      cleanText(tile.find('[data-test="job-type"]').first().text()) ||
      cleanText(tile.find('[data-test="job-type-label"]').first().text());
    const budget =
      cleanText(tile.find('[data-test="budget"]').first().text()) ||
      cleanText(tile.find('[data-test="is-fixed-price"]').first().text());
    const duration = cleanText(tile.find('[data-test="duration"]').first().text());
    const contractorTier = cleanText(
      tile.find('[data-test="contractor-tier"]').first().text(),
    );

    const description =
      cleanText(tile.find('[data-test="job-description-text"]').first().text()) ||
      cleanText(tile.find('[data-test*="JobDescription"]').first().text());

    // Skills are rendered as <a data-test="attr-item">Skill</a>
    const skills = uniqueStrings(
      tile
        .find('[data-test="token-container"] a[data-test="attr-item"], [data-test*="TokenClamp JobAttrs"] [data-test="token"]')
        .toArray()
        .map((a) => cleanText($(a).text())),
    );

    // Truncation heuristic: presence of line clamp with "more" toggle.
    // In the feed HTML it shows as data-test="job-description-line-clamp" and
    // a button whose visible text includes "more".
    const clamp = tile.find('[data-test="job-description-line-clamp"]').first();
    const moreBtn = clamp.find("button").filter((__, b) => {
      const t = cleanText($(b).text());
      return t === "more" || /\bmore\b/i.test(t);
    });
    const feedHasMoreToggle = clamp.length > 0 && moreBtn.length > 0;
    const descriptionCharLength = description.length;
    const likelyTruncated = looksTruncatedByContent(description, feedHasMoreToggle);

    if (!description) return;

    results.push({
      source: "upwork_feed",
      title,
      postedOn: postedOn || undefined,
      jobType: jobType || undefined,
      budget: budget || undefined,
      duration: duration || undefined,
      contractorTier: contractorTier || undefined,
      skills,
      description,
      feedHasMoreToggle,
      likelyTruncated,
      descriptionCharLength,
      jobUrl,
    });
  });

  return results.length > 0 ? results : null;
}

