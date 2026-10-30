"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCsrf } from "@/lib/use-csrf";

export interface AccountCardData {
  id: string;
  googleEmail: string;
  status: "ACTIVE" | "REVOKED" | "ERROR";
  storageUsed: string;
  storageLimit: string;
  freeBytes: string;
  usedDisplay: string;
  limitDisplay: string;
  lastSyncedAt: string | null;
}

export function AccountCard({ account, csrfToken }: { account: AccountCardData; csrfToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { withCsrf } = useCsrf(csrfToken);

  const used = BigInt(account.storageUsed);
  const limit = BigInt(account.storageLimit);
  const pct = limit > 0n ? Number((used * 10000n) / limit) / 100 : 0;

  async function unlink() {
    if (!confirm(`Unlink ${account.googleEmail}? Files stored on this account stay in Drive but will disappear from this dashboard.`)) {
      return;
    }
    setErr(null);
    const res = await fetch(`/api/links/${account.id}`, withCsrf({ method: "DELETE" }));
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to unlink");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate" title={account.googleEmail}>
              {account.googleEmail}
            </CardTitle>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {account.status === "ACTIVE" && (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> active
                </span>
              )}
              {account.status === "ERROR" && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> needs re-link
                </span>
              )}
              {account.status === "REVOKED" && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  revoked
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={unlink}
            disabled={pending}
            aria-label="Unlink account"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span>
              {account.usedDisplay} / {account.limitDisplay}
            </span>
          </div>
          <Progress value={pct} aria-label={`${pct}% used`} />
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
