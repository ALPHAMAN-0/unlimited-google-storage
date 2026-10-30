import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Zod compatibility guard.
 *
 * The project depends on `zod` for environment validation (`src/lib/env.ts`).
 * A major zod upgrade can change how validation errors are shaped, which
 * would silently change the behaviour of `env` — including which variables
 * are considered "required".
 *
 * These tests pin the behaviours `src/lib/env.ts` relies on:
 *   - `z.object` with `min(1)` rejects both a missing key and an empty string
 *   - custom messages are surfaced on `issues[].message`
 *   - `issues[].path` is an array of segments
 *   - `.default().transform().pipe()` still coerces and validates
 *   - `z.enum` and `z.string().url()` behave as expected
 */
describe("zod behaviour used by src/lib/env.ts", () => {
  const Schema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 chars"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MAX_UPLOAD_BYTES: z
      .string()
      .default("5368709120")
      .transform((v) => BigInt(v))
      .pipe(z.bigint().positive()),
  });

  it("rejects a missing required key", () => {
    const parsed = Schema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty required key with the custom message", () => {
    const parsed = Schema.safeParse({ DATABASE_URL: "", NEXTAUTH_SECRET: "0123456789012345" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("DATABASE_URL is required");
    }
  });

  it("rejects a too-short secret with the custom message", () => {
    const parsed = Schema.safeParse({ DATABASE_URL: "postgres://x", NEXTAUTH_SECRET: "short" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("NEXTAUTH_SECRET must be at least 16 chars");
    }
  });

  it("exposes issues with a path and a message", () => {
    const parsed = Schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      expect(Array.isArray(issue.path)).toBe(true);
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it("applies defaults and coerces with transform + pipe", () => {
    const parsed = Schema.safeParse({ DATABASE_URL: "postgres://x", NEXTAUTH_SECRET: "0123456789012345" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.NODE_ENV).toBe("development");
      expect(parsed.data.MAX_UPLOAD_BYTES).toBe(5368709120n);
    }
  });

  it("rejects a non-positive transformed value", () => {
    const parsed = Schema.safeParse({
      DATABASE_URL: "postgres://x",
      NEXTAUTH_SECRET: "0123456789012345",
      MAX_UPLOAD_BYTES: "0",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a value outside the enum", () => {
    const parsed = Schema.safeParse({
      DATABASE_URL: "postgres://x",
      NEXTAUTH_SECRET: "0123456789012345",
      NODE_ENV: "staging",
    });
    expect(parsed.success).toBe(false);
  });

  it("validates a url", () => {
    const S = z.string().url();
    expect(S.safeParse("http://localhost:3000").success).toBe(true);
    expect(S.safeParse("not a url").success).toBe(false);
  });
});
