export interface EvaluationCriteria {
  clear_requirements: number;
  no_complex_backend: number;
}

export interface EvaluationResult {
  viable: boolean;
  effort_hours: string;
  overall_score: number;
  criteria: EvaluationCriteria;
  risks: string[];
  steps: string[];
  reasoning: string;
}

export interface EvaluationCriteriaV2 {
  scope_clarity: number;
  low_integration_ops_complexity: number;
  solo_delivery_fit: number;
  ai_coding_fit: number;
}

export interface EvaluationResultV2 {
  /** Strict: Solo sidehustle build, <=20h, minimal integrations, no ops/on-call. */
  viable_build_20h: boolean;
  /** Consulting-style setups allowed if clearly scoped + handover (no long-term maintenance). */
  viable_consulting: boolean;

  confidence: number; // 1..10
  effort_hours: string;
  timeline_days: string; // "2-4"
  price_range: string; // "300-600"

  overall_score: number; // 1..10
  criteria: EvaluationCriteriaV2;

  risks: string[];
  next_steps: string[]; // 5-8
  clarifying_questions: string[]; // 3-8
  offer_message: string;
  learning_path: string[]; // 0-6

  reasoning: string;

  /**
   * Backward-compat for existing UI/history.
   * Server sets this to (viable_build_20h || viable_consulting).
   */
  viable: boolean;
  /**
   * Backward-compat: keep old keys when possible.
   * - clear_requirements := scope_clarity
   * - no_complex_backend := low_integration_ops_complexity
   */
  steps: string[];
}

export interface EvaluationResultQuickCash {
  /**
   * Quick-Cash Mode: Fokus auf sehr kleine, schnell lieferbare Jobs.
   * Output ist bewusst anders als V2-Sidehustle.
   */
  quick_cash_score: number; // 0..100
  confidence: number; // 1..10
  effort: string; // z.B. "2-4h" / "1 Tag"
  /** Backward-compat for existing UI components. */
  effort_hours: string;
  why: string[]; // 1-4
  questions: string[]; // 2-6
  proposal_de: string; // direkt nutzbarer Proposal-Text (DE)
  red_flags: string[]; // 0-6
  reasoning: string;

  /** Backward-compat for UI/history filtering. */
  viable: boolean;
  /** Keep old field name used in UI badges. */
  overall_score: number; // 1..10 (rough mapping)
  /** Backward-compat: steps list to render something useful. */
  steps: string[];
  /** Backward-compat: risks list maps to red_flags. */
  risks: string[];
}

export type EvaluationResultAny = EvaluationResult | EvaluationResultV2 | EvaluationResultQuickCash;

export type EvalMode = "sidehustle" | "quick_cash";

/**
 * Canonical Upwork Job payload (extension-first).
 * This is the single source of truth for identity + metadata.
 */
export type InboxJobSource =
  | "extension_job_detail"
  | "extension_feed"
  | "extension_search"
  | "paste_fallback";

export interface CanonicalUpworkJob {
  upworkJobId: string; // "~<digits>" without "~"
  jobUrl: string;
  title: string;
  description: string;
  skills: string[];
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  source: InboxJobSource;
  capturedAt: string; // ISO
  raw?: Record<string, unknown>; // optional extra fields (no secrets)
}

export type InboxJobStatus =
  | "new"
  | "evaluating"
  | "evaluated"
  | "archived"
  | "skipped_seen";

export interface InboxJobRow {
  upworkJobId: string;
  jobUrl: string;
  title: string;
  description: string;
  skills: string[];
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  source: InboxJobSource;
  status: InboxJobStatus;
  importedAt: string; // ISO
  lastSeenAt: string; // ISO
  evaluationId?: string;
  lastEvalMode?: EvalMode;
  // convenience pre-render text used for evaluation
  jobText: string;
}

export interface SavedEvaluation {
  id: string;
  savedAt: string;
  jobSnippet: string;
  evaluation: EvaluationResultAny;
  tags?: string[];
  starred?: boolean;
  title?: string;
  jobUrl?: string;
  upworkJobId?: string;
  budget?: string;
  duration?: string;
  skills?: string[];
  source?: "upwork_feed" | "text";
}

export interface ParsedJob {
  source: "upwork_feed" | "text";
  jobText: string;
  title?: string;
  postedOn?: string;
  jobType?: string;
  budget?: string;
  duration?: string;
  contractorTier?: string;
  skills?: string[];
  feedHasMoreToggle?: boolean;
  likelyTruncated?: boolean;
  descriptionCharLength?: number;
  jobTextCharLength?: number;
  wasTrimmed?: boolean;
  jobUrl?: string;
}
