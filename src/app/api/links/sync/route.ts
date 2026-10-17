/**
 * POST /api/links/sync — refresh storageUsed/storageLimit for the signed-in
 * user's links by hitting each one's `drive.about.get`.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { syncUserLinks } from "@/server/storage/sync";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  // Per-user: 6 syncs / minute. Sync makes N Drive calls — don't let a user
  // refresh-spam the dashboard.
  const rl = rateLimit({ key: `sync:${auth.user.userId}`, limit: 6, windowMs: 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const summary = await syncUserLinks(auth.user.userId);
  return NextResponse.json(summary);
}
