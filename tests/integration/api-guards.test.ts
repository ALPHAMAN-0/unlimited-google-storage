/**
 * Integration tests for the API route guards.
 *
 * These exercise the real route handlers with the session, the database and
 * the Drive API mocked out. The properties under test are security
 * properties, so they are asserted end-to-end through the route function:
 *
 *   - unauthenticated requests are rejected with 401
 *   - cross-origin state-changing requests are rejected with 403 (CSRF)
 *   - a request with a wrong/missing CSRF token is rejected with 403
 *   - a request for another user's resource is rejected with 404 (IDOR)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockAuth, mockCookies, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn();
  const mockCookies = vi.fn();
  const mockPrisma = {
    googleLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      aggregate: vi.fn(),
    },
    file: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: { upsert: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { mockAuth, mockCookies, mockPrisma };
});

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("@/server/storage/drive-client", () => ({
  trashFile: vi.fn(async () => undefined),
  getDriveClient: vi.fn(),
}));
vi.mock("@/server/storage/sync", () => ({
  syncUserLinks: vi.fn(async () => ({ total: 0, ok: 0, failed: 0, failures: [] })),
  syncAllLinks: vi.fn(async () => ({ total: 0, ok: 0, failed: 0, failures: [] })),
}));

import { GET as listFiles, DELETE as bulkDeleteFiles } from "@/app/api/files/route";
import { DELETE as deleteFile } from "@/app/api/files/[id]/route";
import { GET as downloadFile } from "@/app/api/files/[id]/download/route";
import { GET as listLinks } from "@/app/api/links/route";
import { DELETE as unlinkAccount } from "@/app/api/links/[id]/route";
import { POST as syncLinks } from "@/app/api/links/sync/route";

import { CSRF_TOKEN, USER_ID, OTHER_USER_ID } from "./helpers";
import { setNodeEnv } from "../helpers/env";

const ORIGIN = "http://localhost:3000";

function signedIn(userId: string = USER_ID) {
  mockAuth.mockResolvedValue({ user: { id: userId, email: "u@example.com" } });
}

function signedOut() {
  mockAuth.mockResolvedValue(null);
}

function cookiesWithCsrf(token: string | undefined = CSRF_TOKEN) {
  mockCookies.mockResolvedValue({
    get: (name: string) => (name === "ugs_csrf" && token ? { value: token } : undefined),
    delete: vi.fn(),
    set: vi.fn(),
  });
}

function req(
  url: string,
  opts: {
    method?: string;
    origin?: string | null;
    csrf?: string | null;
    headers?: Record<string, string>;
    body?: string;
  } = {}
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.origin !== null && opts.origin !== undefined) headers["origin"] = opts.origin;
  if (opts.csrf !== undefined && opts.csrf !== null) headers["x-csrf-token"] = opts.csrf;
  return new Request(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = ORIGIN;
  setNodeEnv("test");
  cookiesWithCsrf();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.file.findMany.mockResolvedValue([]);
  mockPrisma.googleLink.findMany.mockResolvedValue([]);
});

describe("authentication guard", () => {
  it("GET /api/files returns 401 when signed out", async () => {
    signedOut();
    const res = await listFiles(req(`${ORIGIN}/api/files`));
    expect(res.status).toBe(401);
  });

  it("GET /api/links returns 401 when signed out", async () => {
    signedOut();
    const res = await listLinks();
    expect(res.status).toBe(401);
  });

  it("POST /api/links/sync returns 401 when signed out", async () => {
    signedOut();
    const res = await syncLinks(req(`${ORIGIN}/api/links/sync`, { method: "POST", csrf: CSRF_TOKEN }));
    expect(res.status).toBe(401);
  });

  it("GET /api/files/[id]/download returns 401 when signed out", async () => {
    signedOut();
    const res = await downloadFile(req(`${ORIGIN}/api/files/x/download`), ctx("x"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/files/[id] returns 401 when signed out", async () => {
    signedOut();
    const res = await deleteFile(req(`${ORIGIN}/api/files/x`, { method: "DELETE", csrf: CSRF_TOKEN }), ctx("x"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/links/[id] returns 401 when signed out", async () => {
    signedOut();
    const res = await unlinkAccount(req(`${ORIGIN}/api/links/x`, { method: "DELETE", csrf: CSRF_TOKEN }), ctx("x"));
    expect(res.status).toBe(401);
  });
});

describe("CSRF guard on mutating routes", () => {
  it("POST /api/links/sync rejects a cross-origin request with 403", async () => {
    signedIn();
    const res = await syncLinks(
      req(`${ORIGIN}/api/links/sync`, { method: "POST", origin: "https://evil.example.com", csrf: CSRF_TOKEN })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("POST /api/links/sync rejects a missing CSRF token with 403", async () => {
    signedIn();
    const res = await syncLinks(req(`${ORIGIN}/api/links/sync`, { method: "POST", csrf: null }));
    expect(res.status).toBe(403);
  });

  it("POST /api/links/sync rejects a wrong CSRF token with 403", async () => {
    signedIn();
    const res = await syncLinks(req(`${ORIGIN}/api/links/sync`, { method: "POST", csrf: "wrong-token" }));
    expect(res.status).toBe(403);
  });

  it("POST /api/links/sync accepts a same-origin request with a valid token", async () => {
    signedIn();
    const res = await syncLinks(req(`${ORIGIN}/api/links/sync`, { method: "POST", csrf: CSRF_TOKEN }));
    expect(res.status).toBe(200);
  });

  it("DELETE /api/files rejects a cross-origin request with 403", async () => {
    signedIn();
    const res = await bulkDeleteFiles(
      req(`${ORIGIN}/api/files`, {
        method: "DELETE",
        origin: "https://evil.example.com",
        csrf: CSRF_TOKEN,
      })
    );
    expect(res.status).toBe(403);
  });

  it("DELETE /api/files/[id] rejects a cross-origin request with 403", async () => {
    signedIn();
    const res = await deleteFile(
      req(`${ORIGIN}/api/files/f1`, { method: "DELETE", origin: "https://evil.example.com", csrf: CSRF_TOKEN }),
      ctx("f1")
    );
    expect(res.status).toBe(403);
  });

  it("DELETE /api/links/[id] rejects a cross-origin request with 403", async () => {
    signedIn();
    const res = await unlinkAccount(
      req(`${ORIGIN}/api/links/l1`, { method: "DELETE", origin: "https://evil.example.com", csrf: CSRF_TOKEN }),
      ctx("l1")
    );
    expect(res.status).toBe(403);
  });

  it("rejects before touching the database", async () => {
    signedIn();
    await deleteFile(
      req(`${ORIGIN}/api/files/f1`, { method: "DELETE", origin: "https://evil.example.com", csrf: CSRF_TOKEN }),
      ctx("f1")
    );
    expect(mockPrisma.file.update).not.toHaveBeenCalled();
  });
});

describe("IDOR / ownership enforcement", () => {
  it("GET /api/files scopes the query to the signed-in user", async () => {
    signedIn();
    await listFiles(req(`${ORIGIN}/api/files`));
    expect(mockPrisma.file.findMany).toHaveBeenCalled();
    const where = mockPrisma.file.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(USER_ID);
    expect(where.deletedAt).toBeNull();
  });

  it("DELETE /api/files/[id] returns 404 for another user's file", async () => {
    signedIn();
    mockPrisma.file.findUnique.mockResolvedValue({
      id: "f1",
      userId: OTHER_USER_ID,
      driveFileId: "d1",
      deletedAt: null,
      googleLink: { id: "l1" },
    });
    const res = await deleteFile(
      req(`${ORIGIN}/api/files/f1`, { method: "DELETE", csrf: CSRF_TOKEN }),
      ctx("f1")
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.file.update).not.toHaveBeenCalled();
  });

  it("GET /api/files/[id]/download returns 404 for another user's file", async () => {
    signedIn();
    mockPrisma.file.findUnique.mockResolvedValue({
      id: "f1",
      userId: OTHER_USER_ID,
      driveFileId: "d1",
      deletedAt: null,
      googleLink: { id: "l1" },
    });
    const res = await downloadFile(req(`${ORIGIN}/api/files/f1/download`), ctx("f1"));
    expect(res.status).toBe(404);
  });

  it("GET /api/files/[id]/download returns 404 for a soft-deleted file", async () => {
    signedIn();
    mockPrisma.file.findUnique.mockResolvedValue({
      id: "f1",
      userId: USER_ID,
      driveFileId: "d1",
      deletedAt: new Date(),
      googleLink: { id: "l1" },
    });
    const res = await downloadFile(req(`${ORIGIN}/api/files/f1/download`), ctx("f1"));
    expect(res.status).toBe(404);
  });

  it("DELETE /api/links/[id] returns 404 for another user's link", async () => {
    signedIn();
    mockPrisma.googleLink.findUnique.mockResolvedValue({
      id: "l1",
      userId: OTHER_USER_ID,
      refreshToken: null,
    });
    const res = await unlinkAccount(
      req(`${ORIGIN}/api/links/l1`, { method: "DELETE", csrf: CSRF_TOKEN }),
      ctx("l1")
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.googleLink.delete).not.toHaveBeenCalled();
  });

  it("DELETE /api/files scopes the bulk update to the signed-in user", async () => {
    signedIn();
    mockPrisma.file.updateMany.mockResolvedValue({ count: 0 });
    const res = await bulkDeleteFiles(
      req(`${ORIGIN}/api/files`, {
        method: "DELETE",
        csrf: CSRF_TOKEN,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["f1", "f2"] }),
      })
    );
    expect(res.status).toBe(200);
    const where = mockPrisma.file.updateMany.mock.calls[0][0].where;
    expect(where.userId).toBe(USER_ID);
    expect(where.id).toEqual({ in: ["f1", "f2"] });
  });
});

describe("input validation", () => {
  it("GET /api/files returns 400 for an invalid cursor instead of a 500", async () => {
    signedIn();
    mockPrisma.file.findMany.mockRejectedValue(
      Object.assign(new Error("cursor does not exist"), { code: "P2025" })
    );
    const res = await listFiles(req(`${ORIGIN}/api/files?cursor=nope`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid cursor");
  });

  it("DELETE /api/files returns 400 for a non-array ids field", async () => {
    signedIn();
    const res = await bulkDeleteFiles(
      req(`${ORIGIN}/api/files`, {
        method: "DELETE",
        csrf: CSRF_TOKEN,
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/files clamps the limit to a maximum of 50", async () => {
    signedIn();
    await listFiles(req(`${ORIGIN}/api/files?limit=9999`));
    expect(mockPrisma.file.findMany.mock.calls[0][0].take).toBe(51);
  });

  it("GET /api/files falls back to the default limit for a non-numeric value", async () => {
    signedIn();
    await listFiles(req(`${ORIGIN}/api/files?limit=abc`));
    expect(mockPrisma.file.findMany.mock.calls[0][0].take).toBe(26);
  });
});
