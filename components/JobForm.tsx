"use client";

import { useState } from "react";

type Props = {
  onSubmit: (text: string) => void;
  loading: boolean;
};

export function JobForm({ onSubmit, loading }: Props) {
  const [jobText, setJobText] = useState("");

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
    setJobText((prev) => prev.slice(0, start) + htmlT + prev.slice(end));
    const caret = start + htmlT.length;
    requestAnimationFrame(() => {
      ta.selectionStart = caret;
      ta.selectionEnd = caret;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(jobText);
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
                onSubmit(jobText);
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
        <span className="ml-3 hidden text-xs text-muted sm:inline">Ctrl+Enter</span>
      </form>
    </>
  );
}
