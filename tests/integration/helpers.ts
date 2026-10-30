/**
 * Shared test helpers for API-route integration tests.
 *
 * These mocks replace the three things our route handlers depend on that we
 * cannot reach in a unit test: the NextAuth session, the Prisma database,
 * and the Google Drive API.
 */
import { vi } from "vitest";

export const USER_ID = "user-under-test";
export const OTHER_USER_ID = "user-someone-else";

/** The CSRF token the mocked cookie store will hand back. */
export const CSRF_TOKEN = "test-csrf-token-value";

/**
 * A tiny in-memory stand-in for the Prisma client.
 *
 * It records the `where` clauses it is called with so tests can assert that
 * ownership filters are actually applied — that is the core of the IDOR
 * checks we want to guarantee.
 */
export interface FakePrisma {
  googleLink: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  file: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: {
    upsert: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  /** Every call made, in order, for assertions. */
  calls: Array<{ model: string; method: string; args: unknown[] }>;
}

export function createFakePrisma(): FakePrisma {
  const calls: FakePrisma["calls"] = [];

  function track(model: string, method: string) {
    return (...args: unknown[]) => {
      calls.push({ model, method, args });
    };
  }

  const prisma: FakePrisma = {
    calls,
    googleLink: {
      findMany: vi.fn(track("googleLink", "findMany")),
      findUnique: vi.fn(track("googleLink", "findUnique")),
      update: vi.fn(track("googleLink", "update")),
      delete: vi.fn(track("googleLink", "delete")),
      upsert: vi.fn(track("googleLink", "upsert")),
      aggregate: vi.fn(track("googleLink", "aggregate")),
    },
    file: {
      findMany: vi.fn(track("file", "findMany")),
      findUnique: vi.fn(track("file", "findUnique")),
      update: vi.fn(track("file", "update")),
      updateMany: vi.fn(track("file", "updateMany")),
      create: vi.fn(track("file", "create")),
    },
    user: {
      upsert: vi.fn(track("user", "upsert")),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    $queryRaw: vi.fn(async () => [{ "1": 1 }]),
  };

  return prisma;
}

/**
 * Build a `Request` with the headers a real browser would send.
 */
export function makeRequest(
  url: string,
  opts: {
    method?: string;
    origin?: string | null;
    csrf?: string | null;
    referer?: string | null;
    headers?: Record<string, string>;
    body?: BodyInit | null;
  } = {}
): Request {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };

  if (opts.origin !== null) headers["origin"] = opts.origin ?? "http://localhost:3000";
  if (opts.referer !== null) headers["referer"] = opts.referer ?? "http://localhost:3000/dashboard";
  if (opts.csrf !== null) headers["x-csrf-token"] = opts.csrf ?? CSRF_TOKEN;

  return new Request(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ?? undefined,
  });
}
