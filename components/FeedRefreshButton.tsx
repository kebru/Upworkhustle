"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFeed } from "@/lib/api-client";
import type { ParsedJob } from "@/types";

const STORAGE_KEY = "upwork_feed_url";

function readUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

function writeUrl(url: string) {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch { /* storage full */ }
}

type Status = "idle" | "loading" | "success" | "error";

export function FeedRefreshButton({
  onNewJobs,
}: {
  onNewJobs: (jobs: ParsedJob[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setUrl(readUrl());
  }, []);

  const handleFetch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setShowInput(true);
      return;
    }

    writeUrl(trimmed);
    setStatus("loading");
    setMessage("");

    try {
      const jobs = await fetchFeed(trimmed);
      if (jobs.length === 0) {
        setStatus("success");
        setMessage("Keine neuen Jobs gefunden.");
      } else {
        setStatus("success");
        setMessage(`${jobs.length} Job${jobs.length === 1 ? "" : "s"} geladen.`);
        onNewJobs(jobs);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Feed-Abruf fehlgeschlagen.");
    }
  }, [url, onNewJobs]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFetch}
          disabled={status === "loading"}
          className="rounded-lg border border-accent/50 bg-transparent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {status === "loading" ? "Lädt…" : "Feed aktualisieren"}
        </button>
        <button
          type="button"
          onClick={() => setShowInput(!showInput)}
          className="rounded-md border border-white/15 px-2 py-1.5 text-xs text-muted transition hover:text-white"
          title="Feed-URL konfigurieren"
        >
          ⚙
        </button>
        {status !== "idle" && status !== "loading" && (
          <span className={`text-xs ${status === "error" ? "text-red-300" : "text-emerald-300"}`}>
            {message}
          </span>
        )}
      </div>

      {showInput && (
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleFetch();
                setShowInput(false);
              }
            }}
            placeholder="https://www.upwork.com/nx/search/jobs/?q=..."
            className="flex-1 rounded-md border border-white/15 bg-surface px-3 py-1.5 text-xs text-white outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => {
              writeUrl(url.trim());
              setShowInput(false);
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-background"
          >
            Speichern
          </button>
        </div>
      )}
    </div>
  );
}
