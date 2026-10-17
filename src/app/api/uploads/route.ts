/**
 * POST /api/uploads — upload a file.
 *
 * The client sends a `multipart/form-data` body with a single `file` part.
 * We stream the file into the best available linked account via the Google
 * Drive API. The response includes the resulting File row and the email of
 * the account that received the upload.
 */
import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/server/auth/require-user";
import { uploadFile, UploadValidationError } from "@/server/storage/uploader";
import { NoSpaceError } from "@/server/storage/picker";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Allow large bodies. Next.js will reject anything larger.
export const maxDuration = 300; // 5 minutes per request

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Per-user rate limit: 60 uploads / 10 minutes.
  const rl = rateLimit({ key: `upload:${auth.user.userId}`, limit: 60, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfterMs: rl.resetMs }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": `${Math.ceil(rl.resetMs / 1000)}` } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return jsonError(`Could not parse form data: ${(err as Error).message}`, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("missing 'file' field", 400);
  }
  if (BigInt(file.size) > env.MAX_UPLOAD_BYTES) {
    return jsonError(`file exceeds MAX_UPLOAD_BYTES (${env.MAX_UPLOAD_BYTES})`, 413);
  }

  try {
    const result = await uploadFile({
      userId: auth.user.userId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: BigInt(file.size),
      body: file.stream(),
    });
    return NextResponse.json({
      fileId: result.fileId,
      driveFileId: result.driveFileId,
      googleLinkId: result.googleLinkId,
      googleEmail: result.googleEmail,
      size: result.size.toString(),
    });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return jsonError(err.message, 400);
    }
    if (err instanceof NoSpaceError) {
      return jsonError(err.message, 507); // Insufficient Storage
    }
    const msg = err instanceof Error ? err.message : "upload_failed";
    return jsonError(msg, 500);
  }
}
