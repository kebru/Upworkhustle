"use client";

import { useCallback, useEffect, useState } from "react";

export interface OfferTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

const STORAGE_KEY = "upwork_offer_templates";

function readStore(): OfferTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfferTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeStore(templates: OfferTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch { /* storage full */ }
}

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useOfferTemplates() {
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTemplates(readStore());
    setHydrated(true);
  }, []);

  const save = useCallback((name: string, content: string) => {
    setTemplates((prev) => {
      if (prev.length >= 10) return prev;
      const item: OfferTemplate = {
        id: makeId(),
        name,
        content,
        isDefault: prev.length === 0,
        createdAt: new Date().toISOString(),
      };
      const next = [...prev, item];
      writeStore(next);
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Pick<OfferTemplate, "name" | "content">>) => {
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      writeStore(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      writeStore(next);
      return next;
    });
  }, []);

  const setDefault = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.map((t) => ({ ...t, isDefault: t.id === id }));
      writeStore(next);
      return next;
    });
  }, []);

  const duplicate = useCallback((id: string) => {
    setTemplates((prev) => {
      if (prev.length >= 10) return prev;
      const src = prev.find((t) => t.id === id);
      if (!src) return prev;
      const item: OfferTemplate = { ...src, id: makeId(), name: `${src.name} (Kopie)`, isDefault: false, createdAt: new Date().toISOString() };
      const next = [...prev, item];
      writeStore(next);
      return next;
    });
  }, []);

  const getDefault = useCallback((): OfferTemplate | undefined => {
    return templates.find((t) => t.isDefault);
  }, [templates]);

  const getById = useCallback((id: string): OfferTemplate | undefined => {
    return templates.find((t) => t.id === id);
  }, [templates]);

  return { templates, hydrated, save, update, remove, setDefault, duplicate, getDefault, getById };
}
