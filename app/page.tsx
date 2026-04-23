"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { JobForm } from "@/components/JobForm";
import { JobRunCard } from "@/components/JobRunCard";
import type { JobRun } from "@/components/JobRunCard";
import { useEvaluationHistory } from "@/hooks/useEvaluationHistory";
import { useSeenJobs } from "@/hooks/useSeenJobs";
import { normalizeJobText } from "@/lib/normalizeJobInput";
import { splitJobPostings } from "@/lib/splitJobs";
import { extractUpworkJobId } from "@/lib/upwork-job-id";
import { parseJobs, startEval, pollEval, streamEval } from "@/lib/api-client";
import type { PollResp } from "@/lib/api-client";
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, CONCURRENCY } from "@/lib/constants";
import type { CanonicalUpworkJob, EvaluationResultAny, ParsedJob } from "@/types";
import type { JobType } from "@/lib/eval-prompts";
import { useOfferTemplates } from "@/hooks/useOfferTemplates";
import { FeedRefreshButton } from "@/components/FeedRefreshButton";

function makeRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitForVisible(): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      if (!document.hidden) {
        document.removeEventListener("visibilitychange", handler);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", handler);
  });
}

function createForegroundTimer() {
  let elapsed = 0;
  let lastTick = Date.now();
  let hidden = typeof document !== "undefined" && document.hidden;

  const handler = () => {
    if (!hidden) elapsed += Date.now() - lastTick;
    lastTick = Date.now();
    hidden = document.hidden;
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handler);
  }

  return {
    foregroundMs: () => {
      if (!hidden) elapsed += Date.now() - lastTick;
      lastTick = Date.now();
      return elapsed;
    },
    dispose: () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handler);
      }
    },
  };
}

export default function HomePageWrapper() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}

function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoEvalTriggered = useRef(false);
  const submitTokenRef = useRef(0);
  const activeUnsubsRef = useRef<Set<() => void>>(new Set());
  const [loading, setLoading] = useState(false);
  const [draftJobText, setDraftJobText] = useState("");
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Gespeichert");
  const [skippedCount, setSkippedCount] = useState(0);
  const [lastParseTotal, setLastParseTotal] = useState(0);
  const [lastParseRemaining, setLastParseRemaining] = useState(0);
  const lastRemainingJobsRef = useRef<Array<{ jobText: string; jobUrl?: string }>>([]);

  const { save, saveMany } = useEvaluationHistory();
  const { isSeen, markSeen, refresh: refreshSeen, ready: seenReady } = useSeenJobs();
  const { templates: offerTemplates, getById: getTemplateById } = useOfferTemplates();

  const goHistory = useCallback(() => router.push("/history"), [router]);
  useKeyboardShortcuts(useMemo(() => ({ "ctrl+h": goHistory }), [goHistory]));

  useEffect(() => {
    if (!toastVisible) return;
    const t = window.setTimeout(() => setToastVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [toastVisible]);

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
  }

  const [currentJobType, setCurrentJobType] = useState<JobType>("Automatisch");
  const [currentOfferTemplate, setCurrentOfferTemplate] = useState<string | undefined>();
  const [currentMode, setCurrentMode] = useState<"sidehustle" | "quick_cash">("sidehustle");

  async function handleSubmit(
    jobText: string,
    jobType: JobType = "Automatisch",
    offerTemplateId?: string,
    mode: "sidehustle" | "quick_cash" = "sidehustle",
  ) {
    const submitToken = ++submitTokenRef.current;
    for (const unsub of Array.from(activeUnsubsRef.current)) {
      try { unsub(); } catch { /* ignore */ }
    }
    activeUnsubsRef.current.clear();

    setCurrentMode(mode);
    setCurrentJobType(jobType);
    const tpl = offerTemplateId ? getTemplateById(offerTemplateId) : undefined;
    setCurrentOfferTemplate(tpl?.content);
    setError(null);
    setRuns([]);
    setSkippedCount(0);

    // Important: ensure seen set is loaded before dedup, otherwise auto-import runs can re-evaluate duplicates.
    if (!seenReady) {
      await refreshSeen();
    }

    let parsedJobs: ParsedJob[];
    try {
      parsedJobs = await parseJobs(jobText);
    } catch {
      const rawParts = splitJobPostings(jobText);
      const jobs = rawParts
        .map((p) => normalizeJobText(p))
        .filter((t) => t.length > 0);
      parsedJobs = jobs.map((t): ParsedJob => ({ source: "text", jobText: t }));
    }

    if (parsedJobs.length === 0) {
      setError(
        "Bitte mindestens einen Job-Text einfügen. Wenn du aus dem Feed kopierst: für Volltext Job öffnen (Detailseite) und dort Titel + Beschreibung kopieren.",
      );
      return;
    }

    const totalBefore = parsedJobs.length;
    setLastParseTotal(totalBefore);
    // First: dedup within the current input (same job appearing twice in a feed/modal export)
    const seenInBatch = new Set<string>();
    parsedJobs = parsedJobs.filter((j) => {
      const upworkId = extractUpworkJobId(j.jobUrl ?? "") ?? extractUpworkJobId(j.jobText);
      const key = upworkId ? `id:${upworkId}` : `hash:${j.jobText.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (seenInBatch.has(key)) return false;
      seenInBatch.add(key);
      return true;
    });

    // Second: global dedup (local + server seen set)
    parsedJobs = parsedJobs.filter((j) => !isSeen(j.jobText, j.jobUrl));
    const skipped = totalBefore - parsedJobs.length;
    setSkippedCount(skipped);
    setLastParseRemaining(parsedJobs.length);
    lastRemainingJobsRef.current = parsedJobs.map((j) => ({ jobText: j.jobText, jobUrl: j.jobUrl }));

    if (parsedJobs.length === 0) {
      setError(
        `Alle ${totalBefore} Jobs wurden bereits bewertet. Neue Jobs einfügen um fortzufahren.`,
      );
      return;
    }

    const initialRuns: JobRun[] = parsedJobs.map((j) => ({
      id: makeRunId(),
      jobText: j.jobText,
      mode,
      title: j.title,
      postedOn: j.postedOn,
      jobType: j.jobType,
      budget: j.budget,
      duration: j.duration,
      contractorTier: j.contractorTier,
      skills: j.skills,
      feedHasMoreToggle: j.feedHasMoreToggle,
      likelyTruncated: j.likelyTruncated,
      descriptionCharLength: j.descriptionCharLength,
      jobTextCharLength: j.jobTextCharLength,
      wasTrimmed: j.wasTrimmed,
      jobUrl: j.jobUrl,
      source: j.source,
      status: "pending",
    }));
    setRuns(initialRuns);
    setLoading(true);

    try {
      const startAndPollOne = async (i: number) => {
        const run = initialRuns[i];
        const runId = run.id;
        const runMode = run.mode ?? "sidehustle";

        if (submitToken !== submitTokenRef.current) return;

        setRuns((prev) =>
          prev.map((r) => (r.id === runId ? { ...r, status: "loading" as const } : r)),
        );

        const jobId = await startEval(runMode, run.jobText, {
          mode: run.mode,
          source: run.source,
          feedHasMoreToggle: run.feedHasMoreToggle,
          likelyTruncated: run.likelyTruncated,
          descriptionCharLength: run.descriptionCharLength,
          jobTextCharLength: run.jobTextCharLength,
          wasTrimmed: run.wasTrimmed,
          title: run.title,
          jobUrl: run.jobUrl,
          postedOn: run.postedOn,
          jobType: run.jobType,
          budget: run.budget,
          duration: run.duration,
          contractorTier: run.contractorTier,
          skillsCount: run.skills?.length ?? 0,
        }, run.mode === "quick_cash"
          ? undefined
          : { jobType: currentJobType !== "Automatisch" ? currentJobType : undefined, offerTemplate: currentOfferTemplate });

        if (submitToken !== submitTokenRef.current) return;

        setRuns((prev) =>
          prev.map((r) => (r.id === runId ? { ...r, evaluationJobId: jobId } : r)),
        );

        const applyResult = (p: PollResp) => {
          if (submitToken !== submitTokenRef.current) return true; // ignore stale updates
          if (p.status === "done" && p.result) {
            markSeen([{ jobText: run.jobText, jobUrl: run.jobUrl }]);
            setRuns((prev) =>
              prev.map((r) =>
                r.id === runId
                  ? {
                      ...r,
                      status: "done" as const,
                      result: p.result,
                      jobText: typeof p.jobTextUsed === "string" && p.jobTextUsed.length > 0 ? p.jobTextUsed : r.jobText,
                      title:
                        r.title ??
                        (typeof p.jobTextUsed === "string"
                          ? p.jobTextUsed.match(/(?:^|\n)\s*TITLE:\s*(.+)\s*(?:\n|$)/i)?.[1]?.trim()
                          : undefined),
                    }
                  : r,
              ),
            );
            return true;
          }
          if (p.status === "error") {
            setRuns((prev) =>
              prev.map((r) =>
                r.id === runId
                  ? { ...r, status: "error" as const, error: typeof p.error === "string" && p.error.length > 0 ? p.error : "Bewertung fehlgeschlagen." }
                  : r,
              ),
            );
            return true;
          }
          return false;
        };

        // Try SSE first, fallback to polling
        const sseSupported = typeof EventSource !== "undefined";
        if (sseSupported) {
          const timer = createForegroundTimer();
          await new Promise<void>((resolve) => {
            let fallbackTriggered = false;
            const unsub = streamEval(runMode, jobId, (data) => {
              if (applyResult(data)) { timer.dispose(); resolve(); }
            }, () => {
              if (!fallbackTriggered) {
                fallbackTriggered = true;
                timer.dispose();
                resolve();
              }
            });
            activeUnsubsRef.current.add(unsub);
            const checkTimeout = () => {
              if (timer.foregroundMs() >= POLL_TIMEOUT_MS) {
                unsub();
                activeUnsubsRef.current.delete(unsub);
                if (!fallbackTriggered) { fallbackTriggered = true; timer.dispose(); resolve(); }
              } else {
                setTimeout(checkTimeout, 2000);
              }
            };
            setTimeout(checkTimeout, 2000);
          });
          const currentRuns = await new Promise<JobRun[]>((res) => setRuns((prev) => { res(prev); return prev; }));
          const cur = currentRuns.find((r) => r.id === runId);
          if (cur && (cur.status === "done" || cur.status === "error")) return;
        }

        // Polling fallback — only count foreground time, poll immediately on tab focus
        const timer = createForegroundTimer();
        while (timer.foregroundMs() < POLL_TIMEOUT_MS) {
          await waitForVisible();
          if (submitToken !== submitTokenRef.current) { timer.dispose(); return; }
          const p = await pollEval(runMode, jobId);
          if (applyResult(p)) { timer.dispose(); return; }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
        timer.dispose();

        setRuns((prev) =>
          prev.map((r) =>
            r.id === runId
              ? { ...r, status: "error" as const, error: "Timeout beim Warten auf die Bewertung. Bitte erneut versuchen." }
              : r,
          ),
        );
      };

      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, initialRuns.length) }).map(
        async () => {
          while (cursor < initialRuns.length) {
            const i = cursor++;
            try {
              await startAndPollOne(i);
            } catch (err) {
              if (submitToken !== submitTokenRef.current) return;
              setRuns((prev) =>
                prev.map((r) =>
                  r.id === initialRuns[i]?.id
                    ? {
                        ...r,
                        status: "error" as const,
                        error:
                          err && typeof err === "object" && "message" in err
                            ? String((err as { message: unknown }).message)
                            : "Bewertung fehlgeschlagen.",
                      }
                    : r,
                ),
              );
            }
          }
        },
      );

      await Promise.all(workers);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRemainingAsSeen() {
    const jobs = lastRemainingJobsRef.current;
    if (!jobs.length) return;

    // #region agent log
    fetch("http://127.0.0.1:7308/ingest/d7c7c2de-211a-48e0-83e3-49047ff29be5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "827bfa" },
      body: JSON.stringify({
        sessionId: "827bfa",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "app/page.tsx:handleMarkRemainingAsSeen",
        message: "mark remaining as seen",
        data: { remaining: jobs.length, lastParseTotal, skippedCount },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    markSeen(jobs);
    await refreshSeen();
    showToast(jobs.length === 1 ? "Als gesehen markiert" : `${jobs.length} Jobs als gesehen markiert`);
  }

  function parsedJobToCanonical(j: ParsedJob): CanonicalUpworkJob | null {
    const text = j.jobText || "";
    const title =
      j.title ??
      text.match(/(?:^|\n)\s*TITLE:\s*(.+)\s*(?:\n|$)/i)?.[1]?.trim() ??
      "";
    const jobUrl =
      j.jobUrl ??
      text.match(/(?:^|\n)\s*URL:\s*(https?:\/\/[^\s]+)\s*(?:\n|$)/i)?.[1]?.trim() ??
      "";
    const upworkJobId =
      (jobUrl ? extractUpworkJobId(jobUrl) : undefined) ??
      extractUpworkJobId(text) ??
      "";
    const skillsLine = text.match(/(?:^|\n)\s*SKILLS:\s*(.+)\s*(?:\n|$)/i)?.[1]?.trim();
    const skills = skillsLine ? skillsLine.split(",").map((s) => s.trim()).filter(Boolean) : (j.skills ?? []);
    const desc = text.split(/\nDESCRIPTION:\n/i)[1]?.trim() ?? "";
    if (!upworkJobId || !jobUrl || !title || !desc) return null;
    return {
      upworkJobId,
      jobUrl,
      title,
      description: desc,
      skills,
      postedOn: j.postedOn,
      jobType: j.jobType,
      budget: j.budget,
      duration: j.duration,
      contractorTier: j.contractorTier,
      source: "paste_fallback",
      capturedAt: new Date().toISOString(),
      raw: { source: j.source },
    };
  }

  async function handleImportToInbox(rawText: string) {
    setError(null);
    try {
      const parsedJobs = await parseJobs(rawText);
      const canonical = parsedJobs.map(parsedJobToCanonical).filter((x): x is CanonicalUpworkJob => x !== null);
      if (canonical.length === 0) {
        setError("Konnte keine kanonischen Jobs aus dem Paste-Text ableiten. Tipp: nutze die Extension oder füge Upwork Search/Feed HTML ein.");
        return;
      }
      const res = await fetch("/api/inbox/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: canonical }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Import fehlgeschlagen.");
        return;
      }
      router.push("/inbox");
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Import fehlgeschlagen.");
    }
  }

  function bestEffortJobUrlFromText(text: string): string | undefined {
    const urlLine = text.match(/(?:^|\n)\s*URL:\s*(https?:\/\/[^\s]+)\s*(?:\n|$)/i)?.[1]?.trim();
    if (urlLine?.includes("upwork.com")) return urlLine;
    const direct = text.match(/https?:\/\/www\.upwork\.com\/jobs\/~\d{10,}/)?.[0]?.trim();
    if (direct) return direct;
    const id = extractUpworkJobId(text);
    return id ? `https://www.upwork.com/jobs/~${id}` : undefined;
  }

  function bestEffortTitleFromText(text: string): string | undefined {
    const fromTitleLine = text.match(/(?:^|\n)\s*TITLE:\s*(.+)\s*(?:\n|$)/i)?.[1]?.trim();
    const candidate = (fromTitleLine || "").replace(/^\*+|\*+$/g, "").trim();
    if (candidate.length >= 6) return candidate.slice(0, 180);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const first = lines.find((l) => !/^(URL|POSTED|TYPE|LEVEL|DURATION|BUDGET|SKILLS|DESCRIPTION)\s*:/i.test(l));
    if (!first) return undefined;
    const cleaned = first.replace(/^\*+|\*+$/g, "").trim();
    return cleaned.length >= 6 ? cleaned.slice(0, 180) : undefined;
  }

  function handleSaveOne(run: JobRun) {
    if (!run.result || !run.jobText.trim()) return;
    const jobUrl = run.jobUrl || bestEffortJobUrlFromText(run.jobText);
    const title = run.title || bestEffortTitleFromText(run.jobText);
    save({
      jobSnippet: run.jobText,
      evaluation: run.result,
      tags: [run.mode === "quick_cash" ? "mode:quick_cash" : "mode:sidehustle"],
      title,
      jobUrl,
      upworkJobId: jobUrl ? extractUpworkJobId(jobUrl) : extractUpworkJobId(run.jobText),
      budget: run.budget,
      duration: run.duration,
      skills: run.skills,
      source: run.source,
    });
    showToast("Gespeichert");
  }

  function handleSaveAll() {
    const done = runs.filter(
      (r): r is JobRun & { result: EvaluationResultAny } =>
        r.status === "done" && !!r.result,
    );
    if (done.length === 0) return;
    saveMany(
      done.map((r) => ({
        jobSnippet: r.jobText,
        evaluation: r.result,
        tags: [r.mode === "quick_cash" ? "mode:quick_cash" : "mode:sidehustle"],
        title: r.title || bestEffortTitleFromText(r.jobText),
        jobUrl: r.jobUrl || bestEffortJobUrlFromText(r.jobText),
        upworkJobId: (r.jobUrl ? extractUpworkJobId(r.jobUrl) : undefined) || extractUpworkJobId(r.jobText),
        budget: r.budget,
        duration: r.duration,
        skills: r.skills,
        source: r.source,
      })),
    );
    showToast(
      done.length === 1
        ? "Gespeichert"
        : `${done.length} Jobs gespeichert`,
    );
  }

  async function handleRetry(index: number) {
    const run = runs[index];
    if (!run) return;
    setRuns((prev) =>
      prev.map((r, j) => (j === index ? { ...r, status: "loading" as const, error: undefined } : r)),
    );
    try {
      const retryMode = run.mode ?? "sidehustle";
      const jobId = await startEval(retryMode, run.jobText, {
        mode: retryMode,
        source: run.source,
        title: run.title,
        jobUrl: run.jobUrl,
      }, retryMode === "quick_cash"
        ? undefined
        : { jobType: currentJobType !== "Automatisch" ? currentJobType : undefined, offerTemplate: currentOfferTemplate });
      setRuns((prev) =>
        prev.map((r, j) => (j === index ? { ...r, evaluationJobId: jobId } : r)),
      );
      const retryTimer = createForegroundTimer();
      while (retryTimer.foregroundMs() < POLL_TIMEOUT_MS) {
        await waitForVisible();
        const p = await pollEval(retryMode, jobId);
        if (p.status === "done" && p.result) {
          markSeen([{ jobText: run.jobText, jobUrl: run.jobUrl }]);
          setRuns((prev) =>
            prev.map((r, j) =>
              j === index ? { ...r, status: "done" as const, result: p.result, jobText: typeof p.jobTextUsed === "string" && p.jobTextUsed.length > 0 ? p.jobTextUsed : r.jobText } : r,
            ),
          );
          retryTimer.dispose();
          return;
        }
        if (p.status === "error") {
          setRuns((prev) =>
            prev.map((r, j) =>
              j === index ? { ...r, status: "error" as const, error: typeof p.error === "string" ? p.error : "Bewertung fehlgeschlagen." } : r,
            ),
          );
          retryTimer.dispose();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      retryTimer.dispose();
      setRuns((prev) =>
        prev.map((r, j) =>
          j === index ? { ...r, status: "error" as const, error: "Timeout beim Warten auf die Bewertung." } : r,
        ),
      );
    } catch (err) {
      setRuns((prev) =>
        prev.map((r, j) =>
          j === index ? { ...r, status: "error" as const, error: err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Bewertung fehlgeschlagen." } : r,
        ),
      );
    }
  }

  useEffect(() => {
    if (autoEvalTriggered.current) return;
    const jobText = searchParams.get("autoEval");
    const autoEvalId = searchParams.get("autoEvalId");
    const modeParam = searchParams.get("mode");
    const mode = modeParam === "quick_cash" ? "quick_cash" : "sidehustle";
    if (loading) return;

    if (jobText) {
      autoEvalTriggered.current = true;
      window.history.replaceState({}, "", "/");
      setDraftJobText(jobText);
      handleSubmit(jobText, "Automatisch", undefined, mode);
      return;
    }

    if (autoEvalId) {
      autoEvalTriggered.current = true;
      window.history.replaceState({}, "", "/");
      (async () => {
        try {
          const res = await fetch(`/api/extension/pending?id=${encodeURIComponent(autoEvalId)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || typeof data?.jobText !== "string") {
            setError(typeof data?.error === "string" ? data.error : "Konnte Pending-Jobs nicht laden.");
            return;
          }
          setDraftJobText(data.jobText);
          handleSubmit(data.jobText, "Automatisch", undefined, mode);
        } catch (e) {
          setError(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Konnte Pending-Jobs nicht laden.");
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleFeedJobs(feedJobs: ParsedJob[]) {
    const newJobs = feedJobs.filter((j) => !isSeen(j.jobText, j.jobUrl));
    if (newJobs.length === 0) return;
    const jobText = newJobs.map((j) => j.jobText).join("\n---JOBSPLIT---\n");
    handleSubmit(jobText, currentJobType, undefined, currentMode);
  }

  const doneCount = runs.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-8">
      <JobForm
        onSubmit={handleSubmit}
        onImportToInbox={handleImportToInbox}
        loading={loading}
        offerTemplates={offerTemplates.map((t) => ({ id: t.id, name: t.name }))}
        value={draftJobText}
        onChange={setDraftJobText}
      />
      <FeedRefreshButton onNewJobs={handleFeedJobs} />

      {skippedCount > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div>
            {skippedCount} bereits bewertete{skippedCount === 1 ? "r Job" : " Jobs"} übersprungen.
            {lastParseTotal > 0 && (
              <span className="text-amber-200/80"> ({lastParseRemaining} von {lastParseTotal} werden angezeigt)</span>
            )}
          </div>
          {lastParseRemaining > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleMarkRemainingAsSeen}
                className="rounded-md border border-amber-400/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10"
              >
                Übrige {lastParseRemaining} als gesehen markieren (ohne KI)
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Ergebnisse{" "}
              <span className="text-sm font-normal text-muted">
                ({runs.length} {runs.length === 1 ? "Job" : "Jobs"})
              </span>
            </h2>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={handleSaveAll}
                className="rounded-lg border border-accent/50 bg-transparent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                Alle in Liste speichern
              </button>
            )}
          </div>

          {/* Batch progress */}
          {runs.length > 1 && loading && (
            <div className="rounded-lg border border-white/10 bg-surface/40 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span>{doneCount + runs.filter((r) => r.status === "error").length} von {runs.length} abgeschlossen</span>
                <span>{doneCount} erfolgreich{runs.filter((r) => r.status === "error").length > 0 ? `, ${runs.filter((r) => r.status === "error").length} fehlgeschlagen` : ""}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${((doneCount + runs.filter((r) => r.status === "error").length) / runs.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {runs.map((run, index) => (
            <JobRunCard
              key={run.id}
              run={run}
              index={index}
              onSave={() => handleSaveOne(run)}
              onRetry={() => handleRetry(index)}
            />
          ))}
        </div>
      )}

      {toastVisible && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-surface px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-accent/40"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
