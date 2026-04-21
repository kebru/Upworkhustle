import { createEvalEngine } from "@/lib/evaluation-engine";
import { getSystemPrompt, REPAIR_SYSTEM_PROMPT } from "@/lib/eval-prompts";
import { validateResultDetailed, validateResult, checkSemanticQuality } from "@/lib/eval-validator";

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

const engine = createEvalEngine({
  mode: "sidehustle",
  getSystemPrompt: (jobType, offerTemplate) => getSystemPrompt(jobType, offerTemplate),
  repairPrompt: REPAIR_SYSTEM_PROMPT,
  validate: validateResultDetailed,
  validateLoose: validateResult,
  computeQuality: (result, jobText, base) => {
    const r = result as Parameters<typeof checkSemanticQuality>[0];
    const semantic = checkSemanticQuality(r, jobText);
    return { ...base, semanticWarnings: semantic.warnings };
  },
  buildLogMeta,
  getGermanCheckText: (result) => {
    const r = result as { reasoning: string; steps: string[]; risks: string[] };
    return [r.reasoning, ...r.steps, ...r.risks].join("\n");
  },
  cacheNamespace: "sidehustle",
  globalStoreKey: "__upworkEvalJobs",
});

export const GET = engine.GET;
export const POST = engine.POST;
