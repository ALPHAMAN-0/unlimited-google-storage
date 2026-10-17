import Link from "next/link";
import { ArrowRight, Cloud, Lock, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Cloud className="h-5 w-5 text-primary" />
            <span>Unlimited Google Storage</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button>Sign in</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>Link N Google accounts → get N × 15 GB</span>
            </div>
            <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
              One dashboard.
              <br />
              <span className="text-primary">Unlimited</span> free storage.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Every Google account ships with 15 GB of free Drive storage. Link as many
              accounts as you own, then drop files into the dashboard — we&apos;ll route
              each upload to the account with the most free space, automatically.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link href="/login">
                <Button size="lg">
                  Get started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="https://github.com/ALPHAMAN-0/unlimited-google-storage" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline">
                  View on GitHub
                </Button>
              </a>
            </div>
          </div>
        </section>

        <section className="container pb-24">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            <Feature
              icon={<Zap className="h-5 w-5" />}
              title="Auto-distribute uploads"
              description="The picker always chooses the linked account with the most free space. Drop a 50 GB folder; we spread it for you."
            />
            <Feature
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Minimal Drive scope"
              description="We only request the drive.file scope, so we can read or modify files we created through the app — never your existing Drive."
            />
            <Feature
              icon={<Lock className="h-5 w-5" />}
              title="Encrypted tokens at rest"
              description="OAuth refresh tokens are AES-256-GCM encrypted in the database. A database leak can&apos;t compromise your Drive."
            />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container py-6 text-sm text-muted-foreground flex items-center justify-between">
          <span>© 2026 Unlimited Google Storage. MIT licensed.</span>
          <a
            href="https://github.com/ALPHAMAN-0/unlimited-google-storage"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            github.com/ALPHAMAN-0/unlimited-google-storage
          </a>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
