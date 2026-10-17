import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (class-name merge)", () => {
  it("merges classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("dedupes conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("skips falsy values", () => {
    expect(cn("a", false && "x", null, undefined, "b")).toBe("a b");
  });
});
