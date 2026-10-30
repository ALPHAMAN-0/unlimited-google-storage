import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Cloud, Plus, LogOut } from "lucide-react";
import { AccountCard, type AccountCardData } from "@/components/account-card";
import { UploadDropzone } from "@/components/upload-dropzone";
import { FileTable, type FileRow } from "@/components/file-table";
import { SyncButton } from "@/components/sync-button";
import { formatBytes } from "@/lib/format";
import { ensureCsrfToken, clearCsrfToken } from "@/lib/csrf";
import { sanitizeLinkError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const userId = (session.user as { id?: string }).id!;
  const userEmail = session.user.email ?? "";

  // Issue the CSRF token and hand it to the client components so they can
  // attach it to state-changing requests. The cookie itself is httpOnly.
  const csrfToken = await ensureCsrfToken();

  // Never reflect an arbitrary error string into the page. Sanitise it to a
  // short, safe, human-readable token first.
  const linkError = sp.link_error ? sanitizeLinkError(sp.link_error) : null;

  const [links, files, totals] = await Promise.all([
    prisma.googleLink.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        googleEmail: true,
        status: true,
        storageUsed: true,
        storageLimit: true,
        lastSyncedAt: true,
        lastUsedAt: true,
      },
    }),
    prisma.file.findMany({
      where: { userId, deletedAt: null },
      take: 100,
      orderBy: { uploadedAt: "desc" },
      include: { googleLink: { select: { googleEmail: true } } },
    }),
    prisma.googleLink.aggregate({
      where: { userId, status: "ACTIVE" },
      _sum: { storageUsed: true, storageLimit: true },
    }),
  ]);

  const accountData: AccountCardData[] = links.map((l) => ({
    id: l.id,
    googleEmail: l.googleEmail,
    status: l.status,
    storageUsed: l.storageUsed.toString(),
    storageLimit: l.storageLimit.toString(),
    freeBytes: (l.storageLimit - l.storageUsed).toString(),
    usedDisplay: formatBytes(l.storageUsed),
    limitDisplay: formatBytes(l.storageLimit),
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
  }));

  const fileRows: FileRow[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size.toString(),
    sizeDisplay: formatBytes(f.size),
    googleEmail: f.googleLink.googleEmail,
    uploadedAt: f.uploadedAt.toISOString(),
  }));

  const totalUsed = totals._sum.storageUsed ?? 0n;
  const totalLimit = totals._sum.storageLimit ?? 0n;

  async function logout() {
    "use server";
    // Drop the CSRF token alongside the session so a stale token can never
    // be reused after sign-out.
    await clearCsrfToken();
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Cloud className="h-5 w-5 text-primary" />
            <span>Unlimited Google Storage</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{userEmail}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {sp.linked && (
          <div
            role="status"
            className="rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300"
          >
            Google account linked.
          </div>
        )}
        {sp.link_error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Couldn&apos;t link that account: {linkError}
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Your Google accounts</h2>
              <p className="text-sm text-muted-foreground">
                {accountData.length === 0
                  ? "No accounts linked yet."
                  : `${accountData.length} account${accountData.length === 1 ? "" : "s"} linked • ${formatBytes(totalUsed)} of ${formatBytes(totalLimit)} used`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SyncButton csrfToken={csrfToken} />
              <Link href="/api/auth/link">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add another Google account
                </Button>
              </Link>
            </div>
          </div>

          {accountData.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <h3 className="font-semibold">Link your first Google account</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We&apos;ll request the <code>drive.file</code> scope so uploads can land in
                this account.
              </p>
              <Link href="/api/auth/link" className="inline-block mt-4">
                <Button>
                  <Plus className="h-4 w-4" />
                  Link a Google account
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accountData.map((a) => (
                <AccountCard key={a.id} account={a} csrfToken={csrfToken} />
              ))}
            </div>
          )}
        </section>

        {accountData.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Upload</h2>
            <UploadDropzone csrfToken={csrfToken} />
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold mb-4">Your files</h2>
          <FileTable files={fileRows} csrfToken={csrfToken} />
        </section>
      </main>
    </div>
  );
}
