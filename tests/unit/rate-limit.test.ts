import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to `limit` requests in the window", () => {
    for (let i = 0; i < 5; i++) {
      const r = rateLimit({ key: "test-1", limit: 5, windowMs: 1000 });
      expect(r.ok).toBe(true);
    }
  });
  it("blocks the (limit+1)th request", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit({ key: "test-2", limit: 5, windowMs: 1000 });
    }
    const r = rateLimit({ key: "test-2", limit: 5, windowMs: 1000 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });
  it("resets after the window expires", async () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ key: "test-3", limit: 3, windowMs: 50 });
    }
    expect(rateLimit({ key: "test-3", limit: 3, windowMs: 50 }).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(rateLimit({ key: "test-3", limit: 3, windowMs: 50 }).ok).toBe(true);
  });
  it("keys do not share buckets", () => {
    for (let i = 0; i < 2; i++) rateLimit({ key: "a", limit: 2, windowMs: 1000 });
    const r = rateLimit({ key: "b", limit: 2, windowMs: 1000 });
    expect(r.ok).toBe(true);
  });
});
