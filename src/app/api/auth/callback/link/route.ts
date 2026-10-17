/**
 * GET /api/auth/callback/link — Google redirect target.
 *
 * Verifies state (HMAC, single-use, 10-minute TTL), exchanges the code for
 * tokens, encrypts them, persists a GoogleLink row, and redirects to the
 * dashboard. Any failure in the chain returns an error page to the user.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  consumeLinkStateCookie,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "@/server/auth/link-flow";
import { encrypt } from "@/lib/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?link_error=${encodeURIComponent(error)}`, url.origin)
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: "missing code/state" }, { status: 400 });
  }

  const linkState = await consumeLinkStateCookie();
  if (!linkState) {
    return NextResponse.redirect(
      new URL("/dashboard?link_error=expired_state", url.origin)
    );
  }
  if (linkState.state !== state) {
    return NextResponse.redirect(
      new URL("/dashboard?link_error=state_mismatch", url.origin)
    );
  }

  const redirectUri = `${url.origin}/api/auth/callback/link`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.redirect(
      new URL(`/dashboard?link_error=${encodeURIComponent(msg)}`, url.origin)
    );
  }

  let profile;
  try {
    profile = await fetchGoogleUserInfo(tokens.access_token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "userinfo_failed";
    return NextResponse.redirect(
      new URL(`/dashboard?link_error=${encodeURIComponent(msg)}`, url.origin)
    );
  }

  if (!profile.email_verified) {
    return NextResponse.redirect(
      new URL("/dashboard?link_error=email_not_verified", url.origin)
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleLink.upsert({
    where: {
      userId_googleUserId: {
        userId: linkState.userId,
        googleUserId: profile.sub,
      },
    },
    update: {
      googleEmail: profile.email,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expiresAt,
      scope: tokens.scope,
      status: "ACTIVE",
    },
    create: {
      userId: linkState.userId,
      googleUserId: profile.sub,
      googleEmail: profile.email,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expiresAt,
      scope: tokens.scope,
    },
  });

  return NextResponse.redirect(new URL("/dashboard?linked=1", url.origin));
}
