import { NextResponse } from "next/server";
import { extractFromUpworkHtml } from "@/lib/extractUpworkHtml";
import { looksLikeHtml, normalizeJobText } from "@/lib/normalizeJobInput";
import { appendEvaluationLog } from "@/lib/evaluationLogger";
import { parseEvaluationResultV2 } from "@/lib/parseEvaluationResult";
import { extractIp, isRateLimited } from "@/lib/rateLimit";
import { openRouterChat } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-client";
import { SYSTEM_PROMPT, REPAIR_SYSTEM_PROMPT } from "@/lib/eval-prompts";
import { parseJsonStrict, validateResult, isLikelyGerman } from "@/lib/eval-validator";
import { getCached, setCache } from "@/lib/eval-cache";
import { evaluateRequestSchema } from "@/lib/schemas";
import {
  PRIMARY_MODEL_DEFAULT,
  FALLBACK_MODEL_DEFAULT,
  DEFAULT_DEADLINE_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MIN_DEADLINE_MS,
  MAX_DEADLINE_MS,
  MIN_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
  REPAIR_MIN_TIME_LEFT_MS,
  ASYNC_DEFAULT_DEADLINE_MS,
  ASYNC_MIN_DEADLINE_MS,
  ASYNC_MAX_DEADLINE_MS,
  ASYNC_DEFAULT_REQUEST_TIMEOUT_MS,
  ASYNC_MIN_REQUEST_TIMEOUT_MS,
  ASYNC_MAX_REQUEST_TIMEOUT_MS,
} from "@/lib/constants";

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

const evalJobs: Map<string, EvalJobRecord> = (() => {
  const g = globalThis as unknown as { __upworkEvalJobs?: Map<string, EvalJobRecord> };
  if (!g.__upworkEvalJobs) g.__upworkEvalJobs = new Map<string, EvalJobRecord>();
  return g.__upworkEvalJobs;
})();

const JOB_TTL_MS = 10 * 60 * 1000;
const GC_INTERVAL_MS = 5 * 60 * 1000;

function gcEvalJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  evalJobs.forEach((rec, id) => {
    if (rec.updatedAt < cutoff && (rec.status === "done" || rec.status === "error")) {
      evalJobs.delete(id);
    }
  });
}

const gcGlobal = globalThis as unknown as { __upworkGcTimer?: ReturnType<typeof setInterval> };
if (!gcGlobal.__upworkGcTimer) {
  gcGlobal.__upworkGcTimer = setInterval(gcEvalJobs, GC_INTERVAL_MS);
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
    { role: "system", content: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
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

  const validateAndMaybeRepair = async (p: {
    model: string;
    content: string;
    modelSignal: AbortSignal;
  }) => {
    const first = parseJsonStrict(p.content);
    quality.wasJsonValidFirstTry = quality.wasJsonValidFirstTry || first.ok;

    const parsed = first.ok ? first.parsed : null;
    const cleaned = first.cleaned;
    const result = validateResult(parsed);
    if (result) return { ok: true as const, result };

    if (!params.repairEnabled || timeLeftMs() < REPAIR_MIN_TIME_LEFT_MS) return { ok: false as const };
    quality.usedRepair = true;

    const repairUser =
      `JOBTEXT:\n${params.jobText}\n\nFEHLERHAFTE_ANTWORT (bitte reparieren):\n${cleaned}`;

    const repaired = await openRouterChat({
      apiKey: params.apiKey,
      model: p.model,
      messages: [
        { role: "system", content: REPAIR_SYSTEM_PROMPT },
        { role: "user", content: repairUser },
      ],
      timeoutMs: Math.min(params.requestTimeoutMs, Math.max(REPAIR_MIN_TIME_LEFT_MS, timeLeftMs() - 200)),
      signal: p.modelSignal,
    });
    if (!repaired.ok || !repaired.content) return { ok: false as const };
    const p2 = parseJsonStrict(repaired.content);
    if (!p2.ok) return { ok: false as const };
    const r2 = validateResult(p2.parsed);
    if (r2) return { ok: true as const, result: r2 };
    return { ok: false as const };
  };

  const callModel = async (p: { model: string; controller: AbortController }) => {
    const t0 = Date.now();
    const r = await openRouterChat({
      apiKey: params.apiKey,
      model: p.model,
      messages: baseMessages,
      timeoutMs: Math.min(params.requestTimeoutMs, Math.max(REPAIR_MIN_TIME_LEFT_MS, timeLeftMs())),
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

  if (winner.model === params.primaryModel) {
    if (!fallbackCtrl.signal.aborted) { fallbackCtrl.abort(); quality.loserAborted = true; }
  } else {
    if (!primaryCtrl.signal.aborted) { primaryCtrl.abort(); quality.loserAborted = true; }
  }

  quality.winnerModel = winner.model;
  quality.winnerLatencyMs = winner.latencyMs;
  quality.isGerman = isLikelyGerman(
    [winner.result.reasoning, ...winner.result.steps, ...winner.result.risks].join("\n"),
  );

  return { ok: true, result: winner.result, jobTextUsed: params.jobText, quality };
}

function buildLogMeta(metaRaw: unknown): Record<string, unknown> | undefined {
  if (!metaRaw || typeof metaRaw !== "object") return undefined;
  const meta = metaRaw as Record<string, unknown>;
  return {
    source: meta.source === "upwork_feed" || meta.source === "text" ? meta.source : undefined,
    feedHasMoreToggle: typeof meta.feedHasMoreToggle === "boolean" ? meta.feedHasMoreToggle : undefined,
    likelyTruncated: typeof meta.likelyTruncated === "boolean" ? meta.likelyTruncated : undefined,
    descriptionCharLength: typeof meta.descriptionCharLength === "number" ? meta.descriptionCharLength : undefined,
    jobTextCharLength: typeof meta.jobTextCharLength === "number" ? meta.jobTextCharLength : undefined,
    wasTrimmed: typeof meta.wasTrimmed === "boolean" ? meta.wasTrimmed : undefined,
    title: typeof meta.title === "string" ? meta.title : undefined,
    jobUrl: typeof meta.jobUrl === "string" ? meta.jobUrl : undefined,
    postedOn: typeof meta.postedOn === "string" ? meta.postedOn : undefined,
    jobType: typeof meta.jobType === "string" ? meta.jobType : undefined,
    budget: typeof meta.budget === "string" ? meta.budget : undefined,
    duration: typeof meta.duration === "string" ? meta.duration : undefined,
    contractorTier: typeof meta.contractorTier === "string" ? meta.contractorTier : undefined,
    skillsCount: typeof meta.skillsCount === "number" ? meta.skillsCount : undefined,
  };
}

// ── GET: Poll job status ──

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

// ── POST: Start evaluation ──

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

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." },
      { status: 400 },
    );
  }

  const rawJob = parsed.data.jobText.trim();
  const metaRaw = parsed.data.meta;
  const asyncMode = parsed.data.async;

  let toNormalize = rawJob;
  if (looksLikeHtml(rawJob)) {
    const extracted = extractFromUpworkHtml(rawJob);
    if (extracted && extracted.length >= 80) toNormalize = extracted;
  }

  const jobText = normalizeJobText(toNormalize);
  if (!jobText) {
    return NextResponse.json({
      error: "Nach Bereinigung war kein lesbarer Jobtext übrig. Bitte Titel und Beschreibung als Text einfügen oder weniger Seiten-HTML.",
    }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server-Konfiguration unvollständig: OPENROUTER_API_KEY fehlt." }, { status: 500 });
  }

  const primaryModel = process.env.OPENROUTER_MODEL_PRIMARY?.trim() || process.env.OPENROUTER_MODEL?.trim() || PRIMARY_MODEL_DEFAULT;
  const fallbackModel = process.env.OPENROUTER_MODEL_FALLBACK?.trim() || FALLBACK_MODEL_DEFAULT;
  const repairEnabled = envInt("OPENROUTER_REPAIR", 1) !== 0;
  const hedgeEnabled = envInt("OPENROUTER_HEDGE", 1) !== 0;
  const deadlineMs = Math.max(MIN_DEADLINE_MS, Math.min(MAX_DEADLINE_MS, envInt("OPENROUTER_DEADLINE_MS", DEFAULT_DEADLINE_MS)));
  const requestTimeoutMs = Math.max(MIN_REQUEST_TIMEOUT_MS, Math.min(MAX_REQUEST_TIMEOUT_MS, envInt("OPENROUTER_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS)));

  const logMeta = buildLogMeta(metaRaw);

  // Check cache before calling LLM
  const cached = getCached(jobText);
  if (cached) {
    if (asyncMode) {
      const jobId = makeEvalJobId();
      const now = Date.now();
      evalJobs.set(jobId, {
        id: jobId, status: "done", createdAt: now, updatedAt: now,
        result: cached.result as ReturnType<typeof parseEvaluationResultV2>,
        jobTextUsed: cached.jobTextUsed,
        quality: cached.quality,
      });
      return NextResponse.json({ jobId }, { status: 202 });
    }
    return NextResponse.json({ ...cached.result as object, jobTextUsed: cached.jobTextUsed });
  }

  try {
    if (asyncMode) {
      const jobId = makeEvalJobId();
      const now = Date.now();
      evalJobs.set(jobId, { id: jobId, status: "queued", createdAt: now, updatedAt: now });

      void (async () => {
        const rec = evalJobs.get(jobId);
        if (!rec) return;
        rec.status = "running";
        rec.updatedAt = Date.now();

        try {
          const asyncDeadlineMs = Math.max(ASYNC_MIN_DEADLINE_MS, Math.min(ASYNC_MAX_DEADLINE_MS, envInt("OPENROUTER_ASYNC_DEADLINE_MS", ASYNC_DEFAULT_DEADLINE_MS)));
          const asyncReqTimeoutMs = Math.max(ASYNC_MIN_REQUEST_TIMEOUT_MS, Math.min(ASYNC_MAX_REQUEST_TIMEOUT_MS, envInt("OPENROUTER_ASYNC_REQUEST_TIMEOUT_MS", ASYNC_DEFAULT_REQUEST_TIMEOUT_MS)));

          const r = await evaluateWithPolicy({
            apiKey, jobText, primaryModel, fallbackModel, repairEnabled, hedgeEnabled,
            deadlineMs: asyncDeadlineMs, requestTimeoutMs: asyncReqTimeoutMs,
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

          setCache(jobText, r.result, r.jobTextUsed, r.quality);

          await appendEvaluationLog({
            jobTextUsed: r.jobTextUsed,
            result: r.result,
            model: r.quality.winnerModel,
            meta: logMeta as Record<string, unknown> | undefined,
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
      apiKey, jobText, primaryModel, fallbackModel, repairEnabled, hedgeEnabled,
      deadlineMs, requestTimeoutMs,
    });

    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 502 });
    }

    setCache(jobText, r.result, r.jobTextUsed, r.quality);

    await appendEvaluationLog({
      jobTextUsed: r.jobTextUsed,
      result: r.result,
      model: r.quality.winnerModel,
      meta: logMeta as Record<string, unknown> | undefined,
      quality: r.quality,
    });

    return NextResponse.json({
      ...r.result,
      jobTextUsed: r.jobTextUsed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({
      error: "Ein unerwarteter Fehler ist aufgetreten. Bitte erneut versuchen.",
    }, { status: 500 });
  }
}
