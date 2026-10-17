/**
 * GET /api/links — list the signed-in user's linked Google accounts with
 * current storage numbers (in bytes). Used by the dashboard.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/require-user";
import { formatBytes } from "@/lib/format";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const links = await prisma.googleLink.findMany({
    where: { userId: auth.user.userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      googleEmail: true,
      status: true,
      storageUsed: true,
      storageLimit: true,
      lastSyncedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      googleEmail: l.googleEmail,
      status: l.status,
      storageUsed: l.storageUsed.toString(),
      storageLimit: l.storageLimit.toString(),
      freeBytes: (l.storageLimit - l.storageUsed).toString(),
      usedDisplay: formatBytes(l.storageUsed),
      limitDisplay: formatBytes(l.storageLimit),
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
      lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
