import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractUpworkFeedTiles } from "@/lib/extractUpworkFeedTiles";
import { extractFromUpworkHtml } from "@/lib/extractUpworkHtml";
import type { ParsedJob } from "@/types";

const feedRequestSchema = z.object({
  url: z.string().url().refine(
    (u) => {
      try {
        const host = new URL(u).hostname;
        return host === "www.upwork.com" || host === "upwork.com";
      } catch {
        return false;
      }
    },
    { message: "URL muss eine upwork.com-Domain sein." },
  ),
});

const rateLimitMap = new Map<string, number>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(ip);
  if (last && now - last < 60_000) return false;
  rateLimitMap.set(ip, now);
  // GC old entries
  if (rateLimitMap.size > 500) {
    rateLimitMap.forEach((v, k) => {
      if (now - v > 120_000) rateLimitMap.delete(k);
    });
  }
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Bitte maximal 1 Anfrage pro Minute. Versuche es gleich nochmal." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = feedRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige URL." },
      { status: 400 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(parsed.data.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UpworkEvaluator/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upwork antwortete mit Status ${res.status}. Evtl. Login nötig oder URL ungültig.` },
        { status: 502 },
      );
    }

    const html = await res.text();

    // Try feed tiles first, then single-page extraction
    const feedItems = extractUpworkFeedTiles(html);
    if (feedItems && feedItems.length > 0) {
      const jobs: ParsedJob[] = feedItems.map((item) => ({
        source: "upwork_feed" as const,
        jobText: [item.title, item.description, item.skills.length > 0 ? `Skills: ${item.skills.join(", ")}` : ""].filter(Boolean).join("\n\n"),
        title: item.title,
        postedOn: item.postedOn,
        jobType: item.jobType,
        budget: item.budget,
        duration: item.duration,
        contractorTier: item.contractorTier,
        skills: item.skills,
        feedHasMoreToggle: item.feedHasMoreToggle,
        likelyTruncated: item.likelyTruncated,
        descriptionCharLength: item.descriptionCharLength,
        jobUrl: item.jobUrl,
      }));
      return NextResponse.json({ jobs });
    }

    // Single job page
    const single = extractFromUpworkHtml(html);
    if (single) {
      const jobs: ParsedJob[] = [{ source: "text" as const, jobText: single }];
      return NextResponse.json({ jobs });
    }

    return NextResponse.json(
      { error: "Keine Jobs im HTML gefunden. Evtl. Login nötig oder die Seite hat kein Feed-Layout." },
      { status: 422 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    if (msg.includes("abort")) {
      return NextResponse.json({ error: "Timeout: Upwork antwortete nicht innerhalb von 15 Sekunden." }, { status: 504 });
    }
    return NextResponse.json({ error: `Feed-Abruf fehlgeschlagen: ${msg}` }, { status: 500 });
  }
}
