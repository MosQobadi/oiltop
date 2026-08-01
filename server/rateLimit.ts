import type { NextRequest } from "next/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Bounds memory on a long-running server process — sweep expired entries
// once the map grows past this instead of letting it grow unbounded.
const SWEEP_THRESHOLD = 1000;

type Entry = { count: number; resetAt: number };

const attemptsByIp = new Map<string, Entry>();

function sweepExpired(now: number): void {
  if (attemptsByIp.size < SWEEP_THRESHOLD) return;
  for (const [ip, entry] of attemptsByIp) {
    if (now > entry.resetAt) attemptsByIp.delete(ip);
  }
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

// In-memory fixed-window limiter — sufficient for a single-instance VPS
// deployment (see DEPLOYMENT.md); would need a shared store (e.g. Redis)
// if this app is ever run across multiple instances.
export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  sweepExpired(now);

  const entry = attemptsByIp.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
