import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbInboxList } from "@/lib/db";

const querySchema = z.object({
  status: z.enum(["new", "evaluating", "evaluated", "archived", "skipped_seen"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Parameter." }, { status: 400 });
  }
  const jobs = dbInboxList(parsed.data);
  return NextResponse.json({ jobs });
}

