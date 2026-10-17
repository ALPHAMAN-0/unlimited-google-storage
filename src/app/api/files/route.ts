/**
 * GET /api/files — list the signed-in user's files.
 *
 * Pagination via `?cursor=<id>&limit=<n>`. Returns up to 50 files (cap).
 * The list is sorted by uploadedAt desc; soft-deleted files are excluded.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/server/auth/require-user";
import { formatBytes } from "@/lib/format";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT)
  );

  const files = await prisma.file.findMany({
    where: { userId: auth.user.userId, deletedAt: null },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    include: { googleLink: { select: { googleEmail: true } } },
  });

  const hasMore = files.length > limit;
  const page = files.slice(0, limit);

  return NextResponse.json({
    files: page.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size.toString(),
      sizeDisplay: formatBytes(f.size),
      googleEmail: f.googleLink.googleEmail,
      googleLinkId: f.googleLinkId,
      uploadedAt: f.uploadedAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

/** DELETE /api/files — bulk delete (rarely used; per-file route is preferred). */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
    return jsonError("ids[] required", 400);
  }
  await prisma.file.updateMany({
    where: { id: { in: ids as string[] }, userId: auth.user.userId },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
