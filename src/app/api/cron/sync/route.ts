/**
 * POST /api/cron/sync — Vercel Cron entry point.
 *
 * Protected by the `CRON_SECRET` env var: the caller (Vercel) sends it as
 * a `x-cron-secret` header. Refreshes the storage meter for every active
 * link in the database.
 */
import { NextResponse } from "next/server";
import { syncAllLinks } from "@/server/storage/sync";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const got = req.headers.get("x-cron-secret");
  if (got !== env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const summary = await syncAllLinks();
  return NextResponse.json(summary);
}
