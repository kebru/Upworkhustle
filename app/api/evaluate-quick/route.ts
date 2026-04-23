import { createEvalEngine } from "@/lib/evaluation-engine";
import { getQuickCashSystemPrompt, QUICK_CASH_REPAIR_PROMPT } from "@/lib/eval-prompts";
import { validateQuickCashResultDetailed, validateQuickCashResult } from "@/lib/eval-validator";

function buildLogMeta(metaRaw: unknown): Record<string, unknown> | undefined {
  if (!metaRaw || typeof metaRaw !== "object") return undefined;
  const meta = metaRaw as Record<string, unknown>;
  return {
    source: meta.source === "upwork_feed" || meta.source === "text" ? meta.source : undefined,
    title: typeof meta.title === "string" ? meta.title : undefined,
    jobUrl: typeof meta.jobUrl === "string" ? meta.jobUrl : undefined,
    budget: typeof meta.budget === "string" ? meta.budget : undefined,
    duration: typeof meta.duration === "string" ? meta.duration : undefined,
    skills: Array.isArray(meta.skills) ? meta.skills : undefined,
    contractorTier: typeof meta.contractorTier === "string" ? meta.contractorTier : undefined,
  };
}

const engine = createEvalEngine({
  mode: "quick_cash",
  getSystemPrompt: () => getQuickCashSystemPrompt(),
  repairPrompt: QUICK_CASH_REPAIR_PROMPT,
  validate: validateQuickCashResultDetailed,
  validateLoose: validateQuickCashResult,
  buildLogMeta,
  getGermanCheckText: (result) => {
    const r = result as { reasoning: string; proposal_de: string };
    return [r.reasoning, r.proposal_de].join("\n");
  },
  cacheNamespace: "quick_cash",
  globalStoreKey: "__upworkQuickEvalJobs",
});

export const GET = engine.GET;
export const POST = engine.POST;
