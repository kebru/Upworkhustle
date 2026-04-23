import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openRouterChat } from "@/lib/llm-client";
import { buildOfferPrompt } from "@/lib/offer-prompt";
import { dbGetById } from "@/lib/db";
import { OFFER_MODEL_DEFAULT } from "@/lib/constants";
import type { EvaluationResultQuickCash } from "@/types";

const schema = z.union([
  z.object({
    evaluationId: z.string().min(1),
    hourlyRate: z.string().optional(),
    tone: z.enum(["direkt", "freundlich", "professionell"]).optional(),
  }),
  z.object({
    jobSnippet: z.string().min(1),
    evaluation: z.record(z.string(), z.unknown()),
    title: z.string().optional(),
    budget: z.string().optional(),
    skills: z.array(z.string()).optional(),
    hourlyRate: z.string().optional(),
    tone: z.enum(["direkt", "freundlich", "professionell"]).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY nicht konfiguriert." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let jobText: string;
  let evaluation: EvaluationResultQuickCash;
  let title: string | undefined;
  let budget: string | undefined;
  let skills: string[] | undefined;
  const hourlyRate = data.hourlyRate;
  const tone = data.tone;

  if ("evaluationId" in data) {
    const entry = dbGetById(data.evaluationId);
    if (!entry) {
      return NextResponse.json({ error: "Evaluation nicht gefunden." }, { status: 404 });
    }
    jobText = entry.jobSnippet;
    evaluation = entry.evaluation as EvaluationResultQuickCash;
    title = entry.title;
    budget = entry.budget;
    skills = entry.skills;
  } else {
    jobText = data.jobSnippet;
    evaluation = data.evaluation as unknown as EvaluationResultQuickCash;
    title = data.title;
    budget = data.budget;
    skills = data.skills;
  }

  const model = process.env.OPENROUTER_OFFER_MODEL || OFFER_MODEL_DEFAULT;
  const fallbackModel =
    process.env.OPENROUTER_MODEL_FALLBACK ||
    process.env.OPENROUTER_MODEL_PRIMARY ||
    model;

  const messages = buildOfferPrompt({ jobText, evaluation, title, budget, skills, hourlyRate, tone });

  const result = await openRouterChat({
    apiKey,
    model,
    messages,
    timeoutMs: 30_000,
    llmParams: { temperature: 0.5, max_tokens: 2048 },
  });

  if ((!result.ok || !result.content) && result.status === 400 && fallbackModel !== model) {
    const retry = await openRouterChat({
      apiKey,
      model: fallbackModel,
      messages,
      timeoutMs: 30_000,
      llmParams: { temperature: 0.5, max_tokens: 2048 },
    });
    if (!retry.ok || !retry.content) {
      return NextResponse.json(
        { error: retry.rawText ?? result.rawText ?? "LLM-Anfrage fehlgeschlagen." },
        { status: 502 },
      );
    }
    return NextResponse.json({ offer: retry.content.trim() });
  }

  if (!result.ok || !result.content) {
    return NextResponse.json(
      { error: result.rawText ?? "LLM-Anfrage fehlgeschlagen." },
      { status: 502 },
    );
  }

  return NextResponse.json({ offer: result.content.trim() });
}
