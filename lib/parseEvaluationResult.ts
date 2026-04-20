import type { EvaluationResult, EvaluationResultV2 } from "@/types";

function clampInt1to10(n: number): number | undefined {
  const r = Math.round(n);
  if (r >= 1 && r <= 10) return r;
  return undefined;
}

function parseScore1to10(x: unknown): number | undefined {
  if (typeof x === "number" && !Number.isNaN(x)) {
    return clampInt1to10(x);
  }
  if (typeof x === "string") {
    const t = x.trim();
    const asInt = parseInt(t, 10);
    if (!Number.isNaN(asInt)) return clampInt1to10(asInt);
    const asFloat = parseFloat(t.replace(",", "."));
    if (!Number.isNaN(asFloat)) return clampInt1to10(asFloat);
  }
  return undefined;
}

function parseViable(x: unknown): boolean | undefined {
  if (typeof x === "boolean") return x;
  if (x === "true" || x === "yes" || x === "ja") return true;
  if (x === "false" || x === "no" || x === "nein") return false;
  return undefined;
}

function parseString(x: unknown): string | undefined {
  if (typeof x === "string") return x.trim();
  if (typeof x === "number" && !Number.isNaN(x)) return String(x);
  return undefined;
}

function parseStringArray(x: unknown): string[] | null {
  if (x === undefined || x === null) return [];
  if (typeof x === "string") {
    const t = x.trim();
    return t ? [t] : [];
  }
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const item of x) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
    } else if (item !== null && item !== undefined) {
      out.push(String(item));
    }
  }
  return out;
}

/**
 * Mappt typische LLM-Abweichungen (Strings statt Zahlen, fehlende Arrays) auf EvaluationResult.
 */
export function parseEvaluationResult(raw: unknown): EvaluationResult | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const viable = parseViable(o.viable);
  if (viable === undefined) return null;

  let effort_hours: string;
  if (typeof o.effort_hours === "string") {
    effort_hours = o.effort_hours.trim();
  } else if (typeof o.effort_hours === "number" && !Number.isNaN(o.effort_hours)) {
    effort_hours = String(o.effort_hours);
  } else {
    return null;
  }
  if (!effort_hours) return null;

  const overall_score = parseScore1to10(o.overall_score);
  if (overall_score === undefined) return null;

  if (o.criteria === null || typeof o.criteria !== "object") return null;
  const c = o.criteria as Record<string, unknown>;
  const clear_requirements = parseScore1to10(c.clear_requirements);
  const no_complex_backend = parseScore1to10(c.no_complex_backend);
  if (clear_requirements === undefined || no_complex_backend === undefined) {
    return null;
  }

  const risks = parseStringArray(o.risks);
  const steps = parseStringArray(o.steps);
  if (risks === null || steps === null) return null;

  let reasoning: string;
  if (typeof o.reasoning === "string") {
    reasoning = o.reasoning.trim();
  } else if (typeof o.reasoning === "number") {
    reasoning = String(o.reasoning);
  } else {
    return null;
  }
  if (!reasoning) return null;

  return {
    viable,
    effort_hours,
    overall_score,
    criteria: { clear_requirements, no_complex_backend },
    risks,
    steps,
    reasoning,
  };
}

export function parseEvaluationResultV2(raw: unknown): EvaluationResultV2 | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const viable_build_20h = parseViable(o.viable_build_20h);
  const viable_consulting = parseViable(o.viable_consulting);
  if (viable_build_20h === undefined || viable_consulting === undefined) return null;

  const confidence = parseScore1to10(o.confidence);
  if (confidence === undefined) return null;

  const effort_hours = parseString(o.effort_hours);
  const timeline_days = parseString(o.timeline_days);
  const price_range = parseString(o.price_range);
  if (!effort_hours || !timeline_days || !price_range) return null;

  const overall_score = parseScore1to10(o.overall_score);
  if (overall_score === undefined) return null;

  if (o.criteria === null || typeof o.criteria !== "object") return null;
  const c = o.criteria as Record<string, unknown>;
  const scope_clarity = parseScore1to10(c.scope_clarity);
  const low_integration_ops_complexity = parseScore1to10(
    c.low_integration_ops_complexity,
  );
  const solo_delivery_fit = parseScore1to10(c.solo_delivery_fit);
  if (
    scope_clarity === undefined ||
    low_integration_ops_complexity === undefined ||
    solo_delivery_fit === undefined
  ) {
    return null;
  }

  const risks = parseStringArray(o.risks);
  const next_steps = parseStringArray(o.next_steps);
  const clarifying_questions = parseStringArray(o.clarifying_questions);
  const learning_path = parseStringArray(o.learning_path);
  // Back-compat fields: allow steps
  const steps = parseStringArray(o.steps);
  if (
    risks === null ||
    next_steps === null ||
    clarifying_questions === null ||
    learning_path === null ||
    steps === null
  ) {
    return null;
  }

  const offer_message = parseString(o.offer_message);
  if (!offer_message) return null;

  const reasoning = parseString(o.reasoning);
  if (!reasoning) return null;

  const viable = viable_build_20h || viable_consulting;

  return {
    viable_build_20h,
    viable_consulting,
    confidence,
    effort_hours,
    timeline_days,
    price_range,
    overall_score,
    criteria: { scope_clarity, low_integration_ops_complexity, solo_delivery_fit },
    risks,
    next_steps,
    clarifying_questions,
    offer_message,
    learning_path,
    reasoning,
    viable,
    steps,
  };
}
