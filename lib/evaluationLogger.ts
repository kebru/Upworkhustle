import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { EvaluationResultQuickCash } from "@/types";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "evaluations.jsonl");

function loggingEnabled(): boolean {
  const v = process.env.LOG_EVALUATIONS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type EvaluationLogPayload = {
  jobTextUsed: string;
  result: EvaluationResultQuickCash;
  model: string;
  quality?: {
    winnerModel?: string;
    winnerLatencyMs?: number;
    loserAborted?: boolean;
    emptyContentSeen?: boolean;
    deadlineHit?: boolean;
    usedRepair?: boolean;
    isGerman?: boolean;
    wasJsonValidFirstTry?: boolean;
  };
  meta?: {
    source?: "upwork_feed" | "text";
    feedHasMoreToggle?: boolean;
    likelyTruncated?: boolean;
    descriptionCharLength?: number;
    jobTextCharLength?: number;
    wasTrimmed?: boolean;
    title?: string;
    jobUrl?: string;
    postedOn?: string;
    jobType?: string;
    budget?: string;
    duration?: string;
    contractorTier?: string;
    skillsCount?: number;
  };
};

/**
 * Schreibt eine Zeile JSON (JSON Lines) nach `logs/evaluations.jsonl`.
 * Nur wenn `LOG_EVALUATIONS=1` (oder `true`/`yes`) gesetzt ist.
 * Für lokale MVP-Analyse; in Produktion bewusst nicht aktivieren (Datenschutz).
 */
export async function appendEvaluationLog(
  payload: EvaluationLogPayload,
): Promise<void> {
  if (!loggingEnabled()) return;

  const arrayLen = (obj: unknown, key: string): number | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    const v = (obj as Record<string, unknown>)[key];
    return Array.isArray(v) ? v.length : undefined;
  };

  const record = {
    ts: new Date().toISOString(),
    model: payload.model,
    inputCharLength: payload.jobTextUsed.length,
    meta: payload.meta ?? undefined,
    quality: payload.quality ?? undefined,
    input: payload.jobTextUsed,
    output: payload.result,
    counts: {
      risks: arrayLen(payload.result, "risks"),
      steps: arrayLen(payload.result, "steps"),
      questions: arrayLen(payload.result, "questions"),
      red_flags: arrayLen(payload.result, "red_flags"),
    },
    outputVersion: "quick_cash",
  };

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
    const q = payload.quality;
    console.info(
      `[LOG_EVALUATIONS] ${record.ts} chars=${record.inputCharLength} model=${payload.model}` +
        (q?.winnerLatencyMs !== undefined ? ` winMs=${q.winnerLatencyMs}` : "") +
        (q?.loserAborted !== undefined ? ` loserAborted=${q.loserAborted}` : "") +
        (q?.deadlineHit !== undefined ? ` deadlineHit=${q.deadlineHit}` : "") +
        ` -> viable=${payload.result.viable} score=${payload.result.overall_score}`,
    );
  } catch (e) {
    console.error("[LOG_EVALUATIONS] Schreiben fehlgeschlagen:", e);
  }
}
