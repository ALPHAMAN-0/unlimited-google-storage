/**
 * GET /api/files/[id]/download — stream the file from Drive.
 *
 * Sets `Content-Disposition: attachment; filename="..."` so browsers
 * download rather than render. The `filename*` parameter with RFC 5987
 * encoding handles non-ASCII filenames (e.g., Korean, emoji).
 */
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/require-user";
import { openDownload } from "@/server/storage/downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rfc5987(name: string): string {
  return encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const file = await prisma.file.findUnique({
    where: { id },
    include: { googleLink: true },
  });
  if (!file || file.userId !== auth.user.userId || file.deletedAt) {
    return new Response("not found", { status: 404 });
  }

  const handle = await openDownload(file.googleLink, file);
  // Convert Node Readable -> Web ReadableStream for the Next.js Response.
  const webStream = nodeToWeb(handle.stream);

  return new Response(webStream, {
    headers: {
      "Content-Type": handle.mimeType,
      "Content-Length": handle.size.toString(),
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${rfc5987(handle.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

function nodeToWeb(node: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  // @ts-expect-error — Node 18+ has Readable.toWeb
  return node.Readable.toWeb ? node.Readable.toWeb() : importNodeToWeb(node);
}

async function importNodeToWeb(node: NodeJS.ReadableStream): Promise<ReadableStream<Uint8Array>> {
  const { Readable } = await import("node:stream");
  // The node Readable may or may not be a true Readable instance; convert.
  const r = node instanceof Readable ? node : Readable.from(node as AsyncIterable<Buffer>);
  // @ts-expect-error — Node 18+ types
  return Readable.toWeb(r);
}
