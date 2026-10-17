/**
 * Storage picker — chooses which linked Google account should receive a new
 * upload. This is the heart of "unlimited" storage: by always writing to the
 * account with the most free space, we spread uploads evenly across N
 * accounts and the user's effective ceiling becomes N × (per-account quota).
 *
 * Selection rules:
 *   1. Only `ACTIVE` links with non-expired tokens.
 *   2. Must have `freeBytes = storageLimit - storageUsed >= fileSize`.
 *   3. Pick the link with the largest freeBytes.
 *   4. Tie-break by least-recently-used: prefer a `lastUsedAt` of `null` first,
 *      then the oldest non-null timestamp. This avoids hammering the same
 *      account when several have similar free space.
 */

export type LinkStatus = "ACTIVE" | "REVOKED" | "ERROR";

export interface PickerLink {
  id: string;
  status: LinkStatus;
  storageUsed: bigint;
  storageLimit: bigint;
  expiresAt: Date;
  lastUsedAt: Date | null;
}

export interface PickerInput {
  fileSize: bigint;
  links: PickerLink[];
}

export class NoSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSpaceError";
  }
}

export async function pickTargetLink(input: PickerInput): Promise<PickerLink | null> {
  if (input.fileSize <= 0n) {
    throw new Error("fileSize must be positive");
  }

  const now = Date.now();
  const candidates = input.links
    .filter((l) => l.status === "ACTIVE")
    .filter((l) => l.expiresAt.getTime() > now)
    .filter((l) => l.storageLimit - l.storageUsed >= input.fileSize);

  if (candidates.length === 0) {
    if (input.links.length === 0) return null;
    throw new NoSpaceError(
      "no linked account has enough free space for this file. Link more Google accounts or free up space."
    );
  }

  // Sort: largest freeBytes first, then least-recently-used.
  candidates.sort((a, b) => {
    const freeA = a.storageLimit - a.storageUsed;
    const freeB = b.storageLimit - b.storageUsed;
    if (freeA > freeB) return -1;
    if (freeA < freeB) return 1;

    // Tie: prefer null lastUsedAt (never used), then older timestamps.
    const tA = a.lastUsedAt ? a.lastUsedAt.getTime() : -Infinity;
    const tB = b.lastUsedAt ? b.lastUsedAt.getTime() : -Infinity;
    if (tA < tB) return -1; // older = lower timestamp = comes first
    if (tA > tB) return 1;
    return 0;
  });

  return candidates[0];
}
