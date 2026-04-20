/**
 * Zerlegt eingefügten Text in einzelne Job-Postings.
 *
 * 1) Manuelle Trenner: eine Zeile nur mit mind. drei Bindestrichen (---)
 * 2) Upwork-Feed: „Posted yesterday“ / „Posted 4 hours ago“
 *
 * Wichtig: Bei HTML aus der Zwischenablage steht „Posted …“ oft in getrennten Tags
 * (`<span>Posted</span>…`). Dann gibt es im Rohstring kein zusammenhängendes
 * `Posted\\s+yesterday` → erst HTML zu Klartext, dann splitten.
 */

import { looksLikeHtml, stripHtmlToText } from "@/lib/normalizeJobInput";

/** Nur Bindestriche — „___“ kommt in Upwork-Kopien oft vor und würde falsch trennen */
const MANUAL_SPLIT = /\n-{3,}\s*\n/;

/**
 * Case-sensitive „Posted“ wie im Upwork-Feed.
 */
const FEED_SPLIT =
  /\b(?=Posted\s+(?:yesterday|today|\d+\s+(?:hours?|minutes?|days?|seconds?)\s+ago)\b)/;

function looksLikeJobChunk(s: string): boolean {
  const head = s.slice(0, 8000);
  return (
    /(?:Hourly|Fixed-price|Fixed price|Est\.(?:\s|Time|Budget)|Budget:)/i.test(
      head,
    ) ||
    (/\bPosted\s+(?:yesterday|today|\d+\s+(?:hours?|minutes?|days?)\s+ago)\b/.test(
      head,
    ) &&
      s.length >= 100)
  );
}

function runFeedSplit(source: string): string[] {
  const feedParts = source
    .split(FEED_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);

  if (feedParts.length <= 1) {
    return feedParts;
  }

  const jobs = feedParts.filter(looksLikeJobChunk);
  if (jobs.length > 0) return jobs;

  if (feedParts.length > 1) {
    const tail = feedParts.slice(1);
    return tail.length > 0 ? tail : [source];
  }

  return feedParts;
}

export function splitJobPostings(raw: string): string[] {
  let normalized = raw.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!normalized) return [];

  if (looksLikeHtml(normalized)) {
    normalized = stripHtmlToText(normalized);
  }

  const manualParts = normalized
    .split(MANUAL_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (manualParts.length > 1) {
    return manualParts.flatMap((chunk) => {
      const sub = runFeedSplit(chunk);
      return sub.length > 0 ? sub : [chunk];
    });
  }

  return runFeedSplit(normalized);
}
