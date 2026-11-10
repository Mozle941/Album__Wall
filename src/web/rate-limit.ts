import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isIP } from "node:net";

export const API_RATE_LIMITS = {
  "/api/info": 20,
  "/api/wallpaper": 30,
  "/api/zip": 3,
} as const;
type ApiRoute = keyof typeof API_RATE_LIMITS;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}
export interface RateLimitBackend {
  limit(identifier: string, quota: number, route: ApiRoute): Promise<RateLimitResult>;
}

const CONFIG_ERROR = () =>
  Response.json({ error: "Rate limiting unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });

function getClientIp(headers: Headers): string | undefined {
  // The deployment reverse proxy must overwrite/sanitize these headers. Never accept
  // arbitrary client-supplied forwarding headers as trustworthy identity.
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded && isIP(forwarded) ? forwarded : undefined;
}

function createUpstashBackend(): RateLimitBackend {
  const redis = Redis.fromEnv();
  const limiters = new Map<ApiRoute, Ratelimit>();
  for (const [route, quota] of Object.entries(API_RATE_LIMITS) as [ApiRoute, number][]) {
    limiters.set(route, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(quota, "1 m"),
      analytics: false,
      prefix: `albumwall:${route.replaceAll("/", ":")}`,
    }));
  }
  return {
    async limit(identifier, _quota, route) {
      const limiter = limiters.get(route);
      if (!limiter) throw new Error("Unknown route");
      const result = await limiter.limit(identifier);
      return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset };
    },
  };
}

let sharedBackend: RateLimitBackend | undefined;

function getUpstashBackend(): RateLimitBackend {
  return (sharedBackend ??= createUpstashBackend());
}

/** Response is a 200 sentinel for allowed requests; proxy converts it to NextResponse.next(). */
export async function checkRateLimit(
  request: Request,
  backend?: RateLimitBackend,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname as ApiRoute;
  if (!(route in API_RATE_LIMITS)) return new Response(null, { status: 200 });

  const ip = getClientIp(request.headers);
  const secret = env.ALBUMWALL_RATE_LIMIT_HASH_SECRET;
  const redisUrl = env.UPSTASH_REDIS_REST_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (!ip || !secret || secret.length < 32 || !redisUrl || !redisToken) return CONFIG_ERROR();

  try {
    const clientKey = createHmac("sha256", secret).update(ip).digest("hex");
    const result = await (backend ?? getUpstashBackend()).limit(clientKey, API_RATE_LIMITS[route], route);
    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    const headers = new Headers({
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": String(Math.max(0, result.remaining)),
      "RateLimit-Reset": String(retryAfter),
      "Cache-Control": "no-store",
    });
    if (result.success) return new Response(null, { status: 200, headers });
    headers.set("Retry-After", String(retryAfter));
    return Response.json({ error: "Too many requests" }, { status: 429, headers });
  } catch {
    return CONFIG_ERROR();
  }
}
