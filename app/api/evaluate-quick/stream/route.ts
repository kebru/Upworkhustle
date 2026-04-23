import { NextResponse } from "next/server";

type EvalJobStatus = "queued" | "running" | "done" | "error";
type EvalJobRecord = {
  id: string;
  status: EvalJobStatus;
  updatedAt: number;
  error?: string;
  result?: unknown;
  jobTextUsed?: string;
  quality?: unknown;
};

function getEvalJobs(): Map<string, EvalJobRecord> {
  const g = globalThis as unknown as { __upworkQuickEvalJobs?: Map<string, EvalJobRecord> };
  if (!g.__upworkQuickEvalJobs) g.__upworkQuickEvalJobs = new Map<string, EvalJobRecord>();
  return g.__upworkQuickEvalJobs;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const check = () => {
        const jobs = getEvalJobs();
        const rec = jobs.get(jobId);
        if (!rec) {
          send({ status: "not_found" });
          if (!closed) { closed = true; controller.close(); }
          return true;
        }
        send({
          jobId: rec.id,
          status: rec.status,
          error: rec.error,
          result: rec.result ?? undefined,
          jobTextUsed: rec.jobTextUsed,
          quality: rec.quality,
        });
        if (rec.status === "done" || rec.status === "error") {
          if (!closed) { closed = true; controller.close(); }
          return true;
        }
        return false;
      };

      if (check()) return;

      const interval = setInterval(() => {
        if (closed) { clearInterval(interval); return; }
        if (check()) clearInterval(interval);
      }, 500);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });

      setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(interval);
          send({ status: "timeout" });
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 120_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

