/**
 * File downloader.
 *
 * Streams a Drive file's content back through a Next.js response. We do NOT
 * buffer the file in memory: a 4 GB download cannot sit in a Node heap. The
 * googleapis `media.get` method returns a stream that we pipe into the
 * Next.js Web Response.
 */
import type { GoogleLink, File as DbFile } from "@prisma/client";
import { getDriveClient } from "@/server/storage/drive-client";

export interface DownloadHandle {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  fileName: string;
  size: bigint;
}

export async function openDownload(
  link: GoogleLink,
  file: DbFile
): Promise<DownloadHandle> {
  const drive = await getDriveClient(link);
  const res = await drive.files.get(
    { fileId: file.driveFileId, alt: "media", supportsAllDrives: false },
    { responseType: "stream" }
  );
  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    mimeType: file.mimeType,
    fileName: file.name,
    size: file.size,
  };
}
