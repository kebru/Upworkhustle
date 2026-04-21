import { createHash } from "crypto";

type CacheEntry = {
  result: unknown;
  jobTextUsed: string;
  quality: unknown;
  cachedAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function sha256Hex(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function normalizeForCache(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function jobTextHash(jobText: string): string {
  return sha256Hex(normalizeForCache(jobText));
}

function makeKey(jobText: string, namespace: string): string {
  return sha256Hex(`${namespace}:${normalizeForCache(jobText)}`);
}

export function getCached(jobText: string, namespace = "sidehustle"): CacheEntry | null {
  const key = makeKey(jobText, namespace);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCache(jobText: string, result: unknown, jobTextUsed: string, quality: unknown, namespace = "sidehustle"): void {
  const key = makeKey(jobText, namespace);
  cache.set(key, { result, jobTextUsed, quality, cachedAt: Date.now() });
}
