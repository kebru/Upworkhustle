"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "upwork_seen_jobs";

function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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

function readStore(): Set<string> {
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

function writeStore(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch { /* storage full */ }
}

export function useSeenJobs() {
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSeen(readStore());
  }, []);

  const markSeen = useCallback((jobTexts: string[]) => {
    setSeen((prev) => {
      const next = new Set(prev);
      jobTexts.forEach((t) => next.add(jobTextHash(t)));
      writeStore(next);
      return next;
    });
  }, []);

  const isSeen = useCallback((jobText: string): boolean => {
    return seen.has(jobTextHash(jobText));
  }, [seen]);

  const clearSeen = useCallback(() => {
    setSeen(new Set());
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
  }, []);

  return { isSeen, markSeen, clearSeen, seenCount: seen.size };
}
