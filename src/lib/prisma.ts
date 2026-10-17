import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton. In dev, Next.js hot-reload creates many module instances,
 * which would exhaust the database connection pool. We cache the client on
 * `globalThis` to avoid that.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
