/**
 * Macht aus eingefügtem Upwork-HTML oder gemischtem Text lesbaren Klartext
 * für die Bewertungs-API (weniger Tokens, stabiler).
 */

import { MAX_JOB_CHARS } from "@/lib/constants";

const MAX_CHARS = MAX_JOB_CHARS;

function decodeBasicEntities(t: string): string {
  return t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0
        ? String.fromCodePoint(code)
        : "";
    });
}

/** Für API: HTML-Erkennung (wird auch von extractUpworkHtml genutzt). */
export function looksLikeHtml(s: string): boolean {
  const head = s.slice(0, 4000);
  if (!/<[a-z][\s\S]*?>/i.test(head)) return false;
  return (
    /<div\b/i.test(head) ||
    /<span\b/i.test(head) ||
    /<section\b/i.test(head) ||
    /<html\b/i.test(head) ||
    /class="[^"]*air3-/i.test(head)
  );
}

/**
 * Klartext von einer „ganze Seite markiert“-Kopie: versucht den Block
 * „Job Description“ / „Summary“ zu isolieren (ohne HTML).
 */
function extractPlainPageDump(text: string): string {
  const enders =
    /\n\s*(?:Skills and expertise|Fähigkeiten|Kenntnisse|Activity on this job|Aktivität|About the client|Über den Kunden|Similar jobs|Ähnliche Jobs|Proposals|Client's recent history|Posted jobs|Proposal insights|Unlock new proposal|Hourly Range|Fixed Price|Location|Member since|Stundenlohn)/i;

  const blocks: { score: number; body: string }[] = [];

  const tryBlock = (re: RegExp) => {
    const m = text.match(re);
    if (m?.[1]) {
      let body = m[1].trim();
      const cut = body.split(enders);
      if (cut[0]) body = cut[0].trim();
      if (body.length >= 80) {
        const head = m[0].toLowerCase();
        const score =
          body.length +
          (head.includes("job description") ||
          head.includes("stellenbeschreibung") ||
          head.includes("jobbeschreibung")
            ? 500
            : 0);
        blocks.push({ score, body });
      }
    }
  };

  tryBlock(
    /(?:^|\n)\s*Job Description\s*\n+([\s\S]+)/i,
  );
  tryBlock(
    /(?:^|\n)\s*Summary\s*\n+([\s\S]+)/i,
  );
  tryBlock(
    /(?:^|\n)\s*Project Description\s*\n+([\s\S]+)/i,
  );
  tryBlock(
    /(?:^|\n)\s*(?:Stellenbeschreibung|Jobbeschreibung|Aufgaben)\s*\n+([\s\S]+)/i,
  );

  if (blocks.length === 0) return text;

  blocks.sort((a, b) => b.score - a.score);
  return blocks[0].body;
}

/**
 * Entfernt typische Upwork-UI-Reste (Karussell, CTAs), die ohne echte Jobbeschreibung
 * mitkopiert werden.
 */
function stripUpworkUiNoise(text: string): string {
  let s = text;
  s = s.replace(/\bSlide\s+\d+\b/gi, " ");
  s = s.replace(/\bUnlock\s+new\s+proposal\b/gi, " ");
  s = s.replace(/\bUnlock\s+proposal\b/gi, " ");
  s = s.replace(/\bProposal\s+insights?\b/gi, " ");
  s = s.replace(/\bSee\s+more\s+jobs?\b/gi, " ");
  s = s.replace(/\bApply\s+now\b/gi, " ");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

/** Export für splitJobs: HTML-Feed erst zu Klartext, dann „Posted …“-Trennung. */
export function stripHtmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeBasicEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/ +/g, " ");
  return s.trim();
}

/**
 * Bereinigt einen Job-String (HTML → Text, Whitespace, Längenlimit).
 */
export function normalizeJobText(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").trim();
  if (!s) return "";

  if (!looksLikeHtml(s)) {
    s = extractPlainPageDump(s);
  }

  if (looksLikeHtml(s)) {
    s = stripHtmlToText(s);
  }

  s = stripUpworkUiNoise(s);

  s = s.replace(/\n{3,}/g, "\n\n").trim();

  if (s.length > MAX_CHARS) {
    s =
      s.slice(0, MAX_CHARS) +
      "\n\n[… Text wurde gekürzt: zu viele Zeichen für eine Bewertung.]";
  }

  return s;
}
