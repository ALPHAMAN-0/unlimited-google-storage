/**
 * Augments NextAuth's session type with our custom `userId` field.
 * Without this, `(session.user as any).id` would be the only way to read it.
 *
 * The `next-auth/jwt` augmentation is done inline in `src/lib/auth.ts` via
 * a `Record<string, unknown>` cast at the use-site rather than a module
 * augmentation, because next-auth v5 doesn't consistently export the JWT
 * type under moduleResolution: bundler.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
