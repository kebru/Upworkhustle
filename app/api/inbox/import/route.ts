import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CanonicalUpworkJob } from "@/types";
import { dbInboxUpsertMany, dbGetAllEvaluationUpworkJobIds, dbGetAllSeenUpworkJobIds } from "@/lib/db";

const canonicalJobSchema = z.object({
  upworkJobId: z.string().min(10),
  jobUrl: z.string().url(),
  title: z.string().min(2),
  description: z.string().min(1),
  skills: z.array(z.string()).default([]),
  postedOn: z.string().optional(),
  jobType: z.string().optional(),
  budget: z.string().optional(),
  duration: z.string().optional(),
  contractorTier: z.string().optional(),
  source: z.enum(["extension_job_detail", "extension_feed", "extension_search", "paste_fallback"]),
  capturedAt: z.string(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  jobs: z.array(canonicalJobSchema).min(1).max(200),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Daten." }, { status: 400 });
  }

  // dedup within request by upworkJobId
  const byId = new Map<string, CanonicalUpworkJob>();
  for (const j of parsed.data.jobs as CanonicalUpworkJob[]) {
    byId.set(j.upworkJobId, j);
  }
  const jobs = Array.from(byId.values());

  // skip jobs already seen/evaluated (upworkJobId)
  const seen = new Set<string>([...dbGetAllSeenUpworkJobIds(), ...dbGetAllEvaluationUpworkJobIds()]);
  const toImport: CanonicalUpworkJob[] = [];
  let skippedSeen = 0;
  for (const j of jobs) {
    if (seen.has(j.upworkJobId)) { skippedSeen++; continue; }
    toImport.push(j);
  }

  const { imported, updated } = dbInboxUpsertMany(toImport);
  // eslint-disable-next-line no-console
  console.info(`[INBOX_IMPORT] received=${jobs.length} imported=${imported} updated=${updated} skippedSeen=${skippedSeen}`);
  return NextResponse.json({
    ok: true,
    received: jobs.length,
    imported,
    updated,
    skippedSeen,
  });
}

