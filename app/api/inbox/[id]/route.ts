import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbInboxGet, dbInboxSetStatus } from "@/lib/db";

export async function GET(_: NextRequest, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const job = dbInboxGet(id);
  if (!job) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ job });
}

const patchSchema = z.object({
  status: z.enum(["new", "evaluating", "evaluated", "archived", "skipped_seen"]).optional(),
  evaluationId: z.string().optional(),
  lastEvalMode: z.enum(["sidehustle", "quick_cash"]).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültiger Body." }, { status: 400 });
  }
  if (!parsed.data.status && !parsed.data.evaluationId && !parsed.data.lastEvalMode) {
    return NextResponse.json({ error: "Nichts zu ändern." }, { status: 400 });
  }
  const status = parsed.data.status ?? "new";
  dbInboxSetStatus(id, status, { evaluationId: parsed.data.evaluationId, lastEvalMode: parsed.data.lastEvalMode });
  return NextResponse.json({ ok: true });
}

