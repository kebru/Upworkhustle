import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  dbMarkSeen,
  dbGetAllSeenHashes,
  dbGetAllSeenUpworkJobIds,
  dbGetAllEvaluationUpworkJobIds,
} from "@/lib/db";

const postSchema = z.object({
  entries: z.array(
    z.object({
      hash: z.string().min(1),
      upworkJobId: z.string().optional(),
    }),
  ),
});

export async function GET() {
  const hashes = dbGetAllSeenHashes();
  const seenIds = dbGetAllSeenUpworkJobIds();
  const evalIds = dbGetAllEvaluationUpworkJobIds();
  const upworkJobIds = Array.from(new Set([...seenIds, ...evalIds]));
  return NextResponse.json({ hashes, upworkJobIds });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  dbMarkSeen(parsed.data.entries);
  return NextResponse.json({ ok: true, count: parsed.data.entries.length });
}
