import { describe, it, expect } from "vitest";
import { pickTargetLink, type PickerInput } from "@/server/storage/picker";

const DAY = 24 * 60 * 60 * 1000;

function link(overrides: Partial<PickerInput["links"][number]> = {}): PickerInput["links"][number] {
  return {
    id: "link-1",
    status: "ACTIVE",
    storageUsed: 0n,
    storageLimit: 15_000_000_000n, // ~14 GB
    expiresAt: new Date(Date.now() + DAY),
    lastUsedAt: null,
    ...overrides,
  };
}

describe("storage picker", () => {
  it("picks the link with the most free bytes", async () => {
    const result = await pickTargetLink({
      fileSize: 1_000_000n,
      links: [
        link({ id: "a", storageUsed: 10_000_000_000n }), // 5 GB free
        link({ id: "b", storageUsed: 1_000_000_000n }),  // 14 GB free
        link({ id: "c", storageUsed: 5_000_000_000n }),  // 10 GB free
      ],
    });
    expect(result?.id).toBe("b");
  });

  it("throws when no link has enough free space", async () => {
    await expect(
      pickTargetLink({
        fileSize: 100_000_000_000n, // 100 GB
        links: [
          link({ id: "a", storageUsed: 10_000_000_000n, storageLimit: 15_000_000_000n }),
          link({ id: "b", storageUsed: 5_000_000_000n, storageLimit: 15_000_000_000n }),
        ],
      })
    ).rejects.toThrow(/no linked account has enough free space/i);
  });

  it("excludes REVOKED links", async () => {
    const result = await pickTargetLink({
      fileSize: 1n,
      links: [
        link({ id: "revoked", status: "REVOKED", storageUsed: 0n }),
        link({ id: "active", status: "ACTIVE", storageUsed: 0n }),
      ],
    });
    expect(result?.id).toBe("active");
  });

  it("excludes ERROR links", async () => {
    const result = await pickTargetLink({
      fileSize: 1n,
      links: [
        link({ id: "err", status: "ERROR" }),
        link({ id: "ok", status: "ACTIVE" }),
      ],
    });
    expect(result?.id).toBe("ok");
  });

  it("excludes links with expired tokens", async () => {
    const result = await pickTargetLink({
      fileSize: 1n,
      links: [
        link({ id: "expired", expiresAt: new Date(Date.now() - DAY) }),
        link({ id: "fresh", expiresAt: new Date(Date.now() + DAY) }),
      ],
    });
    expect(result?.id).toBe("fresh");
  });

  it("breaks ties by least-recently-used (older first)", async () => {
    const now = Date.now();
    const result = await pickTargetLink({
      fileSize: 1n,
      links: [
        link({ id: "young", lastUsedAt: new Date(now - 1_000) }),
        link({ id: "old", lastUsedAt: new Date(now - 100_000) }),
        link({ id: "never", lastUsedAt: null }),
      ],
    });
    // Among links with equal free space, "never" (null) is treated as oldest
    expect(result?.id).toBe("never");
  });

  it("returns null when there are no links at all", async () => {
    const result = await pickTargetLink({ fileSize: 1n, links: [] });
    expect(result).toBeNull();
  });

  it("rejects non-positive file sizes", async () => {
    await expect(
      pickTargetLink({ fileSize: 0n, links: [link()] })
    ).rejects.toThrow(/fileSize must be positive/i);
    await expect(
      pickTargetLink({ fileSize: -1n, links: [link()] })
    ).rejects.toThrow(/fileSize must be positive/i);
  });
});
