export interface EvaluationResultQuickCash {
  quick_cash_score: number; // 0..100
  confidence: number; // 1..10
  effort: string; // z.B. "2-4h" / "1 Tag"
  effort_hours: string; // backward-compat alias für effort
  why: string[]; // 1-4 Gründe
  questions: string[]; // 2-6 Rückfragen
  proposal_de: string; // direkt nutzbarer Proposal-Text auf Deutsch
  red_flags: string[]; // 0-6 Risiken
  reasoning: string;
  // backward-compat für DB-Filter und UI
  viable: boolean; // true wenn quick_cash_score >= 50
  overall_score: number; // 1..10 (Mapping aus quick_cash_score)
  steps: string[]; // alias für why
  risks: string[]; // alias für red_flags
}

export interface SavedEvaluation {
  id: string;
  savedAt: string;
  jobSnippet: string;
  evaluation: EvaluationResultQuickCash;
  tags?: string[];
  starred?: boolean;
  title?: string;
  jobUrl?: string;
  upworkJobId?: string;
  budget?: string;
  duration?: string;
  skills?: string[];
  source?: "upwork_feed" | "text";
  jobTextHash?: string;
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
