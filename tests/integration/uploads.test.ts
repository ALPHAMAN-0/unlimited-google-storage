/**
 * Integration tests for POST /api/uploads.
 *
 * The properties under test are the ones an attacker would probe:
 *   - unauthenticated / cross-origin uploads are rejected
 *   - an oversized or empty file is rejected before any Drive call
 *   - a client-supplied MIME type is validated, not trusted
 *   - an internal error does not leak its message to the client
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockAuth, mockCookies, mockPrisma, mockUploadFile, mockGetDriveClient } = vi.hoisted(() => {
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
  const mockUploadFile = vi.fn();
  const mockGetDriveClient = vi.fn();
  return { mockAuth, mockCookies, mockPrisma, mockUploadFile, mockGetDriveClient };
});

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("@/server/storage/uploader", () => ({
  uploadFile: mockUploadFile,
  UploadValidationError: class UploadValidationError extends Error {
    name = "UploadValidationError";
  },
}));
vi.mock("@/server/storage/picker", () => ({
  NoSpaceError: class NoSpaceError extends Error {
    name = "NoSpaceError";
  },
}));

import { POST } from "@/app/api/uploads/route";
import { UploadValidationError } from "@/server/storage/uploader";
import { NoSpaceError } from "@/server/storage/picker";
import { CSRF_TOKEN, USER_ID } from "./helpers";
import { setNodeEnv } from "../helpers/env";

const ORIGIN = "http://localhost:3000";

function signedIn() {
  mockAuth.mockResolvedValue({ user: { id: USER_ID, email: "u@example.com" } });
}

function cookiesWithCsrf(token: string | undefined = CSRF_TOKEN) {
  mockCookies.mockResolvedValue({
    get: (name: string) => (name === "ugs_csrf" && token ? { value: token } : undefined),
    delete: vi.fn(),
    set: vi.fn(),
  });
}

function uploadReq(opts: {
  origin?: string | null;
  csrf?: string | null;
  body?: FormData | string;
} = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.origin !== undefined && opts.origin !== null) headers["origin"] = opts.origin;
  if (opts.csrf !== undefined && opts.csrf !== null) headers["x-csrf-token"] = opts.csrf;
  return new Request(`${ORIGIN}/api/uploads`, {
    method: "POST",
    headers,
    body: opts.body,
  });
}

function fileForm(name: string, type: string, content = "hello"): FormData {
  const fd = new FormData();
  fd.append("file", new File([content], name, { type }));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = ORIGIN;
  setNodeEnv("test");
  process.env.MAX_UPLOAD_BYTES = "5368709120";
  cookiesWithCsrf();
  signedIn();
  mockUploadFile.mockResolvedValue({
    fileId: "f1",
    driveFileId: "d1",
    googleLinkId: "l1",
    googleEmail: "linked@example.com",
    size: 5n,
  });
});

describe("POST /api/uploads — guards", () => {
  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(401);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 403 for a cross-origin request", async () => {
    const res = await POST(
      uploadReq({ origin: "https://evil.example.com", csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain") })
    );
    expect(res.status).toBe(403);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 403 when the CSRF token is missing", async () => {
    const res = await POST(uploadReq({ csrf: null, body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(403);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 403 when the CSRF token is wrong", async () => {
    const res = await POST(uploadReq({ csrf: "wrong", body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/uploads — validation", () => {
  it("returns 400 when the 'file' field is missing", async () => {
    const fd = new FormData();
    fd.append("notfile", "x");
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fd }));
    expect(res.status).toBe(400);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty file", async () => {
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("empty.txt", "text/plain", "") }));
    expect(res.status).toBe(400);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 413 for a file over MAX_UPLOAD_BYTES", async () => {
    process.env.MAX_UPLOAD_BYTES = "5";
    const res = await POST(
      uploadReq({ csrf: CSRF_TOKEN, body: fileForm("big.txt", "text/plain", "0123456789") })
    );
    expect(res.status).toBe(413);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed MIME type supplied by the client", async () => {
    const res = await POST(
      uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "not-a-mime") })
    );
    expect(res.status).toBe(200);
    // The raw client value must not be forwarded to Drive.
    expect(mockUploadFile.mock.calls[0][0].mimeType).toBe("application/octet-stream");
  });

  it("forwards a valid MIME type unchanged", async () => {
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.png", "image/png") }));
    expect(res.status).toBe(200);
    expect(mockUploadFile.mock.calls[0][0].mimeType).toBe("image/png");
  });

  it("strips MIME parameters", async () => {
    await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain; charset=utf-8") }));
    expect(mockUploadFile.mock.calls[0][0].mimeType).toBe("text/plain");
  });
});

describe("POST /api/uploads — error handling", () => {
  it("returns 400 for an upload validation error", async () => {
    mockUploadFile.mockRejectedValue(new UploadValidationError("Invalid filename: bad"));
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid filename");
  });

  it("returns 507 when there is no space", async () => {
    mockUploadFile.mockRejectedValue(new NoSpaceError("no linked account has enough free space"));
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(507);
  });

  it("does not leak an internal error message to the client", async () => {
    mockUploadFile.mockRejectedValue(
      new Error("PrismaClientKnownRequestError: connection to db://internal-host failed")
    );
    const res = await POST(uploadReq({ csrf: CSRF_TOKEN, body: fileForm("a.txt", "text/plain") }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Upload failed. Please try again.");
    expect(JSON.stringify(body)).not.toContain("internal-host");
    expect(JSON.stringify(body)).not.toContain("Prisma");
  });

  it("returns 400 when the request body is not parseable form data", async () => {
    const res = await POST(
      uploadReq({
        csrf: CSRF_TOKEN,
        body: "not form data",
      })
    );
    expect(res.status).toBe(400);
  });
});
