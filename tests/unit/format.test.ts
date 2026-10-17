import { describe, it, expect } from "vitest";
import { formatBytes } from "@/lib/format";

describe("formatBytes", () => {
  it("formats zero", () => {
    expect(formatBytes(0n)).toBe("0 B");
  });
  it("formats KB / MB / GB / TB", () => {
    expect(formatBytes(1024n)).toBe("1.00 KB");
    expect(formatBytes(1024n * 1024n)).toBe("1.00 MB");
    expect(formatBytes(1024n * 1024n * 1024n)).toBe("1.00 GB");
    expect(formatBytes(1024n * 1024n * 1024n * 1024n)).toBe("1.00 TB");
  });
  it("accepts numbers and bigints", () => {
    expect(formatBytes(1536)).toBe("1.50 KB");
  });
  it("handles negative safely (clamps to 0)", () => {
    expect(formatBytes(-5n)).toBe("0 B");
  });
});
