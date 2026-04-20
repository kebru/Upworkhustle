import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbUpdate, dbDelete, dbGetById } from "@/lib/db";

const patchSchema = z.object({
  tags: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const entry = dbGetById(params.id);
  if (!entry) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ entry });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  dbUpdate(params.id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  dbDelete(params.id);
  return NextResponse.json({ ok: true });
}
