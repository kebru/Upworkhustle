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

export type EvaluationResultAny = EvaluationResult | EvaluationResultV2;

export interface SavedEvaluation {
  id: string;
  savedAt: string;
  jobSnippet: string;
  evaluation: EvaluationResultAny;
  tags?: string[];
  starred?: boolean;
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
