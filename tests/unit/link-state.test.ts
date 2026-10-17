import { describe, it, expect, beforeAll } from "vitest";
import {
  buildLinkStateCookie,
  parseAndVerifyLinkStateCookie,
} from "@/server/auth/link-flow";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "a-very-secret-test-key-32-bytes-long";
});

describe("link state cookie", () => {
  it("round-trips a state and userId", () => {
    const { cookie, state } = buildLinkStateCookie("user-123");
    const parsed = parseAndVerifyLinkStateCookie(cookie);
    expect(parsed).not.toBeNull();
    expect(parsed!.state).toBe(state);
    expect(parsed!.userId).toBe("user-123");
  });

  it("rejects a tampered cookie (modified userId)", () => {
    const { cookie } = buildLinkStateCookie("user-123");
    const [body, sig] = cookie.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ state: "x", userId: "attacker", issuedAt: Date.now() }),
      "utf8"
    ).toString("base64url");
    const tampered = `${tamperedBody}.${sig}`;
    expect(parseAndVerifyLinkStateCookie(tampered)).toBeNull();
    // The original is still valid
    expect(parseAndVerifyLinkStateCookie(`${body}.${sig}`)).not.toBeNull();
  });

  it("rejects expired state (older than TTL)", () => {
    // Manually craft an expired state by building the cookie with an old issuedAt.
    // We can't go through buildLinkStateCookie because that uses Date.now(),
    // so we rebuild the cookie payload format manually.
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const secret = "a-very-secret-test-key-32-bytes-long";
    const payload = JSON.stringify({
      state: "abc",
      userId: "u",
      issuedAt: Date.now() - 11 * 60 * 1000, // 11 min ago > 10 min TTL
    });
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    const cookie = `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
    expect(parseAndVerifyLinkStateCookie(cookie)).toBeNull();
  });

  it("rejects a malformed cookie", () => {
    expect(parseAndVerifyLinkStateCookie("nope")).toBeNull();
    expect(parseAndVerifyLinkStateCookie("a.b.c")).toBeNull();
    expect(parseAndVerifyLinkStateCookie("")).toBeNull();
  });
});
