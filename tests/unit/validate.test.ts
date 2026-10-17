import { describe, it, expect } from "vitest";
import { isValidFilename, isValidMime } from "@/lib/validate";

describe("filename validation", () => {
  it("accepts normal names", () => {
    expect(isValidFilename("hello.txt")).toBe(true);
    expect(isValidFilename("my-file (1).pdf")).toBe(true);
    expect(isValidFilename("한글.png")).toBe(true);
  });
  it("rejects empty / whitespace", () => {
    expect(isValidFilename("")).toBe(false);
    expect(isValidFilename("   ")).toBe(false);
  });
  it("rejects path traversal", () => {
    expect(isValidFilename("../etc/passwd")).toBe(false);
    expect(isValidFilename("a/b")).toBe(false);
    expect(isValidFilename("a\\b")).toBe(false);
  });
  it("rejects names with control chars", () => {
    expect(isValidFilename("a\u0000b")).toBe(false);
    expect(isValidFilename("a\nb")).toBe(false);
  });
  it("rejects names that are too long", () => {
    expect(isValidFilename("a".repeat(256))).toBe(false);
  });
});

describe("mime validation", () => {
  it("accepts well-formed mimes", () => {
    expect(isValidMime("application/pdf")).toBe(true);
    expect(isValidMime("image/png")).toBe(true);
    expect(isValidMime("video/mp4")).toBe(true);
  });
  it("rejects malformed mimes", () => {
    expect(isValidMime("pdf")).toBe(false);
    expect(isValidMime("")).toBe(false);
    expect(isValidMime("application/")).toBe(false);
  });
});
