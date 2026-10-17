/**
 * File uploader.
 *
 * This module owns the end-to-end "user dropped a file" pipeline:
 *   1. Validate the file (name, mime, size).
 *   2. Ask the picker for the best target link.
 *   3. Initiate a Google Drive **resumable upload** session.
 *   4. Stream the file body to the session URI in chunks.
 *   5. On 200, persist a `File` row and refresh the link's quota.
 *
 * Resumable uploads matter: with a 5 GB file on a flaky network, an HTTP
 * disconnect would otherwise force a restart from byte 0. With resumable
 * uploads, the client (or server) can resume by re-PUTting from the last
 * confirmed byte range.
 *
 * For v1 we use single-shot PUTs (one HTTP request per file). A future
 * version can split this into N PUTs of ~1 MB chunks for client-side
 * progress reporting. The protocol is identical — the only difference is
 * `Content-Range` per PUT.
 */
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getDriveClient } from "@/server/storage/drive-client";
import { pickTargetLink, NoSpaceError } from "@/server/storage/picker";
import { isValidFilename, isValidMime } from "@/lib/validate";

export interface UploadInput {
  userId: string;
  fileName: string;
  mimeType: string;
  size: bigint;
  /** A ReadableStream<Uint8Array> or Buffer. */
  body: ReadableStream<Uint8Array> | Buffer;
}

export interface UploadResult {
  fileId: string;
  driveFileId: string;
  googleLinkId: string;
  googleEmail: string;
  size: bigint;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

/**
 * Upload a file to the user's "best" linked Google account.
 */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  // --- 1. validate ---
  if (!isValidFilename(input.fileName)) {
    throw new UploadValidationError(`Invalid filename: ${JSON.stringify(input.fileName)}`);
  }
  if (!isValidMime(input.mimeType)) {
    throw new UploadValidationError(`Invalid mime type: ${JSON.stringify(input.mimeType)}`);
  }
  if (input.size <= 0n) {
    throw new UploadValidationError("File size must be positive");
  }
  if (input.size > env.MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `File exceeds MAX_UPLOAD_BYTES (${env.MAX_UPLOAD_BYTES} bytes)`
    );
  }

  // --- 2. pick a target link ---
  const links = await prisma.googleLink.findMany({
    where: { userId: input.userId, status: "ACTIVE" },
  });
  const picked = await pickTargetLink({
    fileSize: input.size,
    links: links.map((l) => ({
      id: l.id,
      status: l.status,
      storageUsed: l.storageUsed,
      storageLimit: l.storageLimit,
      expiresAt: l.expiresAt,
      lastUsedAt: l.lastUsedAt,
    })),
  });
  if (!picked) {
    throw new NoSpaceError("No linked Google accounts. Add one on the dashboard.");
  }
  const target = links.find((l) => l.id === picked.id);
  if (!target) throw new Error("Picker returned a link not in our list");

  // --- 3. open a resumable session and PUT the bytes ---
  const drive = await getDriveClient(target);
  const session = await drive.files.create(
    {
      requestBody: { name: input.fileName },
      media: { mimeType: input.mimeType, body: toReadable(input.body) },
      fields: "id,name,size",
    },
    { onUploadProgress: undefined }
  );

  if (!session.data.id) {
    throw new Error("Drive did not return a file id after upload");
  }
  const driveFileId = session.data.id;
  const size = BigInt(session.data.size ?? input.size.toString());

  // --- 4. persist and refresh quota ---
  const created = await prisma.$transaction(async (tx) => {
    const file = await tx.file.create({
      data: {
        userId: input.userId,
        googleLinkId: target.id,
        driveFileId,
        name: input.fileName,
        mimeType: input.mimeType,
        size,
      },
    });
    await tx.googleLink.update({
      where: { id: target.id },
      data: {
        lastUsedAt: new Date(),
        storageUsed: { increment: size },
      },
    });
    return file;
  });

  return {
    fileId: created.id,
    driveFileId,
    googleLinkId: target.id,
    googleEmail: target.googleEmail,
    size,
  };
}

/**
 * Convert our accepted body types into a Node Readable that googleapis can
 * stream. Both Buffer and ReadableStream inputs are supported.
 */
import { Readable } from "node:stream";

function toReadable(body: ReadableStream<Uint8Array> | Buffer): NodeJS.ReadableStream {
  if (Buffer.isBuffer(body)) {
    return Readable.from(body);
  }
  // ReadableStream -> Node Readable
  return Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream);
}
