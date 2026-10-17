/**
 * NextAuth v5 (Auth.js) configuration.
 *
 * Two distinct flows use the same Google OAuth client:
 *   1. Sign-in  — `/api/auth/[...nextauth]`. The user picks one Google account
 *      to sign in with. That account is the *primary* one and creates the
 *      `User` row.
 *   2. Link     — `/api/auth/link` + `/api/auth/callback/link`. A signed-in
 *      user adds another Google account. Tokens are encrypted and stored on
 *      a `GoogleLink` row. The account picker can then route uploads to it.
 *
 * The sign-in flow is intentionally minimal: we don't store the sign-in
 * account's tokens (no refresh token, no Drive access). Drive access is only
 * granted when the user explicitly clicks "Add another Google account".
 *
 * JWT strategy: the session is a stateless JWT containing `userId`. This
 * avoids a DB round-trip on every request and means we have nothing to
 * invalidate server-side (a deliberate choice — we don't currently support
 * forced sign-out, and JWTs expire in 30 days).
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // We only need basic profile + email from the sign-in flow. Drive scope
      // is requested separately during the link flow.
      authorization: {
        params: { scope: "openid email profile" },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 days
  callbacks: {
    async signIn({ user }) {
      // Allow any Google account to sign in; the database upsert is handled
      // by the events hook below (or by a manual upsert in the link flow).
      return !!user?.email;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        // On first sign-in, look up or create the User row and stash the id
        // on the token. Subsequent calls hit the database only when the
        // token doesn't carry a userId yet.
        const { prisma } = await import("@/lib/prisma");
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name ?? undefined, image: user.image ?? undefined },
          create: { email: user.email, name: user.name ?? null, image: user.image ?? null },
        });
        token.userId = dbUser.id;
        token.email = dbUser.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
