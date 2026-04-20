import { NextResponse } from "next/server";
import { extractFromUpworkHtml } from "@/lib/extractUpworkHtml";
import { looksLikeHtml, normalizeJobText } from "@/lib/normalizeJobInput";
import { appendEvaluationLog } from "@/lib/evaluationLogger";
import { parseEvaluationResultV2 } from "@/lib/parseEvaluationResult";

type EvalJobStatus = "queued" | "running" | "done" | "error";
type EvalJobRecord = {
  id: string;
  status: EvalJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: ReturnType<typeof parseEvaluationResultV2>;
  jobTextUsed?: string;
  quality?: unknown;
};

// NOTE: In-memory queue for local/dev MVP. Not durable across server restarts.
// Use globalThis to survive dev hot reload/module re-evaluation.
const evalJobs: Map<string, EvalJobRecord> = (() => {
  const g = globalThis as unknown as { __upworkEvalJobs?: Map<string, EvalJobRecord> };
  if (!g.__upworkEvalJobs) g.__upworkEvalJobs = new Map<string, EvalJobRecord>();
  return g.__upworkEvalJobs;
})();

const SYSTEM_PROMPT = `Du bewertest Upwork Jobs für ein Sidehustle-Projekt.

Wichtig: \"lösbar mit Cursor & Vibe Coding\" hat ZWEI Modi:
1) BUILD (<=20h, strikt): Solo-Sidehustle, klarer Scope, wenige Integrationen, kein On-call/Enterprise, kein laufender Betrieb.
2) CONSULTING (Setup+Handover): No-Code/Automation (Zapier/n8n/Make/Retool etc.) ist OK, aber nur wenn klar abgegrenzt (Setup, Tests, Doku, Übergabe) und KEINE dauerhafte Wartung/Support/On-call.

Dein Output muss extrem praktisch sein: Go/No-Go, konkrete Rückfragen, nächste Schritte, Angebotstext, Preis & Timeline.

Regeln (hart):
- Antworte vollständig auf Deutsch.
- Nur EIN gültiges JSON-Objekt. Kein Markdown. Kein Text außerhalb von JSON.
- Keine Platzhalter wie \"N/A\" oder \"nicht anwendbar\".
- risks: 3-7, next_steps: 5-8, clarifying_questions: 3-8.
- offer_message: kurz, Upwork-fertig (<= 1200 Zeichen).

Ankerbeispiele BUILD viable_build_20h=true:
- \"Bugfix in kleinem Repo\", \"kleines Next.js UI Feature\", \"Landingpage\", \"CSV Import + Validierung\".

Ankerbeispiele CONSULTING viable_consulting=true (aber build kann false sein):
- \"Zapier Workflow Setup + Doku\", \"n8n Workflow Debug + Handover\", \"Make.com Szenario bauen + Logging\".

Beispiele NON-viable (beide false):
- \"Enterprise Legacy Codebase lesen & dokumentieren\", \"On-call Production Bugs\", \"unbekanntes broken system ohne klaren Zustand\", \"Meeting bot / streaming / multi-platform OAuth\".

Antwort-Schema (exakt diese Keys, Scores als number 1..10):
{
  \"viable_build_20h\": boolean,
  \"viable_consulting\": boolean,
  \"confidence\": number,
  \"effort_hours\": \"z.B. 4-8 oder 12-20\",
  \"timeline_days\": \"z.B. 2-4\",
  \"price_range\": \"z.B. 300-600\",
  \"overall_score\": number,
  \"criteria\": {
    \"scope_clarity\": number,
    \"low_integration_ops_complexity\": number,
    \"solo_delivery_fit\": number
  },
  \"risks\": [\"...\"],
  \"next_steps\": [\"...\"],
  \"clarifying_questions\": [\"...\"],
  \"offer_message\": \"...\",\n  \"learning_path\": [\"...\"],
  \"reasoning\": \"...\",\n  \"steps\": [\"...\"],
  \"viable\": boolean
}`; 

const PRIMARY_MODEL_DEFAULT = "google/gemini-3-flash-preview";
const FALLBACK_MODEL_DEFAULT = "openai/gpt-5.4-mini";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    const firstNl = s.indexOf("\n");
    if (firstNl !== -1) {
      s = s.slice(firstNl + 1);
    }
    const endFence = s.lastIndexOf("```");
    if (endFence !== -1) {
      s = s.slice(0, endFence);
    }
  }
  return s.trim();
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isLikelyGerman(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const cjk = (t.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  if (cjk >= 4) return false;

  const lower = t.toLowerCase();
  const hits =
    (lower.match(/\b(und|oder|nicht|dass|für|mit|ohne|bitte|kann|könnte|soll|muss|aufwand|anforderungen)\b/g) ?? [])
      .length + (lower.includes("ß") ? 1 : 0) + (/[äöü]/.test(lower) ? 1 : 0);
  return hits >= 2;
}

function hasBadPlaceholders(result: {
  effort_hours: string;
  risks: string[];
  steps: string[];
  reasoning: string;
}): boolean {
  const joined = [result.effort_hours, result.reasoning, ...result.risks, ...result.steps]
    .join("\n")
    .toLowerCase();
  return (
    /\bn\/a\b/.test(joined) ||
    /nicht\s+anwendbar/.test(joined) ||
    /\bnicht-anwendbar\b/.test(joined) ||
    /not applicable/.test(joined) ||
    /na -/.test(joined)
  );
}

function isSchemaGoodEnough(result: {
  risks: string[];
  next_steps: string[];
  clarifying_questions: string[];
  offer_message: string;
  reasoning: string;
}): boolean {
  if (!Array.isArray(result.risks)) return false;
  if (result.risks.length < 3) return false;
  if (!Array.isArray(result.next_steps) || result.next_steps.length < 5) return false;
  if (!Array.isArray(result.clarifying_questions) || result.clarifying_questions.length < 3) return false;
  if (typeof result.offer_message !== "string" || result.offer_message.trim().length < 80) return false;
  if (result.offer_message.length > 1200) return false;
  if (typeof result.reasoning !== "string" || result.reasoning.trim().length < 20) {
    return false;
  }
  return true;
}

async function openRouterChat(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  status: number;
  rawText?: string;
  content?: string;
  emptyContent?: boolean;
}> {
  const ctrl = new AbortController();
  // Use AbortSignal.timeout when available to make timeouts reliable.
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AbortSignal as any).timeout(params.timeoutMs)
      : null;
  const timeoutId =
    !timeoutSignal ? setTimeout(() => ctrl.abort(), params.timeoutMs) : null;
  if (params.signal) {
    if (params.signal.aborted) ctrl.abort();
    else params.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const signal =
    timeoutSignal && typeof AbortSignal !== "undefined" && "any" in AbortSignal
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AbortSignal as any).any([ctrl.signal, timeoutSignal])
      : ctrl.signal;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Upwork Job Evaluator",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
      }),
      signal,
    });

    if (ctrl.signal.aborted) {
      return { ok: false, status: 504, rawText: "timeout", emptyContent: false };
    }
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, rawText };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return { ok: false, status: 502, rawText };
    }

    const p = payload as {
      choices?: { message?: { content?: string; reasoning?: string; text?: string } }[];
      usage?: unknown;
    };
    const msg = p.choices?.[0]?.message;
    const content =
      (typeof msg?.content === "string" ? msg.content : undefined) ??
      // Some providers put text into non-standard fields.
      (typeof msg?.text === "string" ? msg.text : undefined) ??
      (typeof msg?.reasoning === "string" ? msg.reasoning : undefined);
    if (typeof content !== "string" || !content.trim()) {
      console.error("OpenRouter empty content payload:", payload);
      return { ok: false, status: 502, rawText, emptyContent: true };
    }
    return { ok: true, status: 200, content };
  } catch (e) {
    const aborted = e && typeof e === "object" && "name" in e && (e as { name: unknown }).name === "AbortError";
    return { ok: false, status: aborted ? 504 : 502, rawText: aborted ? "timeout" : String(e) };
  } finally {
    ctrl.abort();
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function evaluateWithPolicy(params: {
  apiKey: string;
  jobText: string;
  primaryModel: string;
  fallbackModel: string;
  repairEnabled: boolean;
  hedgeEnabled: boolean;
  deadlineMs: number;
  requestTimeoutMs: number;
}): Promise<
  | {
      ok: true;
      result: NonNullable<ReturnType<typeof parseEvaluationResultV2>>;
      jobTextUsed: string;
      quality: {
        winnerModel: string;
        winnerLatencyMs: number;
        loserAborted: boolean;
        emptyContentSeen: boolean;
        deadlineHit: boolean;
        usedRepair: boolean;
        isGerman: boolean;
        wasJsonValidFirstTry: boolean;
      };
    }
  | { ok: false; error: string; quality: { deadlineHit: boolean; emptyContentSeen: boolean } }
> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + params.deadlineMs;
  const timeLeftMs = () => Math.max(0, deadlineAt - Date.now());

  const deadlineCtrl = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineCtrl.abort(), params.deadlineMs);
  const baseMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: params.jobText },
  ];

  const quality = {
    usedRepair: false,
    isGerman: false,
    wasJsonValidFirstTry: false,
    winnerModel: params.primaryModel,
    winnerLatencyMs: -1,
    loserAborted: false,
    emptyContentSeen: false,
    deadlineHit: false,
  };

  const parseJsonStrict = (
    raw: string,
  ):
    | { ok: true; parsed: unknown; cleaned: string }
    | { ok: false; cleaned: string } => {
    const cleaned = stripMarkdownFences(raw);
    try {
      return { ok: true, parsed: JSON.parse(cleaned), cleaned };
    } catch {
      return { ok: false, cleaned };
    }
  };

  const validateAndMaybeRepair = async (p: {
    model: string;
    content: string;
    modelSignal: AbortSignal;
  }) => {
    const first = parseJsonStrict(p.content);
    quality.wasJsonValidFirstTry = quality.wasJsonValidFirstTry || first.ok;

    const parsed = first.ok ? first.parsed : null;
    const cleaned = first.cleaned;
    const result = parseEvaluationResultV2(parsed);
    if (
      result &&
      isSchemaGoodEnough(result) &&
      !hasBadPlaceholders(result) &&
      isLikelyGerman([result.reasoning, ...result.steps, ...result.risks].join("\n"))
    ) {
      return { ok: true as const, result };
    }

    if (!params.repairEnabled || timeLeftMs() < 2_000) return { ok: false as const };
    quality.usedRepair = true;

    const repairSystem =
      `Du bist ein JSON-Repair-Tool.\n\n` +
      `Ziel: Gib EXAKT ein einziges gültiges JSON-Objekt im selben Schema aus.\n` +
      `Regeln:\n` +
      `- Nur JSON (kein Markdown, kein Text außenrum)\n` +
      `- Vollständig auf Deutsch\n` +
      `- steps: 4-7 konkrete Schritte (niemals \"nicht anwendbar\")\n` +
      `- risks: 3-7 konkrete Risiken\n` +
      `- keine Platzhalter wie \"N/A\" oder \"nicht anwendbar\"`;
    const repairUser =
      `JOBTEXT:\n${params.jobText}\n\n` +
      `FEHLERHAFTE_ANTWORT (bitte reparieren):\n${cleaned}`;

    const repaired = await openRouterChat({
      apiKey: params.apiKey,
      model: p.model,
      messages: [
        { role: "system", content: repairSystem },
        { role: "user", content: repairUser },
      ],
      timeoutMs: Math.min(params.requestTimeoutMs, Math.max(2_000, timeLeftMs() - 200)),
      signal: p.modelSignal,
    });
    if (!repaired.ok || !repaired.content) return { ok: false as const };
    const p2 = parseJsonStrict(repaired.content);
    if (!p2.ok) return { ok: false as const };
    const r2 = parseEvaluationResultV2(p2.parsed);
    if (
      r2 &&
      isSchemaGoodEnough(r2) &&
      !hasBadPlaceholders(r2) &&
      isLikelyGerman([r2.reasoning, ...r2.steps, ...r2.risks].join("\n"))
    ) {
      return { ok: true as const, result: r2 };
    }
    return { ok: false as const };
  };

  const callModel = async (p: { model: string; controller: AbortController }) => {
    const t0 = Date.now();
    const r = await openRouterChat({
      apiKey: params.apiKey,
      model: p.model,
      messages: baseMessages,
      timeoutMs: Math.min(params.requestTimeoutMs, Math.max(2_000, timeLeftMs())),
      signal: p.controller.signal,
    });
    const latencyMs = Date.now() - t0;
    if (r.emptyContent) quality.emptyContentSeen = true;
    return { model: p.model, ...r, latencyMs };
  };

  const primaryCtrl = new AbortController();
  const fallbackCtrl = new AbortController();

  const active: Array<ReturnType<typeof callModel>> = [];
  active.push(callModel({ model: params.primaryModel, controller: primaryCtrl }));
  if (params.hedgeEnabled) {
    active.push(callModel({ model: params.fallbackModel, controller: fallbackCtrl }));
  }
  let fallbackLaunched = params.hedgeEnabled;

  const wrapRace = <T,>(p: Promise<T>, idx: number) =>
    p.then(
      (v) => ({ idx, ok: true as const, v }),
      (e) => ({ idx, ok: false as const, e }),
    );

  let winner:
    | { model: string; result: NonNullable<ReturnType<typeof parseEvaluationResultV2>>; latencyMs: number }
    | null = null;

  while (active.length > 0 && timeLeftMs() > 0 && !deadlineCtrl.signal.aborted) {
    const raced = await Promise.race(active.map((p, idx) => wrapRace(p, idx)));
    active.splice(raced.idx, 1);
    if (!raced.ok) continue;
    const out = raced.v as Awaited<ReturnType<typeof callModel>>;
    if (out.ok && out.content) {
      const modelSignal =
        out.model === params.primaryModel ? primaryCtrl.signal : fallbackCtrl.signal;
      const v = await validateAndMaybeRepair({
        model: out.model,
        content: out.content,
        modelSignal,
      });
      if (v.ok) {
        winner = { model: out.model, result: v.result, latencyMs: out.latencyMs };
        break;
      }
    } else if (!fallbackLaunched && timeLeftMs() > 0) {
      fallbackLaunched = true;
      active.push(callModel({ model: params.fallbackModel, controller: fallbackCtrl }));
    }
  }

  clearTimeout(deadlineTimer);

  if (!winner) {
    quality.deadlineHit = true;
    return {
      ok: false,
      error:
        "Zeitlimit erreicht. Die KI-API war zu langsam oder hat keine gültige Antwort geliefert.",
      quality: { deadlineHit: true, emptyContentSeen: quality.emptyContentSeen },
    };
  }

  // Abort loser (best-effort)
  if (winner.model === params.primaryModel) {
    if (!fallbackCtrl.signal.aborted) {
      fallbackCtrl.abort();
      quality.loserAborted = true;
    }
  } else {
    if (!primaryCtrl.signal.aborted) {
      primaryCtrl.abort();
      quality.loserAborted = true;
    }
  }

  quality.winnerModel = winner.model;
  quality.winnerLatencyMs = winner.latencyMs;
  quality.isGerman = isLikelyGerman(
    [winner.result.reasoning, ...winner.result.steps, ...winner.result.risks].join("\n"),
  );

  return { ok: true, result: winner.result, jobTextUsed: params.jobText, quality };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("jobId")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Bitte jobId angeben." }, { status: 400 });
  }
  const rec = evalJobs.get(id);
  if (!rec) {
    return NextResponse.json(
      { error: "Unbekannte jobId (evtl. Server-Neustart)." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    jobId: rec.id,
    status: rec.status,
    error: rec.error,
    result: rec.result ?? undefined,
    jobTextUsed: rec.jobTextUsed,
    quality: rec.quality,
  });
}

function makeEvalJobId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
  }

  const rawJob =
    body &&
    typeof body === "object" &&
    "jobText" in body &&
    typeof (body as { jobText: unknown }).jobText === "string"
      ? (body as { jobText: string }).jobText.trim()
      : "";

  const metaRaw =
    body && typeof body === "object" && "meta" in body
      ? (body as { meta: unknown }).meta
      : undefined;

  const asyncMode =
    body &&
    typeof body === "object" &&
    "async" in body &&
    typeof (body as { async: unknown }).async === "boolean"
      ? (body as { async: boolean }).async
      : false;

  if (!rawJob) {
    return NextResponse.json(
      { error: "Bitte einen Jobtext (jobText) angeben." },
      { status: 400 },
    );
  }

  let toNormalize = rawJob;
  if (looksLikeHtml(rawJob)) {
    const extracted = extractFromUpworkHtml(rawJob);
    if (extracted && extracted.length >= 80) {
      toNormalize = extracted;
    }
  }

  const jobText = normalizeJobText(toNormalize);
  if (!jobText) {
    return NextResponse.json(
      {
        error:
          "Nach Bereinigung war kein lesbarer Jobtext übrig. Bitte Titel und Beschreibung als Text einfügen oder weniger Seiten-HTML.",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Server-Konfiguration unvollständig: OPENROUTER_API_KEY fehlt.",
      },
      { status: 500 },
    );
  }

  const primaryModel =
    process.env.OPENROUTER_MODEL_PRIMARY?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    PRIMARY_MODEL_DEFAULT;
  const fallbackModel =
    process.env.OPENROUTER_MODEL_FALLBACK?.trim() || FALLBACK_MODEL_DEFAULT;
  const repairEnabled = envInt("OPENROUTER_REPAIR", 1) !== 0;
  const hedgeEnabled = envInt("OPENROUTER_HEDGE", 1) !== 0;
  const deadlineMs = Math.max(3_000, Math.min(30_000, envInt("OPENROUTER_DEADLINE_MS", 10_000)));
  const requestTimeoutMs = Math.max(
    2_000,
    Math.min(30_000, envInt("OPENROUTER_REQUEST_TIMEOUT_MS", 9_000)),
  );

  try {
    if (asyncMode) {
      const jobId = makeEvalJobId();
      const now = Date.now();
      evalJobs.set(jobId, {
        id: jobId,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      });

      // Fire-and-forget background evaluation (no await).
      void (async () => {
        const rec = evalJobs.get(jobId);
        if (!rec) return;
        rec.status = "running";
        rec.updatedAt = Date.now();

        try {
          const asyncDeadlineMs = Math.max(
            10_000,
            Math.min(180_000, envInt("OPENROUTER_ASYNC_DEADLINE_MS", 60_000)),
          );
          const asyncReqTimeoutMs = Math.max(
            5_000,
            Math.min(60_000, envInt("OPENROUTER_ASYNC_REQUEST_TIMEOUT_MS", 25_000)),
          );

          const r = await evaluateWithPolicy({
            apiKey,
            jobText,
            primaryModel,
            fallbackModel,
            repairEnabled,
            hedgeEnabled,
            deadlineMs: asyncDeadlineMs,
            requestTimeoutMs: asyncReqTimeoutMs,
          });

          const rr = evalJobs.get(jobId);
          if (!rr) return;

          if (!r.ok) {
            rr.status = "error";
            rr.updatedAt = Date.now();
            rr.error = r.error;
            rr.quality = r.quality;
            return;
          }

          rr.status = "done";
          rr.updatedAt = Date.now();
          rr.result = r.result;
          rr.jobTextUsed = r.jobTextUsed;
          rr.quality = r.quality;

          const meta =
            metaRaw && typeof metaRaw === "object"
              ? (metaRaw as Record<string, unknown>)
              : undefined;

          await appendEvaluationLog({
            jobTextUsed: r.jobTextUsed,
            result: r.result,
            model: r.quality.winnerModel,
            meta: meta
              ? {
                  source:
                    meta.source === "upwork_feed" || meta.source === "text"
                      ? meta.source
                      : undefined,
                  feedHasMoreToggle:
                    typeof meta.feedHasMoreToggle === "boolean"
                      ? meta.feedHasMoreToggle
                      : undefined,
                  likelyTruncated:
                    typeof meta.likelyTruncated === "boolean"
                      ? meta.likelyTruncated
                      : undefined,
                  descriptionCharLength:
                    typeof meta.descriptionCharLength === "number"
                      ? meta.descriptionCharLength
                      : undefined,
                  jobTextCharLength:
                    typeof meta.jobTextCharLength === "number"
                      ? meta.jobTextCharLength
                      : undefined,
                  wasTrimmed:
                    typeof meta.wasTrimmed === "boolean"
                      ? meta.wasTrimmed
                      : undefined,
                  title: typeof meta.title === "string" ? meta.title : undefined,
                  jobUrl: typeof meta.jobUrl === "string" ? meta.jobUrl : undefined,
                  postedOn:
                    typeof meta.postedOn === "string" ? meta.postedOn : undefined,
                  jobType:
                    typeof meta.jobType === "string" ? meta.jobType : undefined,
                  budget: typeof meta.budget === "string" ? meta.budget : undefined,
                  duration:
                    typeof meta.duration === "string" ? meta.duration : undefined,
                  contractorTier:
                    typeof meta.contractorTier === "string"
                      ? meta.contractorTier
                      : undefined,
                  skillsCount:
                    typeof meta.skillsCount === "number"
                      ? meta.skillsCount
                      : undefined,
                }
              : undefined,
            quality: r.quality,
          });
        } catch (e) {
          const r = evalJobs.get(jobId);
          if (!r) return;
          r.status = "error";
          r.updatedAt = Date.now();
          r.error =
            e && typeof e === "object" && "message" in e
              ? String((e as { message: unknown }).message)
              : "Async evaluation failed.";
        }
      })();

      return NextResponse.json({ jobId }, { status: 202 });
    }

    const r = await evaluateWithPolicy({
      apiKey,
      jobText,
      primaryModel,
      fallbackModel,
      repairEnabled,
      hedgeEnabled,
      deadlineMs,
      requestTimeoutMs,
    });

    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 502 });
    }

    const meta =
      metaRaw && typeof metaRaw === "object"
        ? (metaRaw as Record<string, unknown>)
        : undefined;

    await appendEvaluationLog({
      jobTextUsed: r.jobTextUsed,
      result: r.result,
      model: r.quality.winnerModel,
      meta: meta
        ? {
            source:
              meta.source === "upwork_feed" || meta.source === "text"
                ? meta.source
                : undefined,
            feedHasMoreToggle:
              typeof meta.feedHasMoreToggle === "boolean"
                ? meta.feedHasMoreToggle
                : undefined,
            likelyTruncated:
              typeof meta.likelyTruncated === "boolean"
                ? meta.likelyTruncated
                : undefined,
            descriptionCharLength:
              typeof meta.descriptionCharLength === "number"
                ? meta.descriptionCharLength
                : undefined,
            jobTextCharLength:
              typeof meta.jobTextCharLength === "number"
                ? meta.jobTextCharLength
                : undefined,
            wasTrimmed:
              typeof meta.wasTrimmed === "boolean" ? meta.wasTrimmed : undefined,
            title: typeof meta.title === "string" ? meta.title : undefined,
            jobUrl: typeof meta.jobUrl === "string" ? meta.jobUrl : undefined,
            postedOn:
              typeof meta.postedOn === "string" ? meta.postedOn : undefined,
            jobType:
              typeof meta.jobType === "string" ? meta.jobType : undefined,
            budget: typeof meta.budget === "string" ? meta.budget : undefined,
            duration:
              typeof meta.duration === "string" ? meta.duration : undefined,
            contractorTier:
              typeof meta.contractorTier === "string"
                ? meta.contractorTier
                : undefined,
            skillsCount:
              typeof meta.skillsCount === "number" ? meta.skillsCount : undefined,
          }
        : undefined,
      quality: r.quality,
    });

    return NextResponse.json({
      ...r.result,
      /** Exakt der Text, der ans Modell ging (nach Server-Normalisierung). */
      jobTextUsed: r.jobTextUsed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error:
          "Ein unerwarteter Fehler ist aufgetreten. Bitte erneut versuchen.",
      },
      { status: 500 },
    );
  }
}
