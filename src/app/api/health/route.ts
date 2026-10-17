/**
 * GET /api/health — liveness probe.
 *
 * Returns 200 if the process is up and the database is reachable. Used by
 * uptime monitors and by Vercel's load balancer.
 */
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return Response.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: dbOk,
      time: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  );
}
