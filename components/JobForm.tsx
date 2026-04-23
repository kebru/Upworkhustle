"use client";

import { useState } from "react";
import type { JobType } from "@/lib/eval-prompts";

const JOB_TYPES: JobType[] = ["Automatisch", "Web Development", "Data & ML", "Design", "Consulting"];
type EvalMode = "sidehustle" | "quick_cash";

type Props = {
  onSubmit: (text: string, jobType: JobType, offerTemplateId: string | undefined, mode: EvalMode) => void;
  onImportToInbox?: (text: string) => void;
  loading: boolean;
  offerTemplates?: { id: string; name: string }[];
  value: string;
  onChange: (val: string) => void;
};

export function JobForm({ onSubmit, onImportToInbox, loading, offerTemplates, value, onChange }: Props) {
  const jobText = value;
  const setJobText = onChange;
  const [jobType, setJobType] = useState<JobType>("Automatisch");
  const [templateId, setTemplateId] = useState<string>("");
  const [mode, setMode] = useState<EvalMode>("sidehustle");

  function handleJobPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    if (!html || html.length < 80) return;

    const plainT = plain.trim();
    const htmlT = html.trim();
    const plainTooShort = plainT.length < 40;
    const htmlMuchLarger = htmlT.length > plainT.length * 3 + 200;
    if (!plainTooShort && !htmlMuchLarger) return;

    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    setJobText(jobText.slice(0, start) + htmlT + jobText.slice(end));
    const caret = start + htmlT.length;
    requestAnimationFrame(() => {
      ta.selectionStart = caret;
      ta.selectionEnd = caret;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(jobText, jobType, templateId || undefined, mode);
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Job bewerten
        </h1>
        <p className="mt-2 text-sm text-muted">
          Du kannst <strong className="text-white/90">alles markieren und
          einfügen</strong> (z. B. Strg+A auf der Job-Seite oder in der
          Suchergebnis-Liste). HTML wird serverseitig reduziert.{" "}
          <strong className="text-white/90">Mehrere Jobs:</strong> entweder
          automatisch getrennt an Zeilen wie{" "}
          <code className="rounded bg-white/10 px-1 text-accent">
            Posted yesterday
          </code>{" "}
          /{" "}
          <code className="rounded bg-white/10 px-1 text-accent">
            Posted 4 hours ago
          </code>{" "}
          (Upwork-Feed), oder manuell mit einer Zeile nur{" "}
          <code className="rounded bg-white/10 px-1 text-accent">---</code>{" "}
          zwischen den Postings (nicht <code className="rounded bg-white/10 px-1 text-accent">___</code>
          : kommt in Kopien oft vor).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor="mode" className="mb-1 block text-xs font-medium text-muted">Modus</label>
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as EvalMode)}
              disabled={loading}
              className="rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="sidehustle">Sidehustle</option>
              <option value="quick_cash">Quick Cash</option>
            </select>
          </div>
          <div>
            <label htmlFor="jobType" className="mb-1 block text-xs font-medium text-muted">Job-Typ</label>
            <select
              id="jobType"
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType)}
              disabled={loading || mode === "quick_cash"}
              className="rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent"
            >
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {mode !== "quick_cash" && offerTemplates && offerTemplates.length > 0 && (
            <div>
              <label htmlFor="offerTpl" className="mb-1 block text-xs font-medium text-muted">Angebotsvorlage</label>
              <select
                id="offerTpl"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={loading}
                className="rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Keine</option>
                {offerTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label
            htmlFor="job"
            className="mb-2 block text-sm font-medium text-white"
          >
            Job Posting einfügen
          </label>
          <textarea
            id="job"
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            onPaste={handleJobPaste}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !loading && jobText.trim()) {
                e.preventDefault();
                onSubmit(jobText, jobType, templateId || undefined, mode);
              }
            }}
            rows={18}
            className="w-full resize-y rounded-lg border border-white/15 bg-surface p-4 text-sm text-white placeholder:text-white/35 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder={`Job 1 Text hier…\n\n---\n\nJob 2 Text hier…\n\n---\n\nJob 3…`}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? "Bewerte…" : "Jetzt bewerten"}
        </button>
        {onImportToInbox && (
          <button
            type="button"
            disabled={loading || !jobText.trim()}
            onClick={() => onImportToInbox(jobText)}
            className="w-full rounded-lg border border-white/15 bg-transparent px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            In Inbox importieren (ohne KI)
          </button>
        )}
        <span className="ml-3 hidden text-xs text-muted sm:inline">Ctrl+Enter</span>
      </form>
    </>
  );
}
