"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvaluationResultAny, SavedEvaluation } from "@/types";

const STORAGE_KEY_V2 = "upwork_evaluations_v2";
const LEGACY_STORAGE_KEY = "upwork_evaluations";

function migrateFromV1(): SavedEvaluation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    localStorage.setItem(STORAGE_KEY_V2, raw);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parsed as SavedEvaluation[];
  } catch {
    return [];
  }
}

function readFromStorage(): SavedEvaluation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return migrateFromV1();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedEvaluation[];
  } catch {
    return [];
  }
}

function writeToStorage(entries: SavedEvaluation[]) {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(entries));
  } catch (e) {
    console.error(
      "LocalStorage konnte nicht geschrieben werden (Speicher voll oder privat?):",
      e,
    );
  }
}

const SYNC_FLAG = "upwork_synced_to_server";

async function syncToServer(entries: SavedEvaluation[]) {
  try {
    await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    localStorage.setItem(SYNC_FLAG, "true");
  } catch { /* server unavailable — localStorage still works */ }
}

async function fetchServerEntries(): Promise<SavedEvaluation[] | null> {
  try {
    const res = await fetch("/api/evaluations");
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries as SavedEvaluation[] : null;
  } catch {
    return null;
  }
}

async function serverSave(entries: SavedEvaluation[]) {
  try {
    await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch { /* best-effort */ }
}

async function serverDelete(ids: string[]) {
  try {
    await fetch("/api/evaluations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  } catch { /* best-effort */ }
}

async function serverPatch(id: string, patch: Record<string, unknown>) {
  try {
    await fetch(`/api/evaluations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch { /* best-effort */ }
}

export function useEvaluationHistory() {
  const [entries, setEntries] = useState<SavedEvaluation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const local = readFromStorage();
    setEntries(local);
    setHydrated(true);

    // Initial sync: push localStorage to server if never synced
    if (!localStorage.getItem(SYNC_FLAG) && local.length > 0) {
      syncToServer(local);
    }

    // Background merge: fetch server entries and merge
    fetchServerEntries().then((serverEntries) => {
      if (!serverEntries) return;
      setEntries((prev) => {
        const idSet = new Set(prev.map((e) => e.id));
        const merged = [...prev];
        for (const se of serverEntries) {
          if (!idSet.has(se.id)) {
            merged.push(se);
            idSet.add(se.id);
          }
        }
        if (merged.length !== prev.length) {
          merged.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
          writeToStorage(merged);
          return merged;
        }
        return prev;
      });
    });
  }, []);

  const getAll = useCallback((): SavedEvaluation[] => entries, [entries]);

  type SaveInput = {
    jobSnippet: string;
    evaluation: EvaluationResultAny;
    tags?: string[];
    title?: string;
    jobUrl?: string;
    upworkJobId?: string;
    budget?: string;
    duration?: string;
    skills?: string[];
    source?: "upwork_feed" | "text";
  };

  const save = useCallback(
    (entry: SaveInput) => {
      const newItem: SavedEvaluation = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        savedAt: new Date().toISOString(),
        jobSnippet: entry.jobSnippet,
        evaluation: entry.evaluation,
        tags: entry.tags,
        title: entry.title,
        jobUrl: entry.jobUrl,
        upworkJobId: entry.upworkJobId,
        budget: entry.budget,
        duration: entry.duration,
        skills: entry.skills,
        source: entry.source,
      };
      setEntries((prev) => {
        const next = [newItem, ...prev];
        writeToStorage(next);
        return next;
      });
      serverSave([newItem]);
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeToStorage(next);
      return next;
    });
    serverDelete([id]);
  }, []);

  const saveMany = useCallback(
    (items: SaveInput[]) => {
      if (items.length === 0) return;
      const now = new Date().toISOString();
      const newItems: SavedEvaluation[] = items.map((entry, i) => ({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        savedAt: now,
        jobSnippet: entry.jobSnippet,
        evaluation: entry.evaluation,
        tags: entry.tags,
        title: entry.title,
        jobUrl: entry.jobUrl,
        upworkJobId: entry.upworkJobId,
        budget: entry.budget,
        duration: entry.duration,
        skills: entry.skills,
        source: entry.source,
      }));
      setEntries((prev) => {
        const next = [...newItems, ...prev];
        writeToStorage(next);
        return next;
      });
      serverSave(newItems);
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<Pick<SavedEvaluation, "tags" | "starred">>) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeToStorage(next);
      return next;
    });
    serverPatch(id, patch);
  }, []);

  const toggleStar = useCallback((id: string) => {
    let newStarred = false;
    setEntries((prev) => {
      const next = prev.map((e) => {
        if (e.id === id) {
          newStarred = !e.starred;
          return { ...e, starred: newStarred };
        }
        return e;
      });
      writeToStorage(next);
      return next;
    });
    serverPatch(id, { starred: newStarred });
  }, []);

  const removeMany = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setEntries((prev) => {
      const next = prev.filter((e) => !idSet.has(e.id));
      writeToStorage(next);
      return next;
    });
    serverDelete(ids);
  }, []);

  const updateMany = useCallback((ids: string[], patch: Partial<Pick<SavedEvaluation, "tags" | "starred">>) => {
    const idSet = new Set(ids);
    setEntries((prev) => {
      const next = prev.map((e) => {
        if (!idSet.has(e.id)) return e;
        const updated = { ...e, ...patch };
        if (patch.tags && e.tags) {
          const merged = new Set([...e.tags, ...patch.tags]);
          updated.tags = Array.from(merged);
        }
        return updated;
      });
      writeToStorage(next);
      return next;
    });
  }, []);

  const toggleStarMany = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setEntries((prev) => {
      const next = prev.map((e) => (idSet.has(e.id) ? { ...e, starred: !e.starred } : e));
      writeToStorage(next);
      return next;
    });
  }, []);

  return { getAll, save, saveMany, remove, removeMany, update, updateMany, toggleStar, toggleStarMany, hydrated, entries };
}
