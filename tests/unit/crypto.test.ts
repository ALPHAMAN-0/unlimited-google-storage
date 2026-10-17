import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

const TEST_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32 random bytes, base64

describe("token crypto (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  it("round-trips a simple string", () => {
    const plaintext = "ya29.a0AfH6SMBx-abc123-refresh-token";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-token";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("throws on tampered ciphertext (auth tag check)", () => {
    const ciphertext = encrypt("secret");
    // flip a byte in the middle (within the auth-tag region)
    const buf = Buffer.from(ciphertext, "base64");
    buf[buf.length - 2] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when the encryption key is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("handles unicode and large payloads", () => {
    const big = "héllo🚀".repeat(1000);
    const ciphertext = encrypt(big);
    expect(decrypt(ciphertext)).toBe(big);
  });
});
