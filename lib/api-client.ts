import type { ParsedJob, EvaluationResultQuickCash, SavedEvaluation } from "@/types";

export type StartResp = { jobId?: string; error?: string };
export type PollResp = {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  jobTextUsed?: string;
  result?: EvaluationResultQuickCash;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export async function parseJobs(rawText: string): Promise<ParsedJob[]> {
  const data = await apiFetch<{ jobs?: ParsedJob[]; error?: string }>("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  if (!Array.isArray(data.jobs)) {
    throw new Error(data.error ?? "Parse fehlgeschlagen.");
  }
  return data.jobs;
}

export async function fetchPendingJobText(id: string): Promise<string> {
  const data = await apiFetch<{ jobText?: string; error?: string }>(
    `/api/extension/pending?id=${encodeURIComponent(id)}`,
  );
  if (typeof data.jobText !== "string") {
    throw new Error(data.error ?? "Job-Text nicht gefunden.");
  }
  return data.jobText;
}

export async function startEval(
  jobText: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const data = await apiFetch<StartResp>("/api/evaluate-quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ async: true, jobText, meta }),
  });
  if (typeof data.jobId !== "string") {
    throw new Error(data.error ?? "Konnte Bewertung nicht starten.");
  }
  return data.jobId;
}

export async function pollEval(jobId: string): Promise<PollResp> {
  return apiFetch<PollResp>(
    `/api/evaluate-quick?jobId=${encodeURIComponent(jobId)}`,
    { method: "GET" },
  );
}

export function streamEval(
  jobId: string,
  onUpdate: (data: PollResp) => void,
  onDone: () => void,
): () => void {
  const url = `/api/evaluate-quick/stream?jobId=${encodeURIComponent(jobId)}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as PollResp;
      onUpdate(data);
      if (data.status === "done" || data.status === "error") {
        es.close();
        onDone();
      }
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => {
    es.close();
    onDone();
  };
  return () => es.close();
}

export async function fetchEvaluations(options?: {
  minScore?: number;
  search?: string;
  starred?: boolean;
}): Promise<SavedEvaluation[]> {
  const params = new URLSearchParams();
  if (options?.minScore !== undefined) params.set("minScore", String(options.minScore));
  if (options?.search) params.set("search", options.search);
  if (options?.starred !== undefined) params.set("starred", String(options.starred));
  const qs = params.toString();
  const data = await apiFetch<{ entries?: SavedEvaluation[] }>(
    `/api/evaluations${qs ? `?${qs}` : ""}`,
  );
  return data.entries ?? [];
}

export async function deleteEvaluation(id: string): Promise<void> {
  await apiFetch("/api/evaluations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [id] }),
  });
}

export async function deleteManyEvaluations(ids: string[]): Promise<void> {
  await apiFetch("/api/evaluations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function generateCoverLetter(
  evaluationId: string,
  options?: { hourlyRate?: string; tone?: string },
): Promise<string> {
  const data = await apiFetch<{ offer?: string; error?: string }>("/api/generate-offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluationId, ...options }),
  });
  if (typeof data.offer !== "string") {
    throw new Error(data.error ?? "Cover Letter konnte nicht generiert werden.");
  }
  return data.offer;
}
