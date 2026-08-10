import type { NextRequest } from "next/server";

// Bounds memory on a long-running server process — sweep expired entries
// once a bucket grows past this instead of letting it grow unbounded.
const SWEEP_THRESHOLD = 1000;

type Entry = { count: number; resetAt: number };

type Bucket = {
  windowMs: number;
  maxAttempts: number;
  entries: Map<string, Entry>;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function bucket(windowMs: number, maxAttempts: number): Bucket {
  return { windowMs, maxAttempts, entries: new Map() };
}

function sweepExpired(entries: Map<string, Entry>, now: number): void {
  if (entries.size < SWEEP_THRESHOLD) return;
  for (const [key, entry] of entries) {
    if (now > entry.resetAt) entries.delete(key);
  }
}

// In-memory fixed-window limiter — sufficient for a single-instance VPS
// deployment (see DEPLOYMENT.md); would need a shared store (e.g. Redis)
// if this app is ever run across multiple instances. Each bucket keeps its
// own map, so a customer hitting the inquiry limit can still log in.
function consume(target: Bucket, key: string): RateLimitResult {
  const now = Date.now();
  sweepExpired(target.entries, now);

  const entry = target.entries.get(key);
  if (!entry || now > entry.resetAt) {
    target.entries.set(key, { count: 1, resetAt: now + target.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= target.maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

const loginBucket = bucket(15 * 60 * 1000, 5);

export function checkLoginRateLimit(ip: string): RateLimitResult {
  return consume(loginBucket, ip);
}

// Sign-up is a public write that creates a row and hashes a password, so it
// gets its own bucket rather than sharing login's: a customer registers once,
// and a household behind one IP is not going to need a sixth account in an
// hour. Separate from login's window so a failed sign-up can't lock the
// customer out of signing in.
const registerBucket = bucket(60 * 60 * 1000, 5);

export function checkRegisterRateLimit(ip: string): RateLimitResult {
  return consume(registerBucket, ip);
}

// Lead capture is public and unauthenticated, so the window is longer than
// login's: a real customer submits one inquiry, and five an hour is generous
// for a household behind one IP while still making a spam run pointless.
const fitmentInquiryBucket = bucket(60 * 60 * 1000, 5);

export function checkFitmentInquiryRateLimit(ip: string): RateLimitResult {
  return consume(fitmentInquiryBucket, ip);
}
