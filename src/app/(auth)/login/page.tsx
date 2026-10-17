import Link from "next/link";
import { Cloud } from "lucide-react";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  async function login() {
    "use server";
    await signIn("google", { redirectTo: "/dashboard" });
  }
  const errorMessage = errorMessageFor(sp.error);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Cloud className="h-5 w-5 text-primary" />
            <span>Unlimited Google Storage</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-lg border bg-card p-8 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with the Google account you want to use as your primary sign-in.
              You can link more Google accounts from the dashboard afterwards.
            </p>
            {errorMessage && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            )}
            <form action={login} className="mt-6">
              <Button type="submit" className="w-full" size="lg">
                <GoogleMark />
                Continue with Google
              </Button>
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              We only ask for <code>openid email profile</code> at sign-in. Drive access
              is requested separately when you link an account.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function errorMessageFor(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthAccountNotLinked":
      return "This email is already associated with another sign-in method.";
    case "AccessDenied":
      return "Access was denied. Please try again.";
    default:
      return `Sign-in failed (${code}). Please try again.`;
  }
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
