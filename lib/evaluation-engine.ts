import type { EvalMode } from "@/types";
import { NextResponse } from "next/server";
import { extractFromUpworkHtml } from "@/lib/extractUpworkHtml";
import { looksLikeHtml, normalizeJobText } from "@/lib/normalizeJobInput";
import { appendEvaluationLog } from "@/lib/evaluationLogger";
import { extractIp, isRateLimited } from "@/lib/rateLimit";
import { openRouterChat } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-client";
import { parseJsonStrict, isLikelyGerman } from "@/lib/eval-validator";
import { getCached, setCache, jobTextHash } from "@/lib/eval-cache";
import { evaluateRequestSchema } from "@/lib/schemas";
import { dbMarkSeen } from "@/lib/db";
import { extractUpworkJobId } from "@/lib/upwork-job-id";
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
  EVAL_JOB_TTL_MS,
  EVAL_JOB_GC_INTERVAL_MS,
  LLM_TEMPERATURE,
  LLM_MAX_TOKENS,
  LLM_RESPONSE_FORMAT,
} from "@/lib/constants";

// ── Types ──

export type EvaluationMode = EvalMode;

type EvalJobStatus = "queued" | "running" | "done" | "error";
type EvalJobRecord = {
  id: string;
  status: EvalJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: unknown;
  jobTextUsed?: string;
  quality?: unknown;
};

type BaseQuality = {
  winnerModel: string;
  winnerLatencyMs: number;
  loserAborted: boolean;
  emptyContentSeen: boolean;
  deadlineHit: boolean;
  usedRepair: boolean;
  isGerman: boolean;
  wasJsonValidFirstTry: boolean;
};

type EvalSuccess = {
  ok: true;
  result: unknown;
  jobTextUsed: string;
  quality: Record<string, unknown>;
};

type EvalFailure = {
  ok: false;
  error: string;
  quality: { deadlineHit: boolean; emptyContentSeen: boolean };
};

export interface EvalEngineConfig {
  mode: EvaluationMode;
  getSystemPrompt: (jobType?: string, offerTemplate?: string) => string;
  repairPrompt: string;
  validate: (parsed: unknown) => { ok: true; result: unknown } | { ok: false; errors: string[] };
  validateLoose: (parsed: unknown) => unknown | null;
  computeQuality?: (result: unknown, jobText: string, base: BaseQuality) => Record<string, unknown>;
  buildLogMeta: (metaRaw: unknown) => Record<string, unknown> | undefined;
  getGermanCheckText: (result: unknown) => string;
  cacheNamespace: string;
  globalStoreKey: string;
}

// ── Helpers ──

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const JOB_TTL_MS = EVAL_JOB_TTL_MS;
const GC_INTERVAL_MS = EVAL_JOB_GC_INTERVAL_MS;

function getOrCreateJobStore(key: string): Map<string, EvalJobRecord> {
  const g = globalThis as unknown as Record<string, Map<string, EvalJobRecord> | undefined>;
  if (!g[key]) g[key] = new Map<string, EvalJobRecord>();
  return g[key]!;
}

function ensureGc(storeKey: string, timerKey: string) {
  const g = globalThis as unknown as Record<string, ReturnType<typeof setInterval> | undefined>;
  if (!g[timerKey]) {
    g[timerKey] = setInterval(() => {
      const store = getOrCreateJobStore(storeKey);
      const cutoff = Date.now() - JOB_TTL_MS;
      store.forEach((rec, id) => {
        if (rec.updatedAt < cutoff && (rec.status === "done" || rec.status === "error")) {
          store.delete(id);
        }
      });
    }, GC_INTERVAL_MS);
  }
}

function makeEvalJobId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Engine Factory ──

export function createEvalEngine(config: EvalEngineConfig) {
  const evalJobs = getOrCreateJobStore(config.globalStoreKey);
  ensureGc(config.globalStoreKey, `${config.globalStoreKey}__gc`);

  // If an async job finishes extremely quickly (e.g. immediate provider failure),
  // a second POST with identical text can arrive after status flips to done/error.
  // Dedup those very-recent completions to avoid duplicate evaluations and flaky UX.
  const RECENT_COMPLETION_DEDUP_MS = 5_000;

  // Normalize for dedup comparisons. Must match the intent of eval-cache normalization,
  // but we keep it local to avoid leaking internal cache helpers.
  const normalizeForDedup = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

  const llmParams = {
    temperature: LLM_TEMPERATURE,
    max_tokens: LLM_MAX_TOKENS,
    response_format: LLM_RESPONSE_FORMAT,
  };

  async function evaluateWithPolicy(params: {
    apiKey: string;
    jobText: string;
    primaryModel: string;
    fallbackModel: string;
    repairEnabled: boolean;
    hedgeEnabled: boolean;
    deadlineMs: number;
    requestTimeoutMs: number;
    jobType?: string;
    offerTemplate?: string;
  }): Promise<EvalSuccess | EvalFailure> {
    const startedAt = Date.now();
    const deadlineAt = startedAt + params.deadlineMs;
    const timeLeftMs = () => Math.max(0, deadlineAt - Date.now());

    const deadlineCtrl = new AbortController();
    const deadlineTimer = setTimeout(() => deadlineCtrl.abort(), params.deadlineMs);

    const systemPrompt = config.getSystemPrompt(params.jobType, params.offerTemplate);
    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt, cache_control: { type: "ephemeral" } },
      { role: "user", content: params.jobText },
    ];

    const quality: BaseQuality = {
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

      const detailed = parsed
        ? config.validate(parsed)
        : { ok: false as const, errors: ["Kein gültiges JSON."] };
      if (detailed.ok) return { ok: true as const, result: detailed.result };

      if (!params.repairEnabled || timeLeftMs() < REPAIR_MIN_TIME_LEFT_MS) return { ok: false as const };
      quality.usedRepair = true;

      const errorList = !detailed.ok ? detailed.errors.map((e) => `- ${e}`).join("\n") : "- Unbekannter Fehler";
      const repairUser =
        `JOBTEXT:\n${params.jobText}\n\nFEHLER:\n${errorList}\n\nFEHLERHAFTE_ANTWORT (bitte reparieren):\n${cleaned}`;

      const repaired = await openRouterChat({
        apiKey: params.apiKey,
        model: p.model,
        messages: [
          { role: "system", content: config.repairPrompt },
          { role: "user", content: repairUser },
        ],
        timeoutMs: Math.min(params.requestTimeoutMs, Math.max(REPAIR_MIN_TIME_LEFT_MS, timeLeftMs() - 200)),
        signal: p.modelSignal,
        llmParams,
      });
      if (!repaired.ok || !repaired.content) return { ok: false as const };
      const p2 = parseJsonStrict(repaired.content);
      if (!p2.ok) return { ok: false as const };
      const r2 = config.validateLoose(p2.parsed);
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
        llmParams,
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

    let winner: { model: string; result: unknown; latencyMs: number } | null = null;

    while (active.length > 0 && timeLeftMs() > 0 && !deadlineCtrl.signal.aborted) {
      const raced = await Promise.race(active.map((p, idx) => wrapRace(p, idx)));
      active.splice(raced.idx, 1);
      if (!raced.ok) continue;
      const out = raced.v as Awaited<ReturnType<typeof callModel>>;
      if (out.ok && out.content) {
        const modelSignal = out.model === params.primaryModel ? primaryCtrl.signal : fallbackCtrl.signal;
        const v = await validateAndMaybeRepair({ model: out.model, content: out.content, modelSignal });
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
        error: "Zeitlimit erreicht. Die KI-API war zu langsam oder hat keine gültige Antwort geliefert.",
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
    quality.isGerman = isLikelyGerman(config.getGermanCheckText(winner.result));

    const finalQuality = config.computeQuality
      ? config.computeQuality(winner.result, params.jobText, quality)
      : { ...quality };

    return { ok: true, result: winner.result, jobTextUsed: params.jobText, quality: finalQuality };
  }

  function markSeenBestEffort(jobText: string, logMeta: Record<string, unknown> | undefined) {
    try {
      const upworkJobId =
        (logMeta && typeof logMeta.jobUrl === "string"
          ? extractUpworkJobId(String(logMeta.jobUrl))
          : undefined) ?? extractUpworkJobId(jobText);
      dbMarkSeen([{ hash: jobTextHash(jobText), upworkJobId }]);
    } catch { /* best-effort */ }
  }

  async function logResult(r: EvalSuccess, logMeta: Record<string, unknown> | undefined) {
    await appendEvaluationLog({
      jobTextUsed: r.jobTextUsed,
      result: r.result as Parameters<typeof appendEvaluationLog>[0]["result"],
      model: (r.quality as Record<string, unknown>).winnerModel as string,
      meta: logMeta as Parameters<typeof appendEvaluationLog>[0]["meta"],
      quality: r.quality as Parameters<typeof appendEvaluationLog>[0]["quality"],
    });
  }

  // ── GET: Poll job status ──

  async function GET(request: Request) {
    const url = new URL(request.url);
    const id = url.searchParams.get("jobId")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Bitte jobId angeben." }, { status: 400 });
    }
    const rec = evalJobs.get(id);
    if (!rec) {
      return NextResponse.json({ error: "Unbekannte jobId (evtl. Server-Neustart)." }, { status: 404 });
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

  // ── POST: Start evaluation ──

  async function POST(request: Request) {
    const ip = extractIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte kurz warten." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
    }

    const parsed = evaluateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." }, { status: 400 });
    }

    const rawJob = parsed.data.jobText.trim();
    const metaRaw = parsed.data.meta;
    const asyncMode = parsed.data.async;
    const jobType = parsed.data.jobType;
    const offerTemplate = parsed.data.offerTemplate;

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

    const logMeta = config.buildLogMeta(metaRaw);

    const cached = getCached(jobText, config.cacheNamespace);
    if (cached) {
      if (asyncMode) {
        const jobId = makeEvalJobId();
        const now = Date.now();
        evalJobs.set(jobId, {
          id: jobId, status: "done", createdAt: now, updatedAt: now,
          result: cached.result,
          jobTextUsed: cached.jobTextUsed,
          quality: cached.quality,
        });
        return NextResponse.json({ jobId }, { status: 202 });
      }
      return NextResponse.json({ ...(cached.result as object), jobTextUsed: cached.jobTextUsed });
    }

    try {
      if (asyncMode) {
        const norm = normalizeForDedup(jobText);
        const textHash = jobTextHash(norm);
        let existingJobId: string | null = null;
        evalJobs.forEach((rec, id) => {
          if (existingJobId) return;
          const inFlight = rec.status === "queued" || rec.status === "running";
          const recentlyCompleted =
            (rec.status === "done" || rec.status === "error") &&
            Date.now() - rec.updatedAt <= RECENT_COMPLETION_DEDUP_MS;
          if (inFlight || recentlyCompleted) {
            const recNorm = rec.jobTextUsed ? normalizeForDedup(rec.jobTextUsed) : null;
            if (!recNorm) return;
            // Compare both hash and normalized text to prevent rare hash collisions.
            const recHash = jobTextHash(recNorm);
            if (recHash === textHash && recNorm === norm) existingJobId = id;
          }
        });
        if (existingJobId) {
          return NextResponse.json({ jobId: existingJobId }, { status: 202 });
        }

        const jobId = makeEvalJobId();
        const now = Date.now();
        evalJobs.set(jobId, { id: jobId, status: "queued", createdAt: now, updatedAt: now, jobTextUsed: norm });

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
              jobType, offerTemplate,
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

            setCache(jobText, r.result, r.jobTextUsed, r.quality, config.cacheNamespace);
            markSeenBestEffort(jobText, logMeta);
            await logResult(r, logMeta);
          } catch (e) {
            const r = evalJobs.get(jobId);
            if (!r) return;
            r.status = "error";
            r.updatedAt = Date.now();
            r.error = e && typeof e === "object" && "message" in e
              ? String((e as { message: unknown }).message)
              : "Async evaluation failed.";
          }
        })();

        return NextResponse.json({ jobId }, { status: 202 });
      }

      // Sync path
      const r = await evaluateWithPolicy({
        apiKey, jobText, primaryModel, fallbackModel, repairEnabled, hedgeEnabled,
        deadlineMs, requestTimeoutMs, jobType, offerTemplate,
      });

      if (!r.ok) {
        return NextResponse.json({ error: r.error }, { status: 502 });
      }

      setCache(jobText, r.result, r.jobTextUsed, r.quality, config.cacheNamespace);
      markSeenBestEffort(jobText, logMeta);
      await logResult(r, logMeta);

      return NextResponse.json({ ...(r.result as object), jobTextUsed: r.jobTextUsed });
    } catch (e) {
      console.error(e);
      return NextResponse.json({
        error: e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Bewertung fehlgeschlagen.",
      }, { status: 500 });
    }
  }

  return { GET, POST, evaluateWithPolicy };
}
