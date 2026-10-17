/**
 * GET /api/auth/link — start the "link a Google account" OAuth flow.
 *
 * Must be called while the user is signed in. Generates a CSRF state nonce,
 * stores it in a short-lived signed cookie, and 302s to Google's consent
 * screen with `prompt=consent` + offline access so we get a refresh_token.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAuthorizationUrl, setLinkStateCookie } from "@/server/auth/link-flow";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "session missing userId" }, { status: 401 });
  }

  // Per-user: 5 link attempts / 10 minutes. Linking requires Google's
  // consent screen; spam would be both wasteful and suspicious.
  const rl = rateLimit({ key: `link:${userId}`, limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.redirect(
      new URL(`/dashboard?link_error=rate_limited`, process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
  }

  const { state } = await setLinkStateCookie(userId);
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback/link`;
  const url = buildAuthorizationUrl({ state, redirectUri });
  return NextResponse.redirect(url);
}
