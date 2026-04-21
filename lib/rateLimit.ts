import { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } from "@/lib/constants";

type Entry = { timestamps: number[] };

const store = new Map<string, Entry>();

let lastCleanup = Date.now();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isEnabled(): boolean {
  const raw = process.env.RATE_LIMIT_ENABLED?.trim();
  if (raw === "0" || raw?.toLowerCase() === "false") return false;
  if (raw === "1" || raw?.toLowerCase() === "true") return true;
  return process.env.NODE_ENV === "production";
}

function cleanup() {
  const now = Date.now();
  const windowMs = envNumber("RATE_LIMIT_WINDOW_MS", RATE_LIMIT_WINDOW_MS);
  if (now - lastCleanup < windowMs) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  store.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  });
}

export function extractIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function isRateLimited(ip: string): boolean {
  if (!isEnabled()) return false;

  cleanup();
  const now = Date.now();
  const windowMs = envNumber("RATE_LIMIT_WINDOW_MS", RATE_LIMIT_WINDOW_MS);
  const maxRequests = envNumber("RATE_LIMIT_MAX_REQUESTS", RATE_LIMIT_MAX_REQUESTS);
  const cutoff = now - windowMs;

  let entry = store.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(ip, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    return true;
  }

  entry.timestamps.push(now);
  return false;
}
