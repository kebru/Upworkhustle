"use client";

import { useState } from "react";

interface CoverLetterPanelProps {
  text: string;
  loading: boolean;
  error?: string;
  onGenerate: () => void;
}

export default function CoverLetterPanel({ text, loading, error, onGenerate }: CoverLetterPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  if (!text && !loading && !error) {
    return (
      <button
        onClick={onGenerate}
        className="text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        Cover Letter
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Cover Letter</span>
        <div className="flex gap-2">
          {text && (
            <button
              onClick={handleCopy}
              className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              {copied ? "Kopiert ✓" : "Kopieren"}
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={loading}
            className="text-xs px-2.5 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Neu"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Cover Letter wird generiert…
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {text && !loading && (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {text}
        </p>
      )}
    </div>
  );
}
