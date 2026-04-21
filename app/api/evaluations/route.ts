import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbGetAll, dbInsert, dbInsertMany, dbDeleteMany } from "@/lib/db";
import type { SavedEvaluation } from "@/types";

const insertSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      savedAt: z.string(),
      jobSnippet: z.string(),
      evaluation: z.record(z.string(), z.unknown()),
      tags: z.array(z.string()).optional(),
      starred: z.boolean().optional(),
      title: z.string().optional(),
      jobUrl: z.string().optional(),
      upworkJobId: z.string().optional(),
      budget: z.string().optional(),
      duration: z.string().optional(),
      skills: z.array(z.string()).optional(),
      source: z.enum(["upwork_feed", "text"]).optional(),
    }),
  ),
});

const deleteManySchema = z.object({
  ids: z.array(z.string().min(1)),
});

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search") ?? undefined;
  const viable = params.get("viable");
  const starred = params.get("starred");

  const entries = dbGetAll({
    search,
    viable: viable === "true" ? true : viable === "false" ? false : undefined,
    starred: starred === "true" ? true : starred === "false" ? false : undefined,
  });

  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = insertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  const entries = parsed.data.entries as unknown as SavedEvaluation[];
  if (entries.length === 1) {
    dbInsert(entries[0]);
  } else {
    dbInsertMany(entries);
  }

  return NextResponse.json({ ok: true, count: entries.length });
}

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = deleteManySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  dbDeleteMany(parsed.data.ids);
  return NextResponse.json({ ok: true });
}
