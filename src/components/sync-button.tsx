"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useCsrf } from "@/lib/use-csrf";

/**
 * "Refresh quota" button.
 *
 * This used to be a plain `<form action="/api/links/sync" method="post">`.
 * That form POST could not carry the CSRF token header, so the route is now
 * called via `fetch()` with the `x-csrf-token` header attached.
 */
export function SyncButton({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const { withCsrf } = useCsrf(csrfToken);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/links/sync", withCsrf({ method: "POST" }));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "rate_limited" ? "Too many refreshes — try again shortly." : "Refresh failed.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Refresh failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={sync} disabled={pending}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        Refresh
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
