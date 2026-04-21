type CacheEntry = {
  result: unknown;
  jobTextUsed: string;
  quality: unknown;
  cachedAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

function normalizeForCache(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function jobTextHash(jobText: string): string {
  return simpleHash(normalizeForCache(jobText));
}

function makeKey(jobText: string, namespace: string): string {
  return simpleHash(`${namespace}:${normalizeForCache(jobText)}`);
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
