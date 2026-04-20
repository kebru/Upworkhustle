import type { ParsedJob, EvaluationResultAny } from "@/types";

export type StartResp = { jobId?: string; error?: string };
export type PollResp = {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  jobTextUsed?: string;
  result?: EvaluationResultAny;
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

export async function startEvaluation(
  jobText: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const data = await apiFetch<StartResp>("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ async: true, jobText, meta }),
  });
  if (typeof data.jobId !== "string") {
    throw new Error(data.error ?? "Konnte Bewertung nicht starten.");
  }
  return data.jobId;
}

export async function pollEvaluation(jobId: string): Promise<PollResp> {
  return apiFetch<PollResp>(
    `/api/evaluate?jobId=${encodeURIComponent(jobId)}`,
    { method: "GET" },
  );
}

export function streamEvaluation(
  jobId: string,
  onUpdate: (data: PollResp) => void,
  onDone: () => void,
): () => void {
  const url = `/api/evaluate/stream?jobId=${encodeURIComponent(jobId)}`;
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
