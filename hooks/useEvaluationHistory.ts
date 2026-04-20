"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvaluationResult, SavedEvaluation } from "@/types";

export const STORAGE_KEY = "upwork_evaluations";

function readFromStorage(): SavedEvaluation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedEvaluation[];
  } catch {
    return [];
  }
}

function writeToStorage(entries: SavedEvaluation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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
    (entry: { jobSnippet: string; evaluation: EvaluationResult }) => {
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
    (items: { jobSnippet: string; evaluation: EvaluationResult }[]) => {
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

  return { getAll, save, saveMany, remove, hydrated, entries };
}
