import { NextResponse } from "next/server";
import { z } from "zod";
import { extractUpworkFeedTiles } from "@/lib/extractUpworkFeedTiles";
import { looksLikeHtml } from "@/lib/normalizeJobInput";
import { dbGetAllEvaluationUpworkJobIds, dbGetAllSeenUpworkJobIds } from "@/lib/db";
import { extractUpworkJobId } from "@/lib/upwork-job-id";

const bodySchema = z.object({
  rawText: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const raw = parsed.data.rawText;
  const limit = parsed.data.limit ?? 50;

  const tiles = looksLikeHtml(raw) ? extractUpworkFeedTiles(raw) : null;
  const parsedJobs = (tiles ?? []).map((t) => ({
    title: t.title,
    jobUrl: t.jobUrl,
    upworkJobId: t.jobUrl ? extractUpworkJobId(t.jobUrl) : undefined,
  }));

  const evalIds = new Set(dbGetAllEvaluationUpworkJobIds());
  const seenIds = new Set(dbGetAllSeenUpworkJobIds());
  const allSeen = new Set<string>();
  evalIds.forEach((id) => allSeen.add(id));
  seenIds.forEach((id) => allSeen.add(id));

  const withId = parsedJobs.filter((j) => typeof j.upworkJobId === "string" && j.upworkJobId.length > 0);
  const matches = withId.filter((j) => j.upworkJobId && allSeen.has(j.upworkJobId));
  const missing = withId.filter((j) => j.upworkJobId && !allSeen.has(j.upworkJobId));

  // #region agent log
  fetch("http://127.0.0.1:7308/ingest/d7c7c2de-211a-48e0-83e3-49047ff29be5", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "827bfa" },
    body: JSON.stringify({
      sessionId: "827bfa",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "app/api/debug/fixture-seen/route.ts:40",
      message: "fixture-seen counts",
      data: {
        parsedJobs: parsedJobs.length,
        withId: withId.length,
        evalIds: evalIds.size,
        seenIds: seenIds.size,
        matched: matches.length,
        missing: missing.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  return NextResponse.json({
    parsedJobs: parsedJobs.length,
    withId: withId.length,
    matchedSeen: matches.length,
    missingSeen: missing.length,
    missingSamples: missing.slice(0, limit),
  });
}

