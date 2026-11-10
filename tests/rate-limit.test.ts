import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, API_RATE_LIMITS, type RateLimitBackend } from "../src/web/rate-limit";

const savedEnv = { ...process.env };
const headers = (values: Record<string, string> = {}) => new Headers(values);
const backend = (overrides: Partial<RateLimitBackend> = {}): RateLimitBackend => ({
  limit: vi.fn(async () => ({ success: true, limit: 10, remaining: 9, reset: 1_800_000_000_000 })),
  ...overrides,
});
const env = {
  ALBUMWALL_RATE_LIMIT_HASH_SECRET: "test-secret-never-real-0123456789abcdef",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("API rate limiting", () => {
  it("passes allowed requests and applies distinct per-route quotas", async () => {
    process.env = { ...process.env, ...env };
    expect(API_RATE_LIMITS).toEqual({ "/api/preview": 10, "/api/zip": 3 });
    const limiter = backend();
    const result = await checkRateLimit(new Request("https://example.test/api/preview", {
      headers: headers({ "x-real-ip": "203.0.113.10" }),
    }), limiter);
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("");
    expect(limiter.limit).toHaveBeenCalledOnce();
    expect(vi.mocked(limiter.limit).mock.calls[0][1]).toBe(10);
    expect(vi.mocked(limiter.limit).mock.calls[0][0]).not.toContain("203.0.113.10");

    for (const [route, quota] of Object.entries(API_RATE_LIMITS)) {
      const routeBackend = backend();
      const response = await checkRateLimit(new Request(`https://example.test${route}`, {
        headers: headers({ "x-real-ip": "203.0.113.11" }),
      }), routeBackend);
      expect(response.status).toBe(200);
      expect(routeBackend.limit).toHaveBeenCalledWith(expect.any(String), quota, route);
    }
  });

  it("returns 429 with retry and standard rate headers on excess", async () => {
    process.env = { ...process.env, ...env };
    const limiter = backend({ limit: vi.fn(async () => ({ success: false, limit: 3, remaining: 0, reset: Date.now() + 60_000 })) });
    const result = await checkRateLimit(new Request("https://example.test/api/zip", {
      headers: headers({ "x-forwarded-for": "203.0.113.20, 10.0.0.2" }),
    }), limiter);
    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
    expect(result.headers.get("ratelimit-limit")).toBe("3");
    expect(result.headers.get("ratelimit-remaining")).toBe("0");
    const resetSeconds = Number(result.headers.get("ratelimit-reset"));
    expect(resetSeconds).toBeGreaterThan(0);
    expect(resetSeconds).toBeLessThanOrEqual(60);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ error: "Too many requests" });
  });

  it("fails closed for missing IP or required configuration without exposing details", async () => {
    process.env = { ...process.env, ...env };
    const limiter = backend();
    const missingIp = await checkRateLimit(new Request("https://example.test/api/preview"), limiter);
    expect(missingIp.status).toBe(503);
    expect(await missingIp.json()).toEqual({ error: "Rate limiting unavailable" });
    expect(limiter.limit).not.toHaveBeenCalled();

    const invalidIp = await checkRateLimit(new Request("https://example.test/api/preview", {
      headers: headers({ "x-real-ip": "not-an-ip" }),
    }), limiter);
    expect(invalidIp.status).toBe(503);

    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const missingConfig = await checkRateLimit(new Request("https://example.test/api/preview", {
      headers: headers({ "x-real-ip": "203.0.113.10" }),
    }), limiter);
    expect(missingConfig.status).toBe(503);
    expect(await missingConfig.text()).not.toContain("test-secret");
    expect(limiter.limit).not.toHaveBeenCalled();

    process.env = { ...process.env, ...env, ALBUMWALL_RATE_LIMIT_HASH_SECRET: "too-short" };
    const weakSecret = await checkRateLimit(new Request("https://example.test/api/preview", {
      headers: headers({ "x-real-ip": "203.0.113.10" }),
    }), limiter);
    expect(weakSecret.status).toBe(503);
  });

  it("fails closed when the shared backend errors", async () => {
    process.env = { ...process.env, ...env };
    const limiter = backend({ limit: vi.fn(async () => { throw new Error("private backend detail"); }) });
    const result = await checkRateLimit(new Request("https://example.test/api/preview", {
      headers: headers({ "x-real-ip": "203.0.113.10" }),
    }), limiter);
    expect(result.status).toBe(503);
    const body = await result.text();
    expect(body).not.toContain("private backend detail");
    expect(body).not.toContain("203.0.113.10");
  });
});
