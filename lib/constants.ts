// ── Polling (Client) ──
export const POLL_INTERVAL_MS = 800;
export const POLL_TIMEOUT_MS = 120_000;
export const CONCURRENCY = 2;

// ── Input Limits ──
export const MAX_JOB_CHARS = 48_000;
export const PER_JOB_MAX_CHARS = 20_000;

// ── Evaluate Defaults ──
export const DEFAULT_DEADLINE_MS = 10_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 9_000;
export const MIN_DEADLINE_MS = 3_000;
export const MAX_DEADLINE_MS = 30_000;
export const MIN_REQUEST_TIMEOUT_MS = 2_000;
export const MAX_REQUEST_TIMEOUT_MS = 30_000;
export const REPAIR_MIN_TIME_LEFT_MS = 2_000;

// ── Async Evaluate Defaults ──
export const ASYNC_DEFAULT_DEADLINE_MS = 60_000;
export const ASYNC_MIN_DEADLINE_MS = 10_000;
export const ASYNC_MAX_DEADLINE_MS = 180_000;
export const ASYNC_DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
export const ASYNC_MIN_REQUEST_TIMEOUT_MS = 5_000;
export const ASYNC_MAX_REQUEST_TIMEOUT_MS = 60_000;

// ── LLM Models ──
export const PRIMARY_MODEL_DEFAULT = "google/gemini-3-flash-preview";
export const FALLBACK_MODEL_DEFAULT = "openai/gpt-5.4-mini";

// ── Schema Validation ──
export const MIN_RISKS = 3;
export const MAX_RISKS = 7;
export const MIN_NEXT_STEPS = 5;
export const MAX_NEXT_STEPS = 8;
export const MIN_CLARIFYING_QUESTIONS = 3;
export const MAX_CLARIFYING_QUESTIONS = 8;
export const MIN_OFFER_MESSAGE_LENGTH = 80;
export const MAX_OFFER_MESSAGE_LENGTH = 1200;
export const MIN_REASONING_LENGTH = 20;

// ── Rate Limiting ──
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 10;
