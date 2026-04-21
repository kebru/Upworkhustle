import { NextResponse } from "next/server";
import { extractUpworkFeedTiles } from "@/lib/extractUpworkFeedTiles";
import { looksLikeHtml, normalizeJobText } from "@/lib/normalizeJobInput";
import { normalizeUpworkDescription } from "@/lib/normalizeUpworkDescription";
import { splitJobPostings } from "@/lib/splitJobs";
import { PER_JOB_MAX_CHARS } from "@/lib/constants";
import { extractIp, isRateLimited } from "@/lib/rateLimit";
import { parseRequestSchema } from "@/lib/schemas";
import type { ParsedJob } from "@/types";
import { extractUpworkJobId } from "@/lib/upwork-job-id";

function extractUrlFromChunk(chunk: string): string | undefined {
  const urlLine =
    chunk.match(/(?:^|\n)\s*URL:\s*(https?:\/\/[^\s]+)\s*(?:\n|$)/i)?.[1]?.trim();
  if (urlLine?.includes("upwork.com")) return urlLine;
  const direct =
    chunk.match(/https?:\/\/www\.upwork\.com\/jobs\/~\d{10,}/)?.[0]?.trim();
  if (direct) return direct;
  const id = extractUpworkJobId(chunk);
  return id ? `https://www.upwork.com/jobs/~${id}` : undefined;
}

function extractTitleFromChunk(chunk: string): string | undefined {
  const fromTitleLine =
    chunk.match(/(?:^|\n)\s*TITLE:\s*(.+)\s*(?:\n|$)/i)?.[1]?.trim();
  const candidate = (fromTitleLine || "")
    .replace(/^\*+|\*+$/g, "")
    .trim();
  if (candidate.length >= 6) return candidate.slice(0, 180);

  // Fallback: first non-empty line that isn't a metadata label
  const lines = chunk
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines.find((l) => !/^(URL|POSTED|TYPE|LEVEL|DURATION|BUDGET|SKILLS|DESCRIPTION)\s*:/i.test(l));
  if (!first) return undefined;
  const cleaned = first.replace(/^\*+|\*+$/g, "").trim();
  return cleaned.length >= 6 ? cleaned.slice(0, 180) : undefined;
}

function buildModelTextFromTile(tile: {
  title: string;
  description: string;
  skills: string[];
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  jobUrl?: string;
}): string {
  const parts: string[] = [];
  parts.push(`TITLE: ${tile.title}`);
  if (tile.postedOn) parts.push(`POSTED: ${tile.postedOn}`);
  if (tile.jobType) parts.push(`TYPE: ${tile.jobType}`);
  if (tile.contractorTier) parts.push(`LEVEL: ${tile.contractorTier}`);
  if (tile.duration) parts.push(`DURATION: ${tile.duration}`);
  if (tile.budget) parts.push(`BUDGET: ${tile.budget}`);
  if (tile.jobUrl) parts.push(`URL: ${tile.jobUrl}`);

  const skills = tile.skills.slice(0, 10);
  if (skills.length) parts.push(`SKILLS: ${skills.join(", ")}`);

  parts.push("");
  parts.push("DESCRIPTION:");
  parts.push(tile.description);

  return parts.join("\n");
}

function applyPerJobLimit(s: string): { text: string; wasTrimmed: boolean } {
  const t = s.trim();
  if (t.length <= PER_JOB_MAX_CHARS) return { text: t, wasTrimmed: false };
  return {
    text: `${t.slice(0, PER_JOB_MAX_CHARS)}\n\n[… Text wurde gekürzt (Per-Job Limit).]`,
    wasTrimmed: true,
  };
}

export async function POST(request: Request) {
  const ip = extractIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte kurz warten." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = parseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." },
      { status: 400 },
    );
  }
  const raw = parsed.data.rawText.trim();
  if (!raw) {
    return NextResponse.json({ error: "Bitte rawText angeben." }, { status: 400 });
  }

  // 1) Upwork-Feed-HTML: strukturiert extrahieren
  if (looksLikeHtml(raw)) {
    const tiles = extractUpworkFeedTiles(raw);
    if (tiles && tiles.length > 0) {
      const jobs = tiles
        .map((t): ParsedJob | null => {
          const normalizedDesc = normalizeUpworkDescription(t.description);
          const modelTextRaw = buildModelTextFromTile({
            title: t.title,
            postedOn: t.postedOn,
            jobType: t.jobType,
            budget: t.budget,
            duration: t.duration,
            contractorTier: t.contractorTier,
            jobUrl: t.jobUrl,
            skills: t.skills,
            description: normalizedDesc,
          });
          const limited = applyPerJobLimit(modelTextRaw);
          const modelText = normalizeJobText(limited.text);
          if (!modelText) return null;
          return {
            source: "upwork_feed" as const,
            title: t.title,
            postedOn: t.postedOn,
            jobType: t.jobType,
            budget: t.budget,
            duration: t.duration,
            contractorTier: t.contractorTier,
            skills: t.skills,
            feedHasMoreToggle: t.feedHasMoreToggle,
            likelyTruncated: t.likelyTruncated,
            descriptionCharLength: t.descriptionCharLength,
            jobUrl: t.jobUrl,
            jobText: modelText,
            jobTextCharLength: modelText.length,
            wasTrimmed: limited.wasTrimmed,
          };
        })
        .filter((x): x is ParsedJob => x !== null);

      if (jobs.length > 0) return NextResponse.json({ jobs });
    }
  }

  // 2) Fallback: bisherige Splits + Normalize
  const parts = splitJobPostings(raw);
  const jobs: ParsedJob[] = parts
    .map((chunk) => {
      const jobUrl = extractUrlFromChunk(chunk);
      const title = extractTitleFromChunk(chunk);
      const jobText = normalizeJobText(chunk);
      if (!jobText) return null;
      return {
        source: "text" as const,
        title,
        jobUrl,
        jobText,
      } satisfies ParsedJob;
    })
    .filter((x): x is ParsedJob => x !== null);

  if (jobs.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nach Bereinigung war kein lesbarer Jobtext übrig. Bitte weniger UI/HTML einfügen oder direkt die Jobbeschreibung kopieren.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ jobs });
}

