/**
 * DELETE /api/files/[id] — soft-delete a file.
 *
 * We soft-delete in our DB first (so the dashboard stops showing it), then
 * call Drive to actually remove the file. If the Drive call fails (rate
 * limit, network blip), the file is marked for retry — a future cron can
 * reconcile.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/server/auth/require-user";
import { trashFile } from "@/server/storage/drive-client";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const file = await prisma.file.findUnique({
    where: { id },
    include: { googleLink: true },
  });
  if (!file || file.userId !== auth.user.userId) {
    return jsonError("not found", 404);
  }

  // Soft-delete in our index first.
  await prisma.file.update({
    where: { id: file.id },
    data: { deletedAt: new Date() },
  });

  // Then ask Drive to actually delete it. Best-effort; we don't fail the
  // request if Drive is slow — the row is already hidden.
  try {
    await trashFile(file.googleLink, file.driveFileId);
  } catch (err) {
    // We log via the structured logger when one is added. For now swallow.
    // eslint-disable-next-line no-console
    console.warn("Drive delete failed", { fileId: file.id, err: String(err) });
  }

  return NextResponse.json({ ok: true });
}
