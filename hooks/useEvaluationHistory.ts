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

export function useEvaluationHistory() {
  const [entries, setEntries] = useState<SavedEvaluation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(readFromStorage());
    setHydrated(true);
  }, []);

  const getAll = useCallback((): SavedEvaluation[] => entries, [entries]);

  const save = useCallback(
    (entry: { jobSnippet: string; evaluation: EvaluationResultAny }) => {
      const newItem: SavedEvaluation = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        savedAt: new Date().toISOString(),
        jobSnippet: entry.jobSnippet,
        evaluation: entry.evaluation,
      };
      setEntries((prev) => {
        const next = [newItem, ...prev];
        writeToStorage(next);
        return next;
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  const saveMany = useCallback(
    (items: { jobSnippet: string; evaluation: EvaluationResultAny }[]) => {
      if (items.length === 0) return;
      setEntries((prev) => {
        const now = new Date().toISOString();
        const newItems: SavedEvaluation[] = items.map((entry, i) => ({
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          savedAt: now,
          jobSnippet: entry.jobSnippet,
          evaluation: entry.evaluation,
        }));
        const next = [...newItems, ...prev];
        writeToStorage(next);
        return next;
      });
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<Pick<SavedEvaluation, "tags" | "starred">>) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeToStorage(next);
      return next;
    });
  }, []);

  const toggleStar = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e));
      writeToStorage(next);
      return next;
    });
  }, []);

  return { getAll, save, saveMany, remove, update, toggleStar, hydrated, entries };
}
