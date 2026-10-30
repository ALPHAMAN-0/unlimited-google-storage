/**
 * POST /api/cron/sync — Vercel Cron entry point.
 *
 * Protected by the `CRON_SECRET` env var: the caller (Vercel) sends it as
 * a `x-cron-secret` header. Refreshes the storage meter for every active
 * link in the database.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncAllLinks } from "@/server/storage/sync";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Constant-time secret comparison.
 *
 * A plain `!==` leaks the length of the matching prefix through timing
 * differences, which lets an attacker recover `CRON_SECRET` byte by byte.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const got = req.headers.get("x-cron-secret");
  if (!secretMatches(got, env.CRON_SECRET)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const summary = await syncAllLinks();
  return NextResponse.json(summary);
}
