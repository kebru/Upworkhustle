"use client";

import { useCallback, useEffect, useState } from "react";
import { extractUpworkJobId } from "@/lib/upwork-job-id";

const STORAGE_KEY = "upwork_seen_jobs";
const STORAGE_KEY_UPWORK_IDS = "upwork_seen_job_ids";

function normalizeForHash(text: string): string {
  // Remove URL metadata lines so minor URL variations don't change the hash.
  const withoutUrlLines = text
    .replace(/(?:^|\n)\s*URL:\s*https?:\/\/\S+\s*(?=\n|$)/gi, "")
    .trim();
  return withoutUrlLines.toLowerCase().replace(/\s+/g, " ").trim();
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function jobTextHash(text: string): string {
  return simpleHash(normalizeForHash(text));
}

function readHashStore(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeHashStore(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch { /* storage full */ }
}

function readUpworkIdStore(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UPWORK_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeUpworkIdStore(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_UPWORK_IDS, JSON.stringify(Array.from(set)));
  } catch { /* storage full */ }
}

async function fetchServerSeen(): Promise<{ hashes: string[]; upworkJobIds: string[] } | null> {
  try {
    const res = await fetch("/api/seen-jobs");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      hashes: Array.isArray(data.hashes) ? data.hashes : [],
      upworkJobIds: Array.isArray(data.upworkJobIds) ? data.upworkJobIds : [],
    };
  } catch {
    return null;
  }
}

async function postServerSeen(entries: Array<{ hash: string; upworkJobId?: string }>) {
  try {
    await fetch("/api/seen-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch { /* best-effort */ }
}

export function useSeenJobs() {
  const [seenHashes, setSeenHashes] = useState<Set<string>>(new Set());
  const [seenUpworkIds, setSeenUpworkIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const localHashes = readHashStore();
    const localIds = readUpworkIdStore();
    setSeenHashes(localHashes);
    setSeenUpworkIds(localIds);

    const server = await fetchServerSeen();
    if (server) {
      setSeenHashes((prev) => {
        const merged = new Set(prev);
        let changed = false;
        for (const h of server.hashes) {
          if (!merged.has(h)) { merged.add(h); changed = true; }
        }
        if (changed) writeHashStore(merged);
        return changed ? merged : prev;
      });

      setSeenUpworkIds((prev) => {
        const merged = new Set(prev);
        let changed = false;
        for (const id of server.upworkJobIds) {
          if (!merged.has(id)) { merged.add(id); changed = true; }
        }
        if (changed) writeUpworkIdStore(merged);
        return changed ? merged : prev;
      });
    }

    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, []);

  const isSeen = useCallback((jobText: string, jobUrl?: string): boolean => {
    if (jobUrl) {
      const upworkId = extractUpworkJobId(jobUrl);
      if (upworkId && seenUpworkIds.has(upworkId)) return true;
    }
    // Fallback: if jobUrl is missing, try extracting Upwork ID from the text itself
    const textId = extractUpworkJobId(jobText);
    if (textId && seenUpworkIds.has(textId)) return true;
    return seenHashes.has(jobTextHash(jobText));
  }, [seenHashes, seenUpworkIds]);

  const markSeen = useCallback((jobs: Array<{ jobText: string; jobUrl?: string }>) => {
    const serverEntries: Array<{ hash: string; upworkJobId?: string }> = [];

    const newHashes: string[] = [];
    const newUpworkIds: string[] = [];

    for (const job of jobs) {
      const hash = jobTextHash(job.jobText);
      newHashes.push(hash);
      const upworkId =
        (job.jobUrl ? extractUpworkJobId(job.jobUrl) : undefined) ??
        extractUpworkJobId(job.jobText);
      if (upworkId) newUpworkIds.push(upworkId);
      serverEntries.push({ hash, upworkJobId: upworkId });
    }

    setSeenHashes((prev) => {
      const next = new Set(prev);
      newHashes.forEach((h) => next.add(h));
      writeHashStore(next);
      return next;
    });

    if (newUpworkIds.length > 0) {
      setSeenUpworkIds((prev) => {
        const next = new Set(prev);
        newUpworkIds.forEach((id) => next.add(id));
        writeUpworkIdStore(next);
        return next;
      });
    }

    postServerSeen(serverEntries);
  }, []);

  const clearSeen = useCallback(() => {
    setSeenHashes(new Set());
    setSeenUpworkIds(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY_UPWORK_IDS);
    } catch { /* ok */ }
  }, []);

  return { isSeen, markSeen, clearSeen, refresh, ready, seenCount: seenHashes.size };
}
