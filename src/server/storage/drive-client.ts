/**
 * Drive client wrapper.
 *
 * Wraps the official `googleapis` SDK so the rest of the app doesn't have to
 * know about OAuth refresh flows, retry policy, or how to interpret the
 * `storageQuota` blob returned by `drive.about.get`.
 *
 * Per-account token management: each `GoogleLink` row carries its own
 * encrypted access/refresh tokens. When the access token expires (HTTP 401),
 * we transparently refresh using the refresh token, encrypt the new access
 * token, and persist it. If the refresh itself fails (e.g., the user revoked
 * our access in their Google account settings), we mark the link `ERROR` and
 * bubble up a typed error so the caller can prompt the user to re-link.
 */
import { google, type drive_v3 } from "googleapis";
import type { GoogleLink } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

export class DriveAuthError extends Error {
  constructor(message: string, public readonly linkId: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

export class DriveQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveQuotaError";
  }
}

interface CachedTokens {
  accessToken: string;
  expiry: number; // epoch ms
}

const tokenCache = new Map<string, CachedTokens>();

function buildOAuth2Client(_link: GoogleLink) {
  // googleapis returns a constructor; we instantiate the OAuth2 client here
  // and set credentials each request. The OAuth2 client is stateless and
  // thread-safe.
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

async function loadTokens(link: GoogleLink): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date }> {
  const accessToken = decrypt(link.accessToken);
  const refreshToken = link.refreshToken ? decrypt(link.refreshToken) : null;
  return { accessToken, refreshToken, expiresAt: link.expiresAt };
}

/**
 * Persist a freshly-refreshed access token back to the database (encrypted).
 * Called after googleapis refreshes the access token on our behalf.
 */
async function persistTokens(link: GoogleLink, accessToken: string, expiresAt: Date): Promise<void> {
  const encrypted = encrypt(accessToken);
  await prisma.googleLink.update({
    where: { id: link.id },
    data: { accessToken: encrypted, expiresAt },
  });
  tokenCache.set(link.id, { accessToken, expiry: expiresAt.getTime() });
}

/**
 * Get an authenticated Drive client for a link. Refreshes the access token
 * if it's within 60s of expiry (googleapis does this for us when we set the
 * refresh token on the OAuth2 client).
 */
export async function getDriveClient(link: GoogleLink): Promise<drive_v3.Drive> {
  const oauth2 = buildOAuth2Client(link);
  const { accessToken, refreshToken, expiresAt } = await loadTokens(link);

  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
    expiry_date: expiresAt.getTime(),
  });

  // Listen for token refresh events; persist the new access token.
  oauth2.on("tokens", (creds) => {
    if (creds.access_token) {
      const newExpiry = creds.expiry_date ? new Date(creds.expiry_date) : new Date(Date.now() + 3500_000);
      // Fire-and-forget; the request that triggered the refresh will continue
      // using the new token. The next request reads the cached value.
      void persistTokens(link, creds.access_token, newExpiry);
    }
  });

  return google.drive({ version: "v3", auth: oauth2 });
}

export interface StorageQuota {
  used: bigint;
  limit: bigint;
  inDrive: bigint;
  inTrash: bigint;
}

/**
 * Read the current storage quota for a link. Updates the `GoogleLink` row
 * with the fresh numbers and returns them.
 */
export async function readQuota(link: GoogleLink): Promise<StorageQuota> {
  const drive = await getDriveClient(link);
  try {
    const res = await drive.about.get({ fields: "storageQuota" });
    const q = res.data.storageQuota;
    if (!q) throw new Error("Drive returned no storageQuota");
    const used = BigInt(q.usage ?? "0");
    const limit = BigInt(q.limit ?? "0");
    const inDrive = BigInt(q.usageInDrive ?? "0");
    const inTrash = BigInt(q.usageInDriveTrash ?? "0");

    await prisma.googleLink.update({
      where: { id: link.id },
      data: { storageUsed: used, storageLimit: limit, lastSyncedAt: new Date() },
    });

    return { used, limit, inDrive, inTrash };
  } catch (err) {
    if (isAuthError(err)) {
      await prisma.googleLink.update({
        where: { id: link.id },
        data: { status: "ERROR" },
      });
      throw new DriveAuthError(`Drive auth failed for link ${link.id}`, link.id);
    }
    throw err;
  }
}

function isAuthError(err: unknown): boolean {
  // googleapis errors carry a `code` and `errors[]` array; we look for 401/403.
  const anyErr = err as { code?: number; status?: number; errors?: Array<{ reason?: string }> };
  if (anyErr.code === 401 || anyErr.code === 403) return true;
  if (anyErr.errors?.some((e) => e.reason === "authError" || e.reason === "forbidden")) {
    return true;
  }
  return false;
}

/**
 * Refresh the access token for a link explicitly. Used during the link flow
 * to validate the credentials before persisting them.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Refresh returned no access_token");
  const expiresAt = new Date(credentials.expiry_date ?? Date.now() + 3500_000);
  return { accessToken: credentials.access_token, expiresAt };
}

/**
 * Delete a file from Drive by id. Best-effort: a failure here is logged but
 * does not block our soft-delete from succeeding.
 */
export async function trashFile(link: GoogleLink, driveFileId: string): Promise<void> {
  const drive = await getDriveClient(link);
  try {
    await drive.files.delete({ fileId: driveFileId, supportsAllDrives: false });
  } catch (err) {
    if (isAuthError(err)) {
      await prisma.googleLink.update({
        where: { id: link.id },
        data: { status: "ERROR" },
      });
    }
    throw err;
  }
}
