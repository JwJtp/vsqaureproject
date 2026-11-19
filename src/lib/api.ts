import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/auth";
import { BackpressureError } from "@/lib/queue/mutex";
import { syslog } from "@/lib/log";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

type Ctx = { params: Promise<Record<string, string>> };
export function route<C extends Ctx = Ctx>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: "Invalid input", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
      if (e instanceof BackpressureError) return json({ error: e.message }, 429);
      await syslog("error", "api", `${req.method} ${req.nextUrl.pathname}: ${(e as Error).message}`);
      return json({ error: (e as Error).message || "Server error" }, 500);
    }
  };
}

// Simple fixed-window rate limiter (per server instance). For multi-region production use a
// shared store such as Upstash Redis; the interface is the same.
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) throw new HttpError(429, "Too many requests — please slow down");
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
