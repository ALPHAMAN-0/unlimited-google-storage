/**
 * DELETE /api/links/[id] — unlink a Google account.
 *
 * Verifies ownership, then revokes the refresh token with Google (best-effort)
 * and deletes the row. Files that lived on this link are *not* deleted from
 * Drive — the user might want to keep them — but the row is removed from our
 * index, so the dashboard stops showing them.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserForMutation } from "@/server/auth/require-user";
import { decrypt } from "@/lib/crypto";
import { revokeGoogleToken } from "@/server/auth/link-flow";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUserForMutation(req);
  if (!auth.ok) return auth.response;

  const link = await prisma.googleLink.findUnique({ where: { id } });
  if (!link || link.userId !== auth.user.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Best-effort revocation.
  try {
    const refresh = link.refreshToken ? decrypt(link.refreshToken) : null;
    if (refresh) await revokeGoogleToken(refresh);
  } catch {
    /* ignore */
  }

  await prisma.googleLink.delete({ where: { id: link.id } });

  return NextResponse.json({ ok: true });
}
