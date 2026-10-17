/**
 * Quota sync helpers.
 *
 * `readQuota(link)` already persists a fresh `storageUsed`/`storageLimit`
 * on each call. This module is the small wrapper that loops over a user's
 * links (or all users, for the cron) and tolerates per-link failures.
 */
import { prisma } from "@/lib/prisma";
import { readQuota } from "@/server/storage/drive-client";

export interface SyncSummary {
  total: number;
  ok: number;
  failed: number;
  failures: Array<{ linkId: string; reason: string }>;
}

export async function syncUserLinks(userId: string): Promise<SyncSummary> {
  const links = await prisma.googleLink.findMany({
    where: { userId, status: "ACTIVE" },
  });
  return syncLinks(links.map((l) => l.id));
}

export async function syncAllLinks(): Promise<SyncSummary> {
  const links = await prisma.googleLink.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  return syncLinks(links.map((l) => l.id));
}

async function syncLinks(linkIds: string[]): Promise<SyncSummary> {
  const summary: SyncSummary = { total: linkIds.length, ok: 0, failed: 0, failures: [] };
  for (const id of linkIds) {
    try {
      const link = await prisma.googleLink.findUnique({ where: { id } });
      if (!link) continue;
      await readQuota(link);
      summary.ok += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({
        linkId: id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return summary;
}
